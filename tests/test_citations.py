import unittest
from graphops.company.citations import collect_documents, resolve_citations


class CitationResolution(unittest.TestCase):
    def setUp(self):
        self.doc={'id':'owned-abc123','revision':'rev-2','source':'owned:document/owned-abc123','text':'Synthetic policy.'}
        self.documents={};collect_documents({'documents':[self.doc]},self.documents)

    def test_explicit_document_id_revision_maps_to_its_retrieved_source(self):
        refs,captured=resolve_citations('Policy document `owned-abc123` with revision `rev-2`.',{self.doc['source']},self.documents)
        self.assertEqual(refs,{self.doc['source']});self.assertEqual(captured[0]['revision'],'rev-2')

    def test_stale_prefix_unpaired_or_unretrieved_claims_are_not_mapped(self):
        for text in ['owned-abc123 revision rev-20','owned-abc123 revision rev-1','owned-abc123-extra revision rev-2','owned-abc123 has a policy. Another document has revision rev-2']:
            with self.subTest(text=text):self.assertEqual(resolve_citations(text,{self.doc['source']},self.documents),(set(),[]))
        self.assertEqual(resolve_citations('owned-abc123 revision rev-2',set(),self.documents),(set(),[]))

    def test_direct_source_and_two_explicit_revisions_remain_distinguishable(self):
        old={**self.doc,'revision':'rev-1'};collect_documents(old,self.documents)
        refs,captured=resolve_citations('owned:ownership/payments. ID: owned-abc123, revision: rev-1; ID: owned-abc123, revision: rev-2.',
                                      {self.doc['source'],'owned:ownership/payments'},self.documents)
        self.assertEqual(refs,{self.doc['source'],'owned:ownership/payments'})
        self.assertEqual({d['revision'] for d in captured},{'rev-1','rev-2'})
