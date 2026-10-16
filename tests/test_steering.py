"""Model-independent steering: gated tools, text tool calls, stall guidance and compact context."""
import asyncio
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import uuid
import httpx
from graphops.agents.runner import Agent
from graphops.agents.steering import allowed_tools, guidance, investigation_candidates, model_view, parse_text_tool_calls
from graphops.actions.lab import Lab
from graphops.agents.catalog import Tools
from graphops.graph.workspace import WorkspaceGraph
from graphops.models.providers import CompatibleModel
from tests.test_event import free_port


INCIDENT = {"incident_service": "gateway",
            "topology": {"paths": [{"services": ["gateway", "orders"]}, {"services": ["gateway", "orders", "payments"]}]},
            "observations": [{"service": "gateway", "http_status": 503, "error": ""},
                             {"service": "orders", "http_status": 503, "error": ""},
                             {"service": "payments", "http_status": 503, "error": "restore_config"},
                             {"service": "analytics", "http_status": 503, "error": "unrelated"}]}


class SteeringUnit(unittest.TestCase):
    def test_resolver_tools_follow_task_state(self):
        self.assertIsNone(allowed_tools("investigator", {"status": "new"}, False))
        before = allowed_tools("resolver", {"status": "handoff"}, False)
        self.assertIn("prepare_recovery", before)
        self.assertNotIn("execute_recovery", before)
        self.assertNotIn("complete_ticket", before)
        self.assertIn("execute_recovery", allowed_tools("resolver", {"status": "handoff"}, True))
        self.assertEqual(allowed_tools("resolver", {"status": "resolved"}, True), {"complete_ticket"})
        self.assertEqual(allowed_tools("resolver", {"status": "resolved", "ticket_closed": True}, True), set())

    def test_text_tool_call_formats(self):
        names = {"handoff_target", "observe_service"}
        tagged = parse_text_tool_calls('<tool_call>{"name": "handoff_target", "arguments": {"cause_service": "payments"}}</tool_call>', names)
        self.assertEqual(tagged[0]["name"], "handoff_target")
        self.assertEqual(tagged[0]["args"], {"cause_service": "payments"})
        fenced = parse_text_tool_calls('Next:\n```json\n{"tool": "observe_service", "args": {"service": "orders"}}\n```', names)
        self.assertEqual(fenced[0]["args"], {"service": "orders"})
        string_args = parse_text_tool_calls('{"name": "observe_service", "arguments": "{\\"service\\": \\"payments\\"}"}', names)
        self.assertEqual(string_args[0]["args"], {"service": "payments"})

    def test_text_tool_calls_cannot_reach_tools_not_offered(self):
        self.assertEqual(parse_text_tool_calls('{"name": "execute_recovery", "arguments": {"plan_id": "x"}}', {"prepare_recovery"}), [])
        self.assertEqual(parse_text_tool_calls("Payments is the cause.", {"handoff_target"}), [])

    def test_candidates_exclude_symptoms_and_unconnected_failures(self):
        self.assertEqual(investigation_candidates(INCIDENT), ["payments"])
        message = guidance("investigator", {"status": "new"}, INCIDENT)
        self.assertIn('handoff_target(cause_service="payments")', message)
        self.assertNotIn("analytics", message)
        self.assertIn("conclude_investigation", message)

    def test_model_view_is_compact_and_leaves_original_intact(self):
        memory = {"active": [], "historical": [{"id": str(i), "created_at": f"2026-10-16T0{i}:00"} for i in range(6)]}
        view = model_view("recall_memory", memory)
        self.assertEqual([r["id"] for r in view["historical"]], ["5", "4", "3"])
        self.assertEqual(view["historical_omitted"], 3)
        self.assertEqual(len(memory["historical"]), 6)
        company = {"documents": [{"id": "d", "text": "x" * 1000}]}
        shown = model_view("company_context", company)["documents"][0]
        self.assertEqual(len(shown["text"]), 400)
        self.assertTrue(shown["text_truncated"])
        self.assertEqual(len(company["documents"][0]["text"]), 1000)


