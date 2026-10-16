"""Hosted tool-calling adapters. Preserve provider messages and thought signatures."""
from __future__ import annotations
import os
import re
import time
import threading
import httpx
import json
from urllib.parse import urlsplit


class ModelError(RuntimeError): pass


class EmptyModelResponse(ModelError):
    """An inference finished without text or tools; no effect was requested."""


class InvalidToolCall(ModelError):
    """The provider rejected the model's tool call (for example a tool not offered). Correctable by the model."""


def error_detail(response, key: str | None) -> str:
    try:
        error = response.json().get("error", {})
        message = str(error.get("message", "")) if isinstance(error, dict) else ""
    except (ValueError, TypeError):
        message = ""
    if key: message = message.replace(key, "[redacted]")
    message = re.sub(r"sk-[A-Za-z0-9_-]+", "[redacted]", message)
    return message[:500]


def provider_retry_delay(response, fallback: float) -> float:
    """Honor provider retry hints, bounded to one minute per attempt."""
    header = response.headers.get("retry-after", "")
    if re.fullmatch(r"\d+(?:\.\d+)?", header):
        return min(60, float(header) + .1)
    try:
        details = response.json().get("error", {}).get("details", [])
        for item in details:
            delay = item.get("retryDelay", "")
            if re.fullmatch(r"\d+(?:\.\d+)?s", delay):
                return min(60, float(delay[:-1]) + 1)
    except (ValueError, TypeError, AttributeError):
        pass
    return fallback


class CompatibleModel:
    """OpenRouter or a configured OpenAI-compatible chat-completions endpoint."""
    supports_required_tool = True
    rate_limit_attempts = 6

    def __init__(self, model: str | None = None, api_key: str | None = None,
                 base_url: str | None = None):
        self.base_url = (base_url or os.getenv("MODEL_BASE_URL", "https://openrouter.ai/api/v1")).rstrip("/")
        self.model = model or os.getenv("GRAPHOPS_MODEL", "")
        self.key = api_key or os.getenv("MODEL_API_KEY") or os.getenv("OPENROUTER_API_KEY")
        endpoint = urlsplit(self.base_url)
        if endpoint.username or endpoint.password or endpoint.query or endpoint.fragment:
            raise ModelError("Model base URL must not contain credentials, query or fragment")
        if endpoint.scheme != "https" and not (endpoint.scheme == "http" and endpoint.hostname in {"localhost", "127.0.0.1"}):
            raise ModelError("Use HTTPS for hosted models or a localhost HTTP endpoint")
        if not self.model:
            raise ModelError("Set GRAPHOPS_MODEL to your provider's model ID")
        if not self.key and endpoint.hostname not in {"localhost", "127.0.0.1"}:
            raise ModelError("Set OPENROUTER_API_KEY or MODEL_API_KEY locally; run configure without exposing the key")

    def generate(self, system: str, contents: list, declarations: list, require_tool: bool = False) -> dict:
        messages = [{"role": "system", "content": system}]
        for content in contents:
            if "_provider_message" in content:
                messages.append(content["_provider_message"])
                continue
            replies = [p["functionResponse"] for p in content["parts"] if "functionResponse" in p]
            if replies:
                for reply in replies:
                    messages.append({"role": "tool", "tool_call_id": reply["id"],
                                     "content": json.dumps(reply["response"])})
            else:
                messages.append({"role": "user" if content["role"] == "user" else "assistant",
                                 "content": "\n".join(p.get("text", "") for p in content["parts"])})
        payload = {"model": self.model, "messages": messages, "temperature": 0, "max_tokens": 4096}
        if declarations:
            payload["tools"] = [{"type": "function", "function": {"name": d["name"],
                "description": d["description"], "parameters": d["parametersJsonSchema"]}} for d in declarations]
            if require_tool: payload["tool_choice"] = "required"
        headers = {"Authorization": f"Bearer {self.key}"} if self.key else {}
        started = time.perf_counter()
        try:
            with httpx.Client(timeout=60) as client:
                attempts = self.rate_limit_attempts
                for attempt in range(attempts):
                    try:
                        response = client.post(self.base_url + "/chat/completions", headers=headers, json=payload)
                    except httpx.TransportError:
                        if attempt >= 2: raise
                        time.sleep(1 + attempt)
                        continue
                    detail = error_detail(response, self.key) if response.status_code != 200 else ""
                    if response.status_code == 429 and "per-day" in detail:
                        raise ModelError("Daily provider quota exhausted; wait for reset or configure available quota")
                    # Per-minute token limits clear within a minute; server errors get two retries.
                    retryable = response.status_code == 429 or (response.status_code in {500, 502, 503, 504} and attempt < 2)
                    if retryable and attempt < attempts - 1:
                        time.sleep(provider_retry_delay(response, 2 + 2 * attempt))
                        continue
                    # The provider refused the model's tool use (unknown tool, or text where a call was required).
                    if response.status_code == 400 and ("tool call validation failed" in detail.lower() or "did not call a tool" in detail.lower()):
                        raise InvalidToolCall(detail)
                    if response.status_code != 200:
                        raise ModelError(f"Model provider HTTP {response.status_code}: {detail or 'check model, credentials and quota'}")
                    body = response.json()
                    usage = body.get("usage") or {}
                    choices = body.get("choices", [])
                    if not choices or not choices[0].get("message"):
                        raise ModelError("Model provider returned no usable message")
                    message = choices[0]["message"]
                    parts = [{"text": message["content"]}] if message.get("content") else []
                    for invocation in message.get("tool_calls", []):
                        function = invocation["function"]
                        try: arguments = json.loads(function["arguments"])
                        except (ValueError, TypeError): arguments = {"_invalid_json": True}
                        parts.append({"functionCall": {"name": function["name"], "args": arguments,
                                                       "id": invocation["id"]}})
                    if not parts: raise EmptyModelResponse("Model returned an empty response")
                    preserved = {k: v for k, v in message.items() if k in {"role", "content", "tool_calls", "reasoning_details"}}
                    return {"role": "model", "parts": parts, "_provider_message": preserved,
                            "_usage": {"input_tokens": usage.get("prompt_tokens"), "output_tokens": usage.get("completion_tokens"),
                                       "model_duration_ms": round((time.perf_counter() - started) * 1000)}}
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            raise ModelError(f"Model request failed: {type(exc).__name__}") from None


