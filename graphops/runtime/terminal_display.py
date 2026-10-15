"""Readable terminal output; JSON mode uses one typed JSON record per line."""
from datetime import datetime
import json
import os
import re
import sys


def clean(value):
    text=re.sub(r'\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))','',str(value))
    return ''.join(c for c in text if c in '\n\t' or ord(c)>=32 and ord(c)!=127)


def table(headers, rows):
    rows=[[clean(value).replace('\n',' ') for value in row] for row in [headers,*rows]]
    widths=[min(66,max(len(row[i]) for row in rows)) for i in range(len(headers))]
    return '\n'.join('  '.join(value[:width].ljust(width) for value,width in zip(row,widths)).rstrip() for row in rows)


def event_record(event):
    data=event.get('data',{});kind=event['kind'];detail=''
    if kind=='tool':
        tool=data.get('tool','tool');result=data.get('result',{})
        detail=f"{tool} -> evidence {event['id']}"
        if tool=='execute_recovery':detail+=f" | measured success={result.get('success')} | target HTTP {result.get('before',{}).get('http_status')} -> {result.get('after',{}).get('http_status')} | gateway HTTP {result.get('incident',{}).get('http_status')}"
        elif tool=='handoff_target':detail+=f" | target={result.get('target') or result.get('service') or 'blocked'}"
        elif tool=='observe_service':detail+=f" | {result.get('service')} HTTP {result.get('http_status')}"
        elif tool=='prepare_recovery':
            detail+=f" | ready={result.get('ready')} plan={result.get('plan_id','none')}"
            if not result.get('ready') and result.get('reason'):detail+=' | '+result['reason']
    elif kind=='session_started':detail=f"session={event['session']} mode={data.get('mode')}"
    elif kind=='session_finished':detail=data.get('summary','Session finished')
    elif kind=='memory_saved':detail=f"{data.get('service')}: saved episodic, procedural and semantic evidence"
    elif kind=='model_request_started':detail=f"request={data.get('request')} inference in progress"
    elif kind=='model_timing':detail=f"request={data.get('request')} duration={data.get('duration_ms')}ms"
    elif kind in {'run_error','run_stopped','tool_error'}:detail=data.get('message') or data.get('error','')
    elif kind=='component_check':detail=f"model={data.get('model',{}).get('success')} MCP={data.get('mcp',{}).get('success')}"
    else:detail=json.dumps(data,ensure_ascii=True)
    module = 'Memory' if kind=='memory_saved' else {
        'company_context':'Company','search_company':'Company','read_source':'Company',
        'inspect_incident':'Graph','inspect_dependencies':'Graph','recall_memory':'Memory',
        'prepare_recovery':'Actions','execute_recovery':'Actions','complete_ticket':'Actions',
        'observe_service':'Actions','checkpoint':'Workspace',
    }.get(data.get('tool'),'Agent' if kind.startswith(('model_','session_')) else 'Workspace')
    return f"{event.get('time','')[11:19]} [{module}/{event.get('role','system')}] {kind}: {clean(detail)}"


class Display:
    def __init__(self,json_mode=False,plain=False,output=None):
        self.json_mode=json_mode;self.output=output or sys.stdout
        self.screen=not json_mode and not plain and self.output.isatty() and os.getenv('TERM')!='dumb'
        if self.screen and os.name=='nt':
            try:
                import ctypes
                from ctypes import wintypes
                kernel=ctypes.WinDLL('kernel32',use_last_error=True)
                kernel.GetStdHandle.argtypes=[wintypes.DWORD];kernel.GetStdHandle.restype=wintypes.HANDLE
                kernel.GetConsoleMode.argtypes=[wintypes.HANDLE,ctypes.POINTER(wintypes.DWORD)]
                kernel.SetConsoleMode.argtypes=[wintypes.HANDLE,wintypes.DWORD]
                handle=kernel.GetStdHandle(-11);mode=wintypes.DWORD()
                self.screen=bool(kernel.GetConsoleMode(handle,ctypes.byref(mode)) and kernel.SetConsoleMode(handle,mode.value|4))
            except (OSError,AttributeError):self.screen=False

    def emit(self,kind,data,text=None):
        if self.json_mode:print(json.dumps({'type':kind,**data},ensure_ascii=True),file=self.output,flush=True)
        elif text is not None:print(clean(text),file=self.output,flush=True)

    def value(self,data,text=None):
        print(json.dumps(data,ensure_ascii=True,indent=None if self.json_mode else 2) if self.json_mode or text is None else clean(text),file=self.output,flush=True)

    def event(self,event):self.emit('event',{'event':event},event_record(event))

    def dashboard(self,report):
        if self.json_mode:self.emit('monitor',{'monitor':report});return
        lines=['GRAPHOPS | COMPANY COPILOT | LIVE MONITOR',
            f"Workspace: {report.get('workspace','unavailable')}  Observed: {report.get('observed_at','unknown')}"]
        if report.get('model'):lines += [f"Model: {report['model']['provider']} / {report['model']['model']}"]
        if report.get('error'):lines+=['STATE: DEGRADED - '+report['error']]
        server=report.get('server',{})
        lines += [f"API worker connection: {server.get('worker','unknown')}  Supervisor restarts: {server.get('worker_restarts','unknown')}", '']
        lines += [table(['MODULE','STATE','DETAIL'],[[m['name'],m['status'],m['detail']] for m in report.get('modules',[])])]
        components=report.get('readiness',{}).get('components',{})
        lines+=['',table(['DEPENDENCY','STATE','OBSERVATION'],[[name,value['status'],value['message']] for name,value in components.items()])]
        selected=report.get('selected')
        if selected:
            lines+=['',f"RUN {selected['id']} | {selected['status']} | job={selected['job']} | target={selected.get('target') or '-'} | mode={selected['mode']}"]
            if selected.get('last_error'):lines+=['Run error: '+selected['last_error']]
            if selected.get('blocker'):lines+=['Blocker: '+selected['blocker']]
        if report.get('last_event'):lines+=['Latest: '+event_record(report['last_event'])[:240]]
        lines+=['',table(['PROCESS','PID','STATE','RSS MiB','CPU seconds','UPTIME seconds'],[
            [p['name'],p.get('pid') or '-', 'running' if p.get('running') else 'stopped',
             f"{p['rss_bytes']/1048576:.1f}" if p.get('rss_bytes') is not None else '-',
             round(p['cpu_seconds'],3) if p.get('cpu_seconds') is not None else '-',
             round(p['uptime_seconds'],1) if p.get('uptime_seconds') is not None else '-'] for p in report.get('processes',[])])]
        mcp=report.get('mcp',{})
        if mcp.get('last_reported_pid'):lines += [f"MCP session {mcp['session']} | last reported PID {mcp['last_reported_pid']} at {mcp['observed_at']} (not a heartbeat)"]
        lines+=['',table(['SERVICE','HTTP','HEALTH','REVISION'],[[h.get('service','?'),h.get('http_status',0),'healthy' if h.get('healthy') else 'degraded',h.get('revision','-')] for h in report.get('health',[])])]
        lines+=['','Ctrl+C detaches this monitor. Running server jobs continue. CPU is accumulated process time, not utilization.']
        if self.screen:self.output.write('\x1b[2J\x1b[H')
        print(clean('\n'.join(lines)),file=self.output,flush=True)
