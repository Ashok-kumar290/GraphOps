"""Explicit event provider selection. Never reuse another provider's credential."""
import os
import time
import json
import httpx
from graphops import settings
from graphops.models.providers import CompatibleModel, Gemini, ModelError


class EmptyModelResponse(ModelError):
    """An inference finished without text or tools; no effect was requested."""


def configuration():
    provider = os.getenv("GRAPHOPS_EVENT_PROVIDER", "ollama")
    defaults = {"ollama": "qwen3:8b", "groq": "qwen/qwen3.8-27b", "openrouter": "nvidia/nemotron-3-super-120b-a12b:free"}
    model = os.getenv("GRAPHOPS_EVENT_MODEL", defaults.get(provider, ""))
    key_name = {"groq": "GROQ_API_KEY", "openrouter": "OPENROUTER_API_KEY", "gemini": "GOOGLE_API_KEY"}.get(provider)
    return {"provider": provider, "model": model, "configured": provider == "ollama" or bool(key_name and os.getenv(key_name))}


class Ollama:
    def __init__(self, model):
        self.model = model
        self.base = os.getenv("GRAPHOPS_OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
        if self.base not in {"http://127.0.0.1:11434", "http://localhost:11434", "http://host.docker.internal:11434"}:
            raise ModelError("Ollama must be the configured local host endpoint")

    def generate(self, system, contents, declarations):
        messages = [{"role": "system", "content": system}]
        for content in contents:
            if "_ollama" in content: messages.append(content["_ollama"]); continue
            replies = [p["functionResponse"] for p in content["parts"] if "functionResponse" in p]
            if replies:
                for reply in replies:
                    messages.append({"role": "tool", "tool_name": reply["name"], "content": json.dumps(reply["response"])})
            else: messages.append({"role": "user", "content": "\n".join(p.get("text", "") for p in content["parts"])})
        payload = {"model": self.model, "messages": messages, "stream": False, "think": False, "keep_alive": "30m",
                   "options": {"num_ctx": 8192, "num_predict": 768, "temperature": .2}}
        if declarations: payload["tools"] = [{"type": "function", "function": {"name": d["name"], "description": d["description"], "parameters": d["parametersJsonSchema"]}} for d in declarations]
        try:
            with httpx.Client(timeout=httpx.Timeout(90, connect=5)) as client:
                response = client.post(self.base+"/api/chat", json=payload)
            if response.status_code != 200: raise ModelError(f"Local model HTTP {response.status_code}; check Ollama and pull {self.model}")
            data = response.json(); message = data["message"]
            parts = [{"text": message["content"]}] if message.get("content") else []
            for i, call in enumerate(message.get("tool_calls", [])):
                fn = call["function"]
                args = fn.get("arguments", {})
                if isinstance(args, str): args = json.loads(args)
                parts.append({"functionCall": {"name": fn["name"], "args": args, "id": str(i)}})
            if not parts: raise EmptyModelResponse("Local model returned an empty response")
            preserved = {k: v for k, v in message.items() if k != "thinking"}
            return {"role": "model", "parts": parts, "_ollama": preserved,
                    "_usage": {"input_tokens": data.get("prompt_eval_count"), "output_tokens": data.get("eval_count"),
                               "model_duration_ms": round(data.get("total_duration", 0)/1e6)}}
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            raise ModelError("Local model unavailable: "+type(exc).__name__) from None


def get_model():
    config = configuration(); provider, model = config["provider"], config["model"]
    if provider == "ollama": return Ollama(model)
    if not config["configured"]: raise ModelError(f"Configure {provider} credentials privately in event/.env")
    if provider == "groq": return CompatibleModel(model, os.environ["GROQ_API_KEY"], "https://api.groq.com/openai/v1")
    if provider == "openrouter": return CompatibleModel(model, os.environ["OPENROUTER_API_KEY"], "https://openrouter.ai/api/v1")
    if provider == "gemini": return Gemini(model or "gemini-3.5-flash-lite", os.environ["GOOGLE_API_KEY"])
    raise ModelError("Select ollama, groq, openrouter or gemini explicitly")


def preflight():
    model = get_model()
    if isinstance(model, Ollama):
        try:
            response = httpx.get(model.base+"/api/tags", timeout=3)
            response.raise_for_status()
            installed = {item["name"] for item in response.json().get("models", [])}
        except (httpx.HTTPError, ValueError, KeyError):
            raise ModelError("Ollama is unavailable. Start it, or explicitly configure a hosted provider in event/.env.") from None
        if model.model not in installed:
            raise ModelError(f"Local model is not installed. Run ollama pull {model.model}, then retry.")
    return model
