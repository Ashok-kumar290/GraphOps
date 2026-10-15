"""Copy reviewed aggregate reports, including failed candidates, into the repo."""
from datetime import datetime,timezone
import json
import statistics
from graphops import settings


def main():
    names=['checks','stress','cli','live-app','package-scripted','package-llm','product','product-startup-failure','build-concurrency-failure','rebuild-failures','frontend','native-ready','native-terminal','native-monitor','terminal-cursor-failure','terminal-json-failure',
           'evaluation-qwen-candidate','evaluation-qwen-interface-v2',
           'evaluation-qwen-interface-extended','evaluation-qwen8-interface','evaluation-qwen8-final',
           'evaluation-qwen8-bounded-retry']
    destination=settings.ROOT/'evidence';destination.mkdir(exist_ok=True)
    exported=[]
    for name in names:
        source=settings.DATA/'reports'/(name+'.json')
        if not source.exists():continue
        data=json.loads(source.read_text(encoding='utf-8'))
        # This old configuration flag meant "not verified by config", not the
        # actual result of the subsequent inference. Actual result fields stay.
        if isinstance(data.get('model'),dict):data['model'].pop('inference_verified',None)
        trace=source.with_suffix('.jsonl')
        if name.startswith('evaluation-') and trace.exists():
            events=[json.loads(line).get('event',{}) for line in trace.read_text(encoding='utf-8').splitlines()]
            durations=[e['data']['duration_ms'] for e in events if e.get('kind')=='model_timing']
            if durations:data['request_measurements']={'nonempty_responses':len(durations),'median_ms':statistics.median(durations),'maximum_ms':max(durations),'empty_response_retries':sum(e.get('kind')=='model_response_retry' for e in events)}
        (destination/(name+'.json')).write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8');exported.append(name)
    (destination/'README.md').write_text('# Measured evidence\n\nAggregate reports exported '+datetime.now(timezone.utc).isoformat()+'.\n\n'
        'These are local measurements. Model evaluations use actual inference; integration and package reports identify their execution mode. '
        'Failed model candidates are retained. This small evaluation does not establish general reliability. '
        'Full event traces remain locally in ignored `.runtime/reports`; hidden reasoning and credentials are not exported.\n\n'
        +'\n'.join('- ['+n+']('+n+'.json)' for n in exported)+'\n',encoding='utf-8')
    print(json.dumps({'aggregate_reports_exported':len(exported)}))


if __name__=='__main__':main()
