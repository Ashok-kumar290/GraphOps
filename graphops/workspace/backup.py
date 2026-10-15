"""Logical graph + controlled-service backups. Restore only into a new workspace."""
import hashlib
import json
import math
import os
from pathlib import Path
import re
from falkordb import FalkorDB
from graphops import settings
from graphops.core.synthetic import SERVICES
from graphops.graph.workspace import WorkspaceGraph
from graphops.core.identity import now

LABELS={'Meta','Service','Project','Team','Expertise','Document','Revision','Incident','Session','Event','Memory','Plan','Audit'}
RELATIONS={'USES','OWNS','HAS_EXPERTISE','KNOWS','HAS_DOCUMENT','HAS_REVISION','DEPENDS_ON','HAS_MEMORY','HAS_SESSION','EMITTED','HAS_EVENT','HAS_PLAN'}


def export_workspace(store, lab):
    nodes=store.read('MATCH (n) RETURN id(n),labels(n),properties(n) LIMIT 25001')
    edges=store.read('MATCH (a)-[r]->(b) RETURN id(a),id(b),type(r),properties(r) LIMIT 50001')
    if len(nodes)>25000 or len(edges)>50000:raise ValueError('Workspace exceeds the backup size supported by this release')
    state=lab.state();state.pop('http_status',None)
    return {'schema':'graphops.workspace.v1','exported_at':now(),'workspace':store.scope,
        'nodes':[{'key':r[0],'labels':r[1],'properties':r[2]} for r in nodes],
        'edges':[{'from':r[0],'to':r[1],'kind':r[2],'properties':r[3]} for r in edges],
        'lab':state,'includes_provider_keys':False,'contains_company_sources':True,'restore_policy':'new_workspace_only'}


def validate_backup(data):
    if not isinstance(data,dict) or data.get('schema')!='graphops.workspace.v1':raise ValueError('Unsupported backup format')
    nodes,edges=data.get('nodes'),data.get('edges')
    if not isinstance(nodes,list) or not 1<=len(nodes)<=25000 or not isinstance(edges,list) or len(edges)>50000:raise ValueError('Invalid backup graph size')
    keys=set();metas=0;services=[]
    def properties(value):
        if not isinstance(value,dict) or len(value)>40:raise ValueError('Invalid backup properties')
        for key,item in value.items():
            if not re.fullmatch(r'[a-zA-Z_][a-zA-Z0-9_]{0,63}',key) or isinstance(item,(dict,list)) or item is None or not isinstance(item,(str,int,float,bool)):
                raise ValueError('Unsupported backup property')
            if isinstance(item,float) and not math.isfinite(item):raise ValueError('Non-finite backup property')
    for node in nodes:
        if not isinstance(node,dict) or not isinstance(node.get('key'),int) or node['key'] in keys or not isinstance(node.get('labels'),list) or len(node['labels'])!=1 or node['labels'][0] not in LABELS:raise ValueError('Invalid backup node')
        keys.add(node['key']);properties(node.get('properties'))
        if node['labels']==['Meta'] and node['properties'].get('id')=='context':metas+=1
        if node['labels']==['Service']:services.append(node['properties'].get('id'))
    if metas!=1:raise ValueError('Backup requires exactly one context node')
    if len(services)!=len(SERVICES) or set(services)!=set(SERVICES):raise ValueError('Backup requires exactly the supported services')
    for edge in edges:
        if not isinstance(edge,dict) or edge.get('from') not in keys or edge.get('to') not in keys or edge.get('kind') not in RELATIONS:raise ValueError('Invalid backup relationship')
        properties(edge.get('properties'))
    state=data.get('lab',{})
    if not isinstance(state,dict) or set(state.get('services',{}))!=set(SERVICES) or not isinstance(state.get('operations'),dict):raise ValueError('Invalid controlled-service state')
    for item in state['services'].values():
        if not isinstance(item,dict) or not isinstance(item.get('revision'),str) or len(item['revision'])>200 or item.get('fault') not in {'','restore_config','restart_worker','unrelated'}:raise ValueError('Invalid service revision or fault')
    for field in ('action_count','generation'):
        if not isinstance(state.get(field),int) or state[field]<0:raise ValueError('Invalid operation counters')
    for key,effect in state['operations'].items():
        if not isinstance(key,str) or not 1<=len(key)<=500 or not isinstance(effect,dict):raise ValueError('Invalid saved operation')
        if effect.get('operation_id')!=key or effect.get('service') not in SERVICES or effect.get('action') not in {'restore_config','restart_worker'} or effect.get('restored') is not True:
            raise ValueError('Invalid saved recovery effect')
        if not isinstance(effect.get('expected_revision'),str) or len(effect['expected_revision'])>200:raise ValueError('Invalid saved operation revision')


