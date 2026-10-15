"""Versioned user-supplied reference sources. Imports never authorize an action."""
import hashlib
import re
from graphops.lab import SERVICES


class ConflictError(ValueError):pass


def import_source(store, body):
    if set(body)-{'service','title','text','filename','document_type','id','base_revision'}:raise ValueError('Unknown source field')
    service=body.get('service');title=body.get('title','');text=body.get('text','');filename=body.get('filename','pasted-note.txt')
    kind=body.get('document_type','note')
    if service not in SERVICES:raise ValueError('Select an authorized service')
    if not isinstance(title,str) or not 1<=len(title.strip())<=120:raise ValueError('Source title must contain 1–120 characters')
    if not isinstance(text,str) or not 1<=len(text.strip())<=16000 or '\0' in text:raise ValueError('Source must be plain text containing 1–16000 characters')
    if not isinstance(filename,str) or not re.fullmatch(r'[\w .-]{1,120}',filename) or filename in {'.','..'}:raise ValueError('Use a plain source filename')
    if kind not in {'note','runbook','decision','policy','incident','chat'}:raise ValueError('Unknown document type')
    doc_id=body.get('id') or 'owned-'+hashlib.sha256((service+':'+filename).encode()).hexdigest()[:20]
    if not isinstance(doc_id,str) or not re.fullmatch(r'owned-[a-f0-9]{20}',doc_id):raise ValueError('Invalid uploaded source ID')
    previous=store.document(doc_id)
    if previous:
        if previous['service']!=service:raise ValueError('A source cannot move to another service')
        if previous['revision']!=body.get('base_revision'):raise ConflictError('Source changed or already exists. Open its latest version before editing.')
    elif len([d for d in store.company(service)['documents'] if d['kind']=='reference'])>=16:
        raise ValueError('This service has reached the 16-source reference limit')
    revision=hashlib.sha256((title.strip()+'\n'+text.strip()+'\n'+kind+'\n'+filename).encode()).hexdigest()[:16]
    document=store.put_document(doc_id,service,'reference',title.strip(),text.strip(),revision,
        {'filename':filename,'document_type':kind,'action_policy':'reference_only'},source='owned:document/'+doc_id)
    if not previous or previous['revision']!=revision:
        store.audit('source_imported' if not previous else 'source_updated',{'id':doc_id,'service':service,'revision':revision,'source':document['source']})
    return {'document':document,'unchanged':bool(previous and previous['revision']==revision)}
