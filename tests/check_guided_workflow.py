"""Live API rehearsal plus the frontend's progress function, not a browser test.

Run against an idle, healthy local app: python -m tests.check_guided_workflow
Creates a company question and a controlled incident in that app's workspace.
"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import time
from graphops import settings
from graphops.runtime.terminal_client import ProductClient


BRIDGE = """
import {walkthroughEvidence} from './web/src/features/walkthrough/model.ts';
import {incidentJourney} from './web/src/features/agent/journey.ts';
let input=''; for await (const chunk of process.stdin) input+=chunk;
const {workspace,guide}=JSON.parse(input), evidence=walkthroughEvidence(workspace,guide);
const journey=incidentJourney(workspace,workspace.selected?.question ? undefined : workspace.selected);
console.log(JSON.stringify({done:evidence.done,complete:evidence.complete,path:evidence.path,
  citations:evidence.citations,investigators:evidence.investigators,resolvers:evidence.resolvers,
  memory_count:evidence.memories.length,story:{complete:journey.complete,steps:journey.steps.map(s=>({title:s.title,done:s.done})),active:journey.active}}));
"""


def evaluate(workspace, guide):
    result = subprocess.run(['node', '--input-type=module', '-e', BRIDGE], cwd=settings.ROOT,
                            input=json.dumps({'workspace': workspace, 'guide': guide}),
                            text=True, encoding='utf-8', capture_output=True, timeout=20)
    if result.returncode:
        raise RuntimeError('Frontend evidence function failed: ' + result.stderr[-700:])
    return json.loads(result.stdout)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://127.0.0.1:8080')
    args = parser.parse_args()
    started = time.perf_counter()
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')
    directory = settings.DATA / 'reports' / ('guided-frontend-' + stamp)
    directory.mkdir()
    report = {'scope': 'Live local API and frontend evidence logic; no browser interaction',
              'model_inference': True, 'browser_review': False, 'checks': [], 'success': False}

    def check(name, passed, **details):
        record = {'name': name, 'passed': bool(passed), **details}
        report['checks'].append(record)
        print(json.dumps(record), flush=True)
        if not passed:
            raise RuntimeError('Guided workflow check failed: ' + name)

    def save(name, value):
        (directory / name).write_text(json.dumps(value, indent=2), encoding='utf-8')

    with ProductClient(args.url) as client:
        def wait(task):
            deadline = time.monotonic() + 180
            while time.monotonic() < deadline:
                workspace = client.get('/api/workspace', task=task)
                selected = workspace.get('selected')
                if selected and selected.get('job') != 'running':
                    return workspace
                time.sleep(.5)
            raise RuntimeError('Task is still running: ' + task + '. Follow it in the app or CLI.')

        try:
            initial = client.get('/api/workspace')
            if initial['busy'] or not any(h['service'] == 'gateway' and h['http_status'] == 200 for h in initial['health']):
                raise RuntimeError('Rehearsal requires an idle app with healthy checkout. Resume existing work first.')
            report.update(workspace=initial['workspace'], model=initial['model'])
            guide = {'workspace': initial['workspace'], 'step': 'company', 'questionId': None,
                     'incidentId': None, 'questionEvents': [], 'incidentEvents': []}
            proof = evaluate(initial, guide)
            check('existing_history_cannot_complete_new_guide', not proof['complete'] and
                  not any(proof['done'][step] for step in ('company', 'investigate', 'recover', 'memory')))
            question = client.post('/api/questions', {'service': 'payments', 'mode': 'llm',
                'question': 'Who owns payments, and which current procedure supports recovery? Cite the exact sources and revisions.'})['task']
            report['question_task'] = question
            state = wait(question)
            guide.update(questionId=question, questionEvents=state['events'])
            proof = evaluate(state, guide)
            save('company.json', client.get('/api/reports', task=question))
            check('fresh_company_answer_cites_retrieved_sources', proof['done']['company'], task=question, citations=proof['citations'])
            check('graph_step_has_actual_dependency_path', proof['path'] == ['gateway', 'orders', 'payments'])

            incident = client.post('/api/incidents', {'scenario': 'config', 'mode': 'llm', 'pause_after_handoff': True})['task']
            report['incident_task'] = incident
            state = wait(incident)
            guide.update(step='investigate', incidentId=incident, incidentEvents=state['events'])
            proof = evaluate(state, guide)
            save('handoff.json', client.get('/api/reports', task=incident))
            check('handoff_advances_investigation_without_claiming_recovery', state['selected']['status'] == 'handoff' and
                  proof['done']['investigate'] and not proof['done']['recover'] and not proof['done']['memory'], task=incident)
            check('plain_language_story_waits_for_a_fresh_resolver', proof['story']['steps'][0]['done'] and
                  not proof['story']['steps'][1]['done'] and not proof['story']['complete'], story=proof['story'])

            client.post('/api/resume', {'task': incident})
            state = wait(incident)
            guide.update(step='memory', incidentEvents=state['events'])
            proof = evaluate(state, guide)
            final = client.get('/api/reports', task=incident)
            save('recovered.json', final)
            save('progress.json', proof)
            check('fresh_resolver_measures_recovery', proof['done']['recover'],
                  investigators=proof['investigators'], resolvers=proof['resolvers'])
            check('memory_step_uses_only_this_incident', proof['done']['memory'], records=proof['memory_count'])
            check('all_five_frontend_steps_have_live_evidence', proof['complete'], steps=proof['done'])
            check('plain_language_story_matches_measured_result', proof['story']['complete'] and
                  all(step['done'] for step in proof['story']['steps']), story=proof['story'])
            report['success'] = True
        except Exception as exc:
            report['error'] = str(exc)[:900]
            raise
        finally:
            report['elapsed_seconds'] = round(time.perf_counter() - started, 3)
            save('result.json', report)
            print(json.dumps({'saved': str(directory / 'result.json'), 'success': report['success']}), flush=True)


if __name__ == '__main__':
    main()
