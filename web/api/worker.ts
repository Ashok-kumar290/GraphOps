import {spawn, type ChildProcessWithoutNullStreams} from "node:child_process";
import {createInterface} from "node:readline";
import {randomUUID} from "node:crypto";
import type {ServerResponse, IncomingMessage} from "node:http";
import {HttpError} from "./http.ts";

export function createWorkerBridge(python: string, root: string) {
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
return {
 rpc,
 health: () => ({ready, worker: ready ? "connected" : failure || "starting", worker_restarts: restarts}),
 connect(req: IncomingMessage, res: ServerResponse) {
  if(streams.size>=20) throw new HttpError("Too many live viewers.",429);
  res.writeHead(200,{"Content-Type":"text/event-stream","Cache-Control":"no-cache",Connection:"keep-alive","X-Accel-Buffering":"no"});
  res.write('data: {"type":"connected"}\n\n');streams.add(res);
  const heartbeat=setInterval(()=>res.write(": keepalive\n\n"),15000);
  req.on("close",()=>{clearInterval(heartbeat);streams.delete(res);});
 },
 stop() {
  stopping=true;if(restartTimer)clearTimeout(restartTimer);
  for(const client of streams)client.end();
  return new Promise<void>(resolve=>{
   if(worker.exitCode!==null || worker.signalCode!==null){resolve();return;}
   const timer=setTimeout(()=>{worker.kill();resolve();},7000);
   worker.once("exit",()=>{clearTimeout(timer);resolve();});worker.stdin.end();
  });
 }
};
}
export type WorkerBridge=ReturnType<typeof createWorkerBridge>;