class SteeringIntegration(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="graphops-steer-test-")
        self.port = free_port(); self.lab = Lab(Path(self.temp.name), self.port).start()
        self.store = WorkspaceGraph("test-" + uuid.uuid4().hex[:16]); self.store.seed(self.port)
        self.task = self.store.runs.create("config", "Investigate checkout", "llm")["id"]

    def tearDown(self):
        self.lab.close(); self.temp.cleanup(); self.store.graph.delete()

    def test_model_without_native_tool_calls_completes_investigation(self):
        self.lab.inject("config")
        class TextOnly:
            def generate(self, *args):
                return {"role": "model", "parts": [{"text": '<tool_call>{"name": "handoff_target", "arguments": {"cause_service": "payments"}}</tool_call>'}]}
        with patch("graphops.agents.runner.get_model", return_value=TextOnly()):
            asyncio.run(Agent(self.store, self.port).run(self.task, "investigator", mode="llm"))
        self.assertEqual(self.store.runs.get(self.task)["status"], "handoff")
        self.assertTrue(any(e["kind"] == "text_tool_calls_parsed" for e in self.store.runs.events(self.task)))

    def test_repeated_stall_gets_evidence_based_guidance(self):
        self.lab.inject("config")
        class StallsTwice:
            calls = 0; seen = []
            def generate(self, system, contents, declarations):
                self.calls += 1
                self.seen.append(contents[-1]["parts"][0].get("text", ""))
                if self.calls <= 2: return {"role": "model", "parts": [{"text": "Payments looks broken."}]}
                return {"role": "model", "parts": [{"functionCall": {"name": "handoff_target", "args": {"cause_service": "payments"}}}]}
        model = StallsTwice()
        with patch("graphops.agents.runner.get_model", return_value=model):
            asyncio.run(Agent(self.store, self.port).run(self.task, "investigator", mode="llm"))
        guided = [e for e in self.store.runs.events(self.task) if e["kind"] == "guidance_offered"]
        self.assertEqual(len(guided), 1)
        self.assertIn('handoff_target(cause_service="payments")', model.seen[-1])
        self.assertEqual(self.store.runs.get(self.task)["status"], "handoff")

    def test_resolver_cannot_execute_before_a_plan_is_offered(self):
        self.lab.inject("config")
        Tools(self.store, self.task, "test-a", "investigator", self.port).handoff_target("payments")
        class JumpsAhead:
            calls = 0; offered = []
            def generate(self, system, contents, declarations):
                self.calls += 1; self.offered.append({d["name"] for d in declarations})
                if self.calls == 1: return {"role": "model", "parts": [{"functionCall": {"name": "execute_recovery", "args": {"plan_id": "guess"}}}]}
                if self.calls == 2: return {"role": "model", "parts": [{"functionCall": {"name": "prepare_recovery", "args": {}}}]}
                if self.calls == 3:
                    plan = contents[-1]["parts"][0]["functionResponse"]["response"]["result"]
                    return {"role": "model", "parts": [{"functionCall": {"name": "execute_recovery", "args": {"plan_id": plan["plan_id"]}}}]}
                return {"role": "model", "parts": [{"functionCall": {"name": "complete_ticket", "args": {}}}]}
        model = JumpsAhead()
        with patch("graphops.agents.runner.get_model", return_value=model):
            asyncio.run(Agent(self.store, self.port).run(self.task, "resolver", mode="llm"))
        self.assertNotIn("execute_recovery", model.offered[0])
        self.assertIn("execute_recovery", model.offered[2])
        self.assertEqual(model.offered[3], {"complete_ticket"})
        self.assertEqual(self.lab.state()["action_count"], 1)
        self.assertTrue(self.store.runs.get(self.task)["ticket_closed"])


class CompatibleProviderUnit(unittest.TestCase):
    def test_required_tool_choice_and_usage(self):
        sent = []
        def transport(request):
            sent.append(json.loads(request.content))
            return httpx.Response(200, json={"choices": [{"message": {"role": "assistant", "tool_calls": [
                {"id": "1", "type": "function", "function": {"name": "observe_service", "arguments": '{"service":"payments"}'}}]}}],
                "usage": {"prompt_tokens": 120, "completion_tokens": 9}})
        model = CompatibleModel("m", "k", "https://example.test/v1")
        declaration = [{"name": "observe_service", "description": "d", "parametersJsonSchema": {"type": "object"}}]
        real = httpx.Client
        with patch("graphops.models.providers.httpx.Client", lambda **kw: real(transport=httpx.MockTransport(transport))):
            out = model.generate("s", [{"role": "user", "parts": [{"text": "go"}]}], declaration, require_tool=True)
        self.assertEqual(sent[0]["tool_choice"], "required")
        self.assertEqual(out["_usage"]["input_tokens"], 120)
        self.assertEqual(out["parts"][0]["functionCall"]["name"], "observe_service")

    def test_compatible_provider_never_borrows_another_key(self):
        env = {"GRAPHOPS_EVENT_PROVIDER": "compatible", "GRAPHOPS_EVENT_MODEL": "m",
               "GRAPHOPS_EVENT_BASE_URL": "http://localhost:8000/v1", "OPENROUTER_API_KEY": "other-provider-key"}
        with patch.dict("os.environ", env, clear=False):
            import os
            os.environ.pop("GRAPHOPS_EVENT_API_KEY", None)
            from graphops.models.router import get_model
            model = get_model()
        self.assertIsNone(model.key)


if __name__ == "__main__":
    unittest.main()