def restore_workspace(data, scope, port):
    validate_backup(data)
    if not isinstance(scope,str) or not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}',scope):raise ValueError('Invalid target workspace')
    if not isinstance(port,int) or not 1024<=port<=65530:raise ValueError('Invalid lab port')
    name='graphops_event_'+hashlib.sha256(scope.encode()).hexdigest()[:20]
    db=FalkorDB(host=os.getenv('FALKORDB_HOST','localhost'),port=int(os.getenv('FALKORDB_PORT','6379')),socket_connect_timeout=3,socket_timeout=10)
    if name in db.list_graphs():raise ValueError('Restore requires a new workspace; existing data is never overwritten')
    directory=settings.DATA/scope
    if directory.exists():raise ValueError('Target workspace directory already exists')
    store=WorkspaceGraph(scope);mapping={};created_directory=False
    def assignments(props):
        return ','.join(f'{key}:$p{i}' for i,key in enumerate(props)),{f'p{i}':value for i,value in enumerate(props.values())}
    try:
        for node in data['nodes']:
            label=node['labels'][0];props=dict(node['properties'])
            if label=='Service':
                if props.get('id') not in SERVICES:raise ValueError('Backup contains an unsupported executable service')
                props['url']=f"http://127.0.0.1:{port+SERVICES.index(props['id'])}"
            if label=='Memory':
                memory=json.loads(props['payload'])
                if memory['kind']=='semantic':
                    memory['verified']=False;memory['data']['restored_snapshot']=True
                    props['payload']=json.dumps(memory)
            if label=='Meta' and props.get('id')=='context':
                props['lab_port']=port
                for key,value in props.items():store.graph.query(f"MATCH (m:Meta {{id:'context'}}) SET m.{key}=$value",params={'value':value})
                mapping[node['key']]=store.read("MATCH (m:Meta {id:'context'}) RETURN id(m)")[0][0]
            else:
                fields,params=assignments(props)
                mapping[node['key']]=store.graph.query(f'CREATE (n:{label} {{{fields}}}) RETURN id(n)',params=params).result_set[0][0]
        for edge in data['edges']:
            fields,params=assignments(edge['properties']);params.update({'a':mapping[edge['from']],'b':mapping[edge['to']]})
            store.graph.query(f"MATCH (a),(b) WHERE id(a)=$a AND id(b)=$b CREATE (a)-[:{edge['kind']} {{{fields}}}]->(b)",params=params)
        directory.mkdir()
        created_directory=True
        path=directory/'lab.json'
        with path.open('x',encoding='utf-8') as handle:json.dump(data['lab'],handle)
        store.audit.append('workspace_restored',{'source_workspace':data.get('workspace'),'node_count':len(data['nodes']),'edge_count':len(data['edges'])})
        return {'workspace':scope,'lab_port':port,'nodes':len(data['nodes']),'edges':len(data['edges'])}
    except BaseException:
        # Only this function's newly created target graph is removed on failure.
        store.graph.delete()
        if created_directory:
            (directory/'lab.json').unlink(missing_ok=True)
            directory.rmdir()
        raise


def load_backup(path):
    path=Path(path)
    if path.stat().st_size>16*1024*1024:raise ValueError('Backup exceeds 16 MB')
    data=json.loads(path.read_text(encoding='utf-8'));validate_backup(data);return data
