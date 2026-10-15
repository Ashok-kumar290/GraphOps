/** Same-origin TypeScript API, SSE events and a persistent Python agent worker. */
import {
  createServer,
  type ServerResponse,
  type IncomingMessage,
} from "node:http";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { existsSync, createReadStream, statSync } from "node:fs";
import { resolve, sep, extname } from "node:path";
import { randomUUID, timingSafeEqual } from "node:crypto";

const root = fileURLToPath(new URL("../", import.meta.url)),
  web = resolve(root, "web/dist");
if (existsSync(resolve(root, ".env")))
  process.loadEnvFile(resolve(root, ".env"));
const python =
  process.env.GRAPHOPS_PYTHON ||
  [
    resolve(root, ".venv/Scripts/python.exe"),
    resolve(root, "../.venv/Scripts/python.exe"),
  ].find(existsSync) ||
  "python";
const host = process.env.HOST || "127.0.0.1",
  port = Number(process.env.PORT || 8080),
  accessToken = process.env.GRAPHOPS_ACCESS_TOKEN || "";
const local = ["127.0.0.1", "localhost"].includes(host);
if (!local && accessToken.length < 24)
  throw new Error(
    "Network hosting requires GRAPHOPS_ACCESS_TOKEN of at least 24 characters.",
  );
class HttpError extends Error {
  status: number;
  constructor(message: string, status = 503) {
    super(message);
    this.status = status;
  }
}
let worker: ChildProcessWithoutNullStreams;
let ready = false,
  failure = "Starting the agent worker",
  stopping = false,
  restarts = 0,
  consecutiveFailures = 0;
