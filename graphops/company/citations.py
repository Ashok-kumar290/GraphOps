"""Resolve explicit citations against retrieved records, without checking entailment."""
import re


SOURCE_PATTERN = r'(?:fixture:event/|owned:)[a-zA-Z0-9_./:-]+'


def collect_documents(value, documents):
    if isinstance(value, dict):
        if all(isinstance(value.get(key), str) for key in ('id', 'revision', 'source', 'text')):
            documents[(value['id'], value['revision'])] = value
        for child in value.values():collect_documents(child, documents)
    elif isinstance(value, list):
        for child in value:collect_documents(child, documents)


def resolve_citations(text, sources, documents):
    references = {match.rstrip('.,:;') for match in re.findall(SOURCE_PATTERN, text)}
    captured = []
    for (identifier, revision), doc in documents.items():
        # Accept only an explicit adjacent ID + revision, not a title, guessed
        # version, or arbitrary words appearing separately in the answer.
        pattern = (r'(?<![\w-])'+re.escape(identifier)+r'(?![\w-])'
                   r'''[\s`*"'()\[\],:;-]{0,24}(?:(?i:with|at)\s+)?(?i:revision|rev)\s*[:=]?\s*[`*"']*'''
                   + re.escape(revision)+r'(?![\w-]|\.[\w-])')
        if doc['source'] in sources and re.search(pattern, text):
            references.add(doc['source'])
            captured.append({'id':identifier,'revision':revision,'source':doc['source'],
                             'citation_form':'retrieved_document_id_and_revision'})
    return references, captured
