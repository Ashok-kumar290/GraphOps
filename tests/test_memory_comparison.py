"""Comparison parsing/scoring only; no model calls or shared-workspace effects."""
import unittest
from jsonschema import ValidationError
from tests.compare_memory import aggregate, parse_answer, score_answer


class MemoryComparisonUnit(unittest.TestCase):
    def answers(self):
        expected = {'past_incident_id': 'INC-EXAMPLE', 'past_service': 'payments',
                    'past_action': 'restore_config', 'health_evidence_ids': ['health-a', 'health-b'],
                    'procedure_applicable_now': False}
        return {**expected, 'explanation': 'The old configuration does not match.'}, expected

    def test_complete_exact_recall_and_correct_applicability(self):
        answer, expected = self.answers()
        score = score_answer(answer, expected, True)
        self.assertTrue(score['complete_historical_recall'])
        self.assertTrue(score['applicability_correct'])
        self.assertEqual(score['incorrect_historical_claims'], 0)

    def test_abstention_is_not_an_invented_history_claim(self):
        answer, expected = self.answers()
        answer.update(past_incident_id=None, past_service=None, past_action=None,
                      health_evidence_ids=[], procedure_applicable_now=None)
        score = score_answer(answer, expected, False)
        self.assertFalse(score['complete_historical_recall'])
        self.assertTrue(score['abstained_on_missing_procedure'])
        self.assertFalse(score['unsafe_applicability_claim'])
        self.assertEqual(score['incorrect_historical_claims'], 0)
        self.assertIsNone(score['applicability_correct'])

    def test_wrong_observation_ids_and_actions_are_counted(self):
        answer, expected = self.answers()
        answer['health_evidence_ids'] = ['health-a', 'invented-id']
        answer['past_action'] = 'restart_worker'
        score = score_answer(answer, expected, True)
        self.assertFalse(score['complete_historical_recall'])
        self.assertEqual(score['incorrect_historical_claims'], 2)

    def test_false_applicability_claim_and_cautious_abstention_are_separate(self):
        answer, expected = self.answers()
        answer['procedure_applicable_now'] = True
        self.assertTrue(score_answer(answer, expected, True)['unsafe_applicability_claim'])
        answer['procedure_applicable_now'] = None
        score = score_answer(answer, expected, True)
        self.assertFalse(score['applicability_correct'])
        self.assertTrue(score['applicability_abstention'])
        self.assertFalse(score['unsafe_applicability_claim'])

    def test_schema_rejects_missing_or_wrong_types(self):
        with self.assertRaises(ValidationError):parse_answer('{}')
        answer, _ = self.answers()
        answer['procedure_applicable_now'] = 'false'
        import json
        with self.assertRaises(ValidationError):parse_answer(json.dumps(answer))

    def test_fenced_json_parses_and_metrics_use_real_numeric_samples(self):
        import json
        answer, expected = self.answers()
        self.assertEqual(parse_answer('```json\n' + json.dumps(answer) + '\n```'), answer)
        rows = [{'condition': 'navigator_packet', 'context_utf8_bytes': 100,
                 'input_tokens': None, 'elapsed_ms': 23.5, 'score': score_answer(answer, expected, True)}]
        metrics = aggregate(rows)['navigator_packet']
        self.assertEqual(metrics['median_context_utf8_bytes'], 100)
        self.assertIsNone(metrics['median_input_tokens'])
        self.assertEqual(metrics['complete_historical_recall'], 1)