let restartTimer: ReturnType<typeof setTimeout> | undefined;
const pending = new Map<
  string,
  {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
const streams = new Set<ServerResponse>();
const broadcast = (value: unknown) => {
  for (const client of streams)
    if (!client.write(`data: ${JSON.stringify(value)}\n\n`)) {
      client.end();
      streams.delete(client);
    }
};
function lost(message: string) {
  ready = false;
  failure = message;
  for (const waiter of pending.values()) {
    clearTimeout(waiter.timer);
    waiter.reject(new HttpError(message));
  }
  pending.clear();
  broadcast({ type: "unavailable", message });
}
function bootWorker() {
  if (stopping) return;
  const child = spawn(python, ["-u", "-m", "graphops.worker"], {
    cwd: root,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, PYTHONPATH: root },
  });
  worker = child;
  let handled = false,
    problem = "";
  createInterface({ input: child.stdout }).on("line", (line) => {
    if (worker !== child) return;
    try {
      const message = JSON.parse(line);
      if (message.type === "ready") {
        ready = true;
        failure = "";
        consecutiveFailures = 0;
        console.log("Python worker and Go lab ready.");
        broadcast({ type: "worker_ready" });
      } else if (message.type === "fatal") {
        problem = message.message;
        lost(problem);
      } else if (message.type === "reply") {
        const waiter = pending.get(message.id);
        if (!waiter) return;
        clearTimeout(waiter.timer);
        pending.delete(message.id);
        message.error
          ? waiter.reject(
              new HttpError(
                message.error,
                message.error_type === "validation"
                  ? 400
                  : message.error_type === "conflict"
                    ? 409
                    : 503,
              ),
            )
          : waiter.resolve(message.result);
      } else if (message.type === "progress") broadcast(message);
    } catch {
      console.error("Worker returned an invalid protocol record.");
    }
  });
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  function failed(message: string) {
    if (handled || stopping || worker !== child) return;
    handled = true;
    lost(problem || message);
    const delay = Math.min(
      10000,
      1000 * 2 ** Math.min(consecutiveFailures++, 4),
    );
    restartTimer = setTimeout(() => {
      restarts++;
      bootWorker();
    }, delay);
  }
  child.on("error", () =>
    failed("Python worker could not start. Check the Python environment."),
  );
  child.on("exit", (code) =>
    failed(
      `Agent worker exited (${code}). Restarting automatically; saved checkpoints remain available.`,
    ),
  );
}
function rpc(command: string, body: unknown = {}) {
  return new Promise<any>((resolve, reject) => {
    if (!ready)
      return reject(
        new HttpError(failure || "Worker is starting. Retry shortly."),
      );
    if (pending.size >= 64)
      return reject(new HttpError("The server is busy. Retry shortly.", 429));
    const id = randomUUID(),
      timer = setTimeout(() => {
        pending.delete(id);
        reject(
          new HttpError(
            "Worker response timed out. Checkpoint remains in FalkorDB.",
          ),
        );
      }, 30000);
    pending.set(id, { resolve, reject, timer });
    worker.stdin.write(JSON.stringify({ id, command, body }) + "\n");
  });
}
bootWorker();
function json(res: ServerResponse, status: number, value: unknown) {
  if (res.writableEnded || res.destroyed) return;
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
}
function body(
  req: IncomingMessage,
  limit = 8192,
): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    let size = 0,
      failed = false;
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        if (!failed) {
          failed = true;
          reject(new HttpError(`Request exceeds ${limit} bytes.`, 413));
        }
        return;
      }
      if (!failed) chunks.push(chunk);
    });
    req.on("error", reject);
    req.on("end", () => {
      if (failed) return;
      let value;
      try {
        value = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      } catch {
        return reject(new HttpError("Request must contain valid JSON.", 400));
      }
      if (!value || Array.isArray(value) || typeof value !== "object")
        return reject(
          new HttpError("Request must contain a JSON object.", 400),
        );
      resolve(value);
    });
  });
}
function authorized(req: IncomingMessage) {
  if (!accessToken) return true;
  let cookie =
    (req.headers.cookie || "")
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("graphops_access="))
      ?.slice(16) || "";
  try {
    cookie = decodeURIComponent(cookie);
  } catch {
    return false;
  }
  const candidate = Buffer.from(cookie),
    expected = Buffer.from(accessToken);
  return (
    candidate.length === expected.length && timingSafeEqual(candidate, expected)
  );
}
const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};
const server = createServer(async (req, res) => {
  try {
    if (
      local &&
      !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || "")
    )
      return json(res, 403, { error: "Invalid local host." });
    const url = new URL(
      req.url || "/",
      `http://${req.headers.host || "localhost"}`,
    );
    if (
      req.headers.origin &&
      ![`http://${req.headers.host}`, `https://${req.headers.host}`].includes(
        req.headers.origin,
      )
    )
      return json(res, 403, { error: "Cross-origin access is disabled." });
    if (req.method === "POST" && req.headers["x-graphops"] !== "1")
      return json(res, 403, { error: "Application header required." });
    if (url.pathname === "/api/access" && req.method === "POST") {
      const input = await body(req),
        provided = Buffer.from(String(input.token || "")),
        expected = Buffer.from(accessToken);
      if (
        !accessToken ||
        provided.length !== expected.length ||
        !timingSafeEqual(provided, expected)
      )
        return json(res, 403, { error: "Access token is incorrect." });
      res.setHeader(
        "Set-Cookie",
        `graphops_access=${encodeURIComponent(accessToken)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.GRAPHOPS_SECURE_COOKIE === "1" ? "; Secure" : ""}`,
      );
      return json(res, 200, { authenticated: true });
    }
    if (url.pathname === "/api/logout" && req.method === "POST") {
      res.setHeader(
        "Set-Cookie",
        `graphops_access=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${process.env.GRAPHOPS_SECURE_COOKIE === "1" ? "; Secure" : ""}`,
      );
      return json(res, 200, { authenticated: false });
    }
    if (url.pathname === "/api/health")
      return json(res, ready ? 200 : 503, {
        ready,
        worker: ready ? "connected" : failure || "starting",
        access_required: !!accessToken,
        worker_restarts: restarts,
      });
    if (url.pathname.startsWith("/api/") && !authorized(req))
      return json(res, 401, { error: "Enter the demo access token." });
    if (url.pathname === "/api/events" && req.method === "GET") {
      if (streams.size >= 20)
        return json(res, 429, { error: "Too many live viewers." });
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.write('data: {"type":"connected"}\n\n');
      streams.add(res);
      const heartbeat = setInterval(() => res.write(": keepalive\n\n"), 15000);
      req.on("close", () => {
        clearInterval(heartbeat);
        streams.delete(res);
      });
      return;
    }
    if (url.pathname === "/api/workspace" && req.method === "GET")
      return json(res, 200, {
        ...(await rpc("snapshot", { task: url.searchParams.get("task") })),
        access_required: !!accessToken,
      });
    const reads: Record<string, [string, unknown]> = {
      "/api/readiness": ["readiness", {}],
      "/api/search": [
        "search",
        {
          query: url.searchParams.get("q") || "",
          service: url.searchParams.get("service"),
        },
      ],
      "/api/sources": [
        "source",
        {
          id: url.searchParams.get("id"),
          revision: url.searchParams.get("revision"),
        },
      ],
      "/api/history": [
        "history",
        {
          query: url.searchParams.get("q") || "",
          before: url.searchParams.get("before") || "",
        },
      ],
      "/api/reports": ["report", { task: url.searchParams.get("task") }],
      "/api/backup": ["backup", {}],
    };
    if (req.method === "GET" && reads[url.pathname]) {
      const [command, input] = reads[url.pathname],
        result = await rpc(command, input);
      if (command === "report" || command === "backup")
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="graphops-${command}.json"`,
        );
      return json(res, 200, result);
    }
    const commands: Record<string, string> = {
      "/api/incidents": "start",
      "/api/resume": "resume",
      "/api/questions": "question",
      "/api/company": "update_company",
      "/api/cancel": "cancel",
      "/api/diagnostics": "diagnose",
      "/api/sources": "import_source",
    };
    if (req.method === "POST" && commands[url.pathname])
      return json(
        res,
        202,
        await rpc(
          commands[url.pathname],
          await body(req, url.pathname === "/api/sources" ? 98304 : 8192),
        ),
      );
    if (url.pathname.startsWith("/api/"))
      return json(res, 404, { error: "API endpoint not found." });
    if (!["GET", "HEAD"].includes(req.method || ""))
      return json(res, 405, { error: "Method not allowed." });
    let file = resolve(web, "." + decodeURIComponent(url.pathname));
    if (file !== web && !file.startsWith(web + sep))
      return json(res, 403, { error: "Invalid path." });
    if (url.pathname.startsWith("/assets/") && !existsSync(file))
      return json(res, 404, {
        error: "Asset not found. Refresh the application.",
      });
    if (!existsSync(file) || statSync(file).isDirectory())
      file = resolve(web, "index.html");
    if (!existsSync(file))
      return json(res, 503, {
        error: "Build the interface first: cd event/web && npm run build",
      });
    res.writeHead(200, {
      "Content-Type": mime[extname(file)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": file.endsWith("index.html")
        ? "no-cache"
        : "public, max-age=31536000, immutable",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
    });
    if (req.method === "HEAD") res.end();
    else createReadStream(file).pipe(res);
  } catch (error) {
    json(res, error instanceof HttpError ? error.status : 503, {
      error: error instanceof Error ? error.message : "Request failed.",
    });
  }
});
server.requestTimeout = 35000;
server.headersTimeout = 10000;
server.maxHeadersCount = 40;
server.listen(port, host, () =>
  console.log(`GraphOps workspace: http://${host}:${port}`),
);
function stop() {
  if (stopping) return;
  stopping = true;
  if (restartTimer) clearTimeout(restartTimer);
  for (const client of streams) client.end();
  server.close();
  worker.stdin.end();
  setTimeout(() => {
    worker.kill();
    process.exit(0);
  }, 7000).unref();
  worker.once("exit", () => process.exit(0));
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
