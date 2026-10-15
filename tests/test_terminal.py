"""Terminal transport, monitoring and durable event checks; no live inference."""
import asyncio
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import httpx
from graphops.runtime.terminal import build_parser, follow_task, write_export
from graphops.runtime.terminal_client import ProductClient, TerminalError
from graphops.runtime.terminal_display import Display, clean, event_record
from graphops.workspace.processes import sample_process
from graphops.workspace.monitoring import monitor_workspace
from tests import test_event as fixtures


class TerminalUnit(unittest.TestCase):
    def test_parser_accepts_json_on_either_side_of_command(self):
        parser=build_parser()
        for args in (['--json','monitor','--once'],['monitor','--once','--json']):
            parsed=parser.parse_args(args);self.assertTrue(parsed.json);self.assertTrue(parsed.once)
        self.assertFalse(parser.parse_args(['run']).standalone)
        self.assertTrue(parser.parse_args(['--standalone','run']).standalone)

    def test_client_rejects_credential_urls_and_insecure_remote_origins(self):
        for value in ('http://remote.example','https://user:password@example.com','https://example.com/path','https://example.com/?key=secret','file:///local'):
            with self.assertRaises(TerminalError):ProductClient(value)

    def test_client_authenticates_without_exposing_token(self):
        calls=[]
        def handle(request):
            calls.append((request.url.path,request.headers.get('x-graphops')))
            if request.url.path=='/api/access':
                self.assertEqual(json.loads(request.content)['token'],'private-token')
                return httpx.Response(200,json={'authenticated':True},headers={'set-cookie':'graphops_access=valid; Path=/'})
            return httpx.Response(200,json={'ready':True}) if 'graphops_access=valid' in request.headers.get('cookie','') else httpx.Response(401,json={'error':'Access required'})
        with ProductClient('http://localhost:8080',token='private-token',transport=httpx.MockTransport(handle)) as client:
            self.assertTrue(client.get('/api/monitor')['ready'])
        self.assertEqual([p for p,_ in calls],['/api/monitor','/api/access','/api/monitor'])
        self.assertTrue(all(header=='1' for _,header in calls))

    def test_client_does_not_follow_redirects(self):
        calls=[]
        def handle(request):calls.append(request.url.host);return httpx.Response(302,headers={'location':'https://other.example'})
        with ProductClient('https://example.com',token='private-token',transport=httpx.MockTransport(handle)) as client:
            with self.assertRaises(TerminalError):client.get('/api/monitor')
        self.assertEqual(calls,['example.com'])

    def test_client_does_not_retry_ambiguous_mutations(self):
        calls=[]
        def handle(request):calls.append(request);raise httpx.ReadTimeout('timeout')
        with ProductClient('http://localhost:8080',transport=httpx.MockTransport(handle)) as client:
            with self.assertRaisesRegex(TerminalError,'may have been accepted'):client.post('/api/incidents',{})
        self.assertEqual(len(calls),1)

    def test_client_redacts_access_token_in_error(self):
        with ProductClient('http://localhost:8080',token='private-token',transport=httpx.MockTransport(lambda r:httpx.Response(403,json={'error':'bad private-token'}))) as client:
            with self.assertRaises(TerminalError) as context:client.get('/api/monitor')
        self.assertNotIn('private-token',str(context.exception))

    def test_terminal_control_sequences_are_not_rendered(self):
        value=clean('\x1b[2Jhidden\x1b]0;title\x07text\x00')
        self.assertNotIn('\x1b',value);self.assertNotIn('\x00',value);self.assertIn('text',value)

    def test_json_monitor_is_one_typed_record(self):
        output=io.StringIO();Display(json_mode=True,output=output).dashboard({'workspace':'test'})
        lines=output.getvalue().splitlines();self.assertEqual(len(lines),1)
        self.assertEqual(json.loads(lines[0]),{'type':'monitor','monitor':{'workspace':'test'}})

    def test_dashboard_reports_real_metric_units_and_degraded_state(self):
        output=io.StringIO();Display(output=output).dashboard({'degraded':True,'error':'Graph unavailable','processes':[],'modules':[]})
        self.assertIn('DEGRADED',output.getvalue());self.assertIn('CPU seconds',output.getvalue())

    def test_owned_process_sample(self):
        sample=sample_process(os.getpid(),'test')
        self.assertEqual(sample['pid'],os.getpid());self.assertTrue(sample['running'])
        if os.name=='nt' or Path('/proc').exists():
            self.assertGreater(sample['rss_bytes'],0);self.assertGreaterEqual(sample['cpu_seconds'],0)

    def test_export_refuses_overwriting_existing_file(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'report.json';write_export(path,{'saved':True})
            with self.assertRaises(FileExistsError):write_export(path,{'replaced':True})
            self.assertEqual(json.loads(path.read_text(encoding='utf-8')),{'saved':True})

    def test_watch_drains_pages_without_repeating_events(self):
        events=[{'id':str(i),'kind':'model_timing','role':'investigator','time':'2026-10-15T00:00:00','data':{'request':i,'duration_ms':1}} for i in range(3)]
        class Client:
            cursors=[]
            def get(self,path,**params):
                if path=='/api/monitor':return {'selected':{'id':'INC-X','status':'resolved','job':'idle'}}
                self.cursors.append(params['after']);start=int(params['after'])+1 if params['after'] else 0
                return {'events':events[start:start+2],'cursor':str(min(start+1,2)),'has_more':start==0}
        client=Client();output=io.StringIO()
        result=follow_task(client,Display(json_mode=True,output=output),'INC-X')
        self.assertTrue(result['success']);self.assertEqual(client.cursors,['','1'])
        self.assertEqual(len([json.loads(line) for line in output.getvalue().splitlines() if json.loads(line)['type']=='event']),3)

    def test_watch_blocked_is_not_success(self):
        class Client:
            def get(self,path,**params):
                if path=='/api/monitor':return {'selected':{'id':'INC-X','status':'blocked','job':'idle','blocker':'No procedure'}}
                return {'events':[],'cursor':'','has_more':False}
        result=follow_task(Client(),Display(output=io.StringIO()),'INC-X')
        self.assertFalse(result['success'])

    def test_interrupted_watch_shows_resume_and_does_not_claim_success(self):
        for status in ('new','resolved'):
            with self.subTest(status=status):
                class Client:
                    def get(self,path,**params):
                        if path=='/api/monitor':return {'selected':{'id':'INC-X','status':status,'job':'interrupted'}}
                        return {'events':[],'cursor':'','has_more':False}
                output=io.StringIO()
                result=follow_task(Client(),Display(output=output),'INC-X')
                self.assertFalse(result['success'])
                self.assertIn('[INC-X] INTERRUPTED',output.getvalue())
                self.assertIn('Resume with:',output.getvalue())
                self.assertTrue(result['resume_command'].endswith('resume INC-X'))

    def test_requested_stop_is_success_and_keeps_json_parseable(self):
        class Client:
            def get(self,path,**params):
                if path=='/api/monitor':return {'selected':{'id':'INC-X','status':'new','job':'interrupted','last_error':'Stopped at checkpoint'}}
                return {'events':[],'cursor':'','has_more':False}
        output=io.StringIO()
        result=follow_task(Client(),Display(json_mode=True,output=output),'INC-X',stopped=True)
        self.assertTrue(result['success'])
        records=[json.loads(line) for line in output.getvalue().splitlines()]
        self.assertEqual(records[-1]['type'],'complete')
        self.assertEqual(records[-1]['resume_command'],result['resume_command'])

    def test_memory_event_is_labeled(self):
        event={'kind':'memory_saved','role':'resolver','time':'2026-10-15T00:00:00','data':{'service':'payments'}}
        self.assertIn('[Memory/resolver]',event_record(event))

    def test_rejected_plan_shows_reason_in_progress(self):
        event={'id':'e1','kind':'tool','role':'resolver','time':'2026-10-15T00:00:00',
               'data':{'tool':'prepare_recovery','result':{'ready':False,'reason':'Current procedure requires review.'}}}
        text=event_record(event)
        self.assertIn('[Actions/resolver]',text)
        self.assertIn('ready=False',text)
        self.assertIn('Current procedure requires review.',text)


class TerminalIntegration(unittest.TestCase):
    setUp=fixtures.EventIntegration.setUp
    tearDown=fixtures.EventIntegration.tearDown
    worker_for_lab=fixtures.EventIntegration.worker_for_lab

    def test_event_replay_pages_beyond_500_and_rejects_foreign_cursor(self):
        for index in range(505):self.store.runs.append_event(self.task,'terminal-events','system','test',{'index':index})
        after='';events=[]
        while True:
            page=self.store.runs.events_after(self.task,after,100);events+=page['events'];after=page['cursor']
            if not page['has_more']:break
        self.assertEqual([event['data']['index'] for event in events],list(range(505)))
        other=self.store.runs.create('config','Different run','scripted')['id']
        with self.assertRaises(ValueError):self.store.runs.events_after(other,after)

    def test_monitor_reports_six_modules_and_owned_processes(self):
        worker=self.worker_for_lab();report=monitor_workspace(worker,self.task)
        self.assertFalse(report['degraded']);self.assertEqual(len(report['modules']),6)
        self.assertEqual(len(report['processes']),2)
        self.assertEqual(report['processes'][1]['pid'],self.lab.process.pid)

    def test_monitor_degrades_when_graph_state_unavailable(self):
        worker=self.worker_for_lab()
        with patch.object(worker,'snapshot',side_effect=RuntimeError('Graph unavailable')):
            report=monitor_workspace(worker,self.task)
        self.assertTrue(report['degraded']);self.assertTrue(all(m['status']=='unavailable' for m in report['modules']))
        self.assertEqual(report['readiness']['components']['graph']['status'],'unavailable')


if __name__=='__main__':unittest.main()
