"""Explicit event provider selection. Never reuse another provider's credential."""
import os
import time
import json
import httpx
from urllib.parse import urlsplit
from graphops import settings
from graphops.models.providers import CompatibleModel, Gemini, ModelError


class EmptyModelResponse(ModelError):
    """An inference finished without text or tools; no effect was requested."""


def configuration():
    provider = os.getenv("GRAPHOPS_EVENT_PROVIDER", "ollama")
    defaults = {"ollama": "qwen3:8b", "groq": "qwen/qwen3.8-27b", "openrouter": "nvidia/nemotron-3-super-120b-a12b:free"}
    model = os.getenv("GRAPHOPS_EVENT_MODEL", defaults.get(provider, ""))
    key_name = {"groq": "GROQ_API_KEY", "openrouter": "OPENROUTER_API_KEY", "gemini": "GOOGLE_API_KEY",
                "compatible": "GRAPHOPS_EVENT_API_KEY"}.get(provider)
    # Any OpenAI-compatible endpoint (vLLM, LM Studio, Together, OpenAI...) is configured by base URL and model.
    local_compatible = provider == "compatible" and urlsplit(os.getenv("GRAPHOPS_EVENT_BASE_URL", "")).hostname in {"localhost", "127.0.0.1"}
    configured = provider == "ollama" or local_compatible or bool(key_name and os.getenv(key_name))
    if provider == "compatible": configured = configured and bool(model and os.getenv("GRAPHOPS_EVENT_BASE_URL"))
    return {"provider": provider, "model": model, "configured": configured}


class Ollama:
    def __init__(self, model):
        self.model = model
        batch = os.getenv('GRAPHOPS_OLLAMA_BATCH_SIZE', '64')
        if not batch.isdigit() or not 32 <= int(batch) <= 1024:
            raise ModelError('GRAPHOPS_OLLAMA_BATCH_SIZE must be an integer from 32 to 1024')
        self.batch_size = int(batch)
        self.base = os.getenv("GRAPHOPS_OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
        # Local Ollama over HTTP, or a hosted Ollama server only over HTTPS.
        local = self.base in {"http://127.0.0.1:11434", "http://localhost:11434", "http://host.docker.internal:11434"}
        remote = urlsplit(self.base)
        if not local and not (remote.scheme == "https" and remote.hostname and not remote.username and not remote.query):
            raise ModelError("Ollama must be the local host endpoint or an HTTPS URL")

    def generate(self, system, contents, declarations, response_schema=None):
        messages = [{"role": "system", "content": system}]
        for content in contents:
            if "_ollama" in content: messages.append(content["_ollama"]); continue
            replies = [p["functionResponse"] for p in content["parts"] if "functionResponse" in p]
            if replies:
                for reply in replies:
                    messages.append({"role": "tool", "tool_name": reply["name"], "content": json.dumps(reply["response"])})
            else: messages.append({"role": "user", "content": "\n".join(p.get("text", "") for p in content["parts"])})
        payload = {"model": self.model, "messages": messages, "stream": False, "think": False, "keep_alive": "30m",
                   "options": {"num_ctx": 8192, "num_batch": self.batch_size, "num_predict": 768, "temperature": .2}}
        if response_schema is not None:
            payload['format'] = response_schema
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
    if provider == "compatible":
        compatible = CompatibleModel(model, "unset", os.environ["GRAPHOPS_EVENT_BASE_URL"])
        compatible.key = os.getenv("GRAPHOPS_EVENT_API_KEY") or None  # never fall back to another provider's key
        return compatible
    raise ModelError("Select ollama, groq, openrouter, gemini or compatible explicitly")


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