class FollowUpIntegration(unittest.TestCase):
    """Two root causes: a recovery that works but leaves checkout failing must never read as resolved."""
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="graphops-follow-test-")
        self.port = free_port(); self.lab = Lab(Path(self.temp.name), self.port).start()
        self.store = WorkspaceGraph("test-" + uuid.uuid4().hex[:16]); self.store.seed(self.port)

    def tearDown(self):
        self.lab.close(); self.temp.cleanup(); self.store.graph.delete()

    def test_partial_recovery_is_terminal_and_reported(self):
        self.lab.inject("double")
        task = self.store.runs.create("double", "Investigate checkout", "llm")["id"]
        Tools(self.store, task, "test-a", "investigator", self.port).handoff_target("payments")
        resolver = Tools(self.store, task, "test-b", "resolver", self.port)
        outcome = resolver.execute_recovery(resolver.prepare_recovery()["plan_id"])
        self.assertTrue(outcome["terminal"]); self.assertTrue(outcome["partial"])
        current = self.store.runs.get(task)
        self.assertEqual(current["status"], "blocked")
        self.assertIn("Another cause remains", current["blocker"])
        from graphops.agents.orchestrator import remaining_failure
        self.assertTrue(remaining_failure(current))

    def test_orchestrator_opens_one_follow_up_and_fixes_checkout(self):
        from graphops.agents.orchestrator import run_incident
        self.lab.inject("double")
        class Scripted:
            """Hands off the directly failing service the backend lists, then runs the resolver steps."""
            def generate(self, system, contents, declarations):
                names = {d["name"] for d in declarations}
                last = contents[-1]["parts"][0]
                if "handoff_target" in names:
                    context = json.loads(contents[0]["parts"][1]["text"].split("Current sourced context: ", 1)[1])
                    target = investigation_candidates(context["incident"])[0]
                    return {"role": "model", "parts": [{"functionCall": {"name": "handoff_target", "args": {"cause_service": target}}}]}
                if names == {"complete_ticket"}: name, args = "complete_ticket", {}
                elif "execute_recovery" in names and "functionResponse" in last:
                    name, args = "execute_recovery", {"plan_id": last["functionResponse"]["response"]["result"]["plan_id"]}
                else: name, args = "prepare_recovery", {}
                return {"role": "model", "parts": [{"functionCall": {"name": name, "args": args}}]}
        task = self.store.runs.create("double", "Investigate checkout", "llm")["id"]
        with patch("graphops.agents.runner.get_model", return_value=Scripted()):
            chain = asyncio.run(run_incident(self.store, self.port, task, "llm"))
        self.assertEqual(len(chain), 2)
        self.assertEqual(self.store.runs.get(chain[0])["status"], "blocked")
        self.assertEqual(self.store.runs.get(chain[1])["status"], "resolved")
        self.assertEqual(self.store.runs.get(chain[1])["follow_up_of"], chain[0])
        self.assertEqual(self.lab.state()["action_count"], 2)


class ProviderRejectionUnit(unittest.TestCase):
    def test_provider_tool_refusals_are_correctable_and_empty_replies_retryable(self):
        from graphops.models.providers import InvalidToolCall, EmptyModelResponse
        replies = iter([
            httpx.Response(400, json={"error": {"message": "Tool call validation failed: attempted to call tool 'handoff_target' which was not in request.tools"}}),
            httpx.Response(400, json={"error": {"message": "Tool choice is required, but model did not call a tool"}}),
            httpx.Response(200, json={"choices": [{"message": {"role": "assistant", "content": ""}}]})])
        model = CompatibleModel("m", "k", "https://example.test/v1")
        real = httpx.Client
        with patch("graphops.models.providers.httpx.Client", lambda **kw: real(transport=httpx.MockTransport(lambda r: next(replies)))):
            for expected in (InvalidToolCall, InvalidToolCall, EmptyModelResponse):
                with self.assertRaises(expected):
                    model.generate("s", [{"role": "user", "parts": [{"text": "go"}]}], [])

    def test_runner_recovers_after_a_refused_tool_call(self):
        temp = tempfile.TemporaryDirectory(prefix="graphops-refusal-test-")
        port = free_port(); lab = Lab(Path(temp.name), port).start()
        store = WorkspaceGraph("test-" + uuid.uuid4().hex[:16]); store.seed(port)
        try:
            lab.inject("config")
            task = store.runs.create("config", "Investigate checkout", "llm")["id"]
            from graphops.models.providers import InvalidToolCall
            class RefusedThenValid:
                calls = 0
                def generate(self, system, contents, declarations):
                    self.calls += 1
                    if self.calls == 1: raise InvalidToolCall("attempted to call tool 'execute_recovery' which was not in request.tools")
                    return {"role": "model", "parts": [{"functionCall": {"name": "handoff_target", "args": {"cause_service": "payments"}}}]}
            with patch("graphops.agents.runner.get_model", return_value=RefusedThenValid()):
                asyncio.run(Agent(store, port).run(task, "investigator", mode="llm"))
            self.assertEqual(store.runs.get(task)["status"], "handoff")
            self.assertTrue(any(e["kind"] == "invalid_tool_call_rejected" for e in store.runs.events(task)))
        finally:
            lab.close(); temp.cleanup(); store.graph.delete()
