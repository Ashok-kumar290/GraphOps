"""Bounded local load; no model inference, no user workspace modifications."""
from concurrent.futures import ThreadPoolExecutor
import json
from statistics import median
import time
import uuid
from graphops import settings
from graphops.graph.workspace import WorkspaceGraph

if __name__=='__main__':
    store=WorkspaceGraph('load-'+uuid.uuid4().hex[:12]);store.seed(40000)
    task=store.runs.create('load','Load exercise','scripted')['id']
    count,workers=5000,32;latencies=[];start=time.perf_counter()
    try:
        def item(i):
            tick=time.perf_counter()
            store.runs.append_event(task,'writer-'+str(i%workers),'system','load',{'index':i})
            store.runs.get(task)
            if i%2==0:store.memory.save('load-'+str(i),'payments','semantic','v1','fixture:load',{'claim':'load','value':i})
            return (time.perf_counter()-tick)*1000
        with ThreadPoolExecutor(max_workers=workers) as pool:latencies=list(pool.map(item,range(count)))
        duration=time.perf_counter()-start
        events=store.read("MATCH (:Incident {id:$id})-[:HAS_EVENT]->(e:Event) RETURN count(e)",id=task)[0][0]
        memories=store.read("MATCH (m:Memory) RETURN count(m)")[0][0]
        winners=[]
        with ThreadPoolExecutor(max_workers=workers) as pool:
            for _ in range(50):
                version=store.runs.get(task)['version']
                def compete(i):
                    try:store.runs.update(task,{'contender':i},version);return 1
                    except ValueError:return 0
                winners.append(sum(pool.map(compete,range(workers))))
        report={'event_writes':events,'memory_writes':memories,'task_reads':count,'workers':workers,
                'lost_records':count+count//2-events-memories,'workload_seconds':round(duration,3),
                'latency_ms':{'median':round(median(latencies),3),'p95':round(sorted(latencies)[int(count*.95)],3)},
                'checkpoint_races':len(winners),'single_winner_races':winners.count(1),
                'success':events==count and memories==count//2 and all(w==1 for w in winners),
                'limitation':'Local Docker database measurements; not production capacity or model throughput'}
        directory=settings.DATA/'reports';directory.mkdir(exist_ok=True)
        (directory/'stress.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report))
        raise SystemExit(0 if report['success'] else 1)
    finally:store.graph.delete()