def get_model():
    provider = os.getenv("GRAPHOPS_PROVIDER", "compatible")
    if provider == "compatible": return CompatibleModel()
    if provider == "gemini": return Gemini()
    raise ModelError("GRAPHOPS_PROVIDER must be compatible or gemini")


class Gemini:
    _request_lock = threading.Lock()
    _last_request = 0.0

    def __init__(self, model: str | None = None, api_key: str | None = None):
        self.model = model or os.getenv("GRAPHOPS_MODEL", "gemini-3.5-flash-lite")
        self.key = api_key or os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
        if not self.key or self.key.startswith("your_"):
            raise ModelError("Set GOOGLE_API_KEY in .env for Gemini mode; --mode scripted is a labeled test baseline")
        if not re.fullmatch(r"[A-Za-z0-9_.-]+", self.model): raise ModelError("Invalid model name")
        self.min_interval = float(os.getenv("GRAPHOPS_MODEL_MIN_INTERVAL", "4.2"))
        if not 0 <= self.min_interval <= 60: raise ModelError("Model request interval must be between 0 and 60 seconds")

    def pace(self):
        with self._request_lock:
            pause = self.min_interval - (time.monotonic() - Gemini._last_request)
            if pause > 0: time.sleep(pause)
            Gemini._last_request = time.monotonic()

    def generate(self, system: str, contents: list, declarations: list) -> dict:
        payload = {"systemInstruction": {"parts": [{"text": system}]}, "contents": contents,
                   "generationConfig": {"temperature": 0, "maxOutputTokens": 4096}}
        if self.model.startswith("gemini-3"):
            payload["generationConfig"]["thinkingConfig"] = {"thinkingLevel": "LOW"}
        if declarations:
            payload["tools"] = [{"functionDeclarations": declarations}]
        endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent"
        try:
            with httpx.Client(timeout=120) as client:
                for attempt in range(3):
                    self.pace()
                    try:
                        response = client.post(endpoint, headers={"x-goog-api-key": self.key}, json=payload)
                    except httpx.TransportError:
                        if attempt == 2: raise
                        time.sleep(1 + attempt)
                        continue
                    if response.status_code in {429, 500, 502, 503, 504} and attempt < 2:
                        time.sleep(provider_retry_delay(response, 1 + attempt))
                        continue
                    if response.status_code != 200:
                        raise ModelError(f"Gemini HTTP {response.status_code}: {error_detail(response, self.key) or 'check model access, credentials and quota'}")
                    data = response.json()
                    candidates = data.get("candidates", [])
                    if not candidates or not candidates[0].get("content", {}).get("parts"):
                        raise ModelError("Gemini returned no usable content (blocked or empty response)")
                    return candidates[0]["content"]
        except (httpx.HTTPError, ValueError) as exc:
            raise ModelError(f"Gemini request failed: {type(exc).__name__}") from None
