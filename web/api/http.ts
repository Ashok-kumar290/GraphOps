import type {ServerResponse, IncomingMessage} from "node:http";
export class HttpError extends Error {
  status: number;
  constructor(message: string, status = 503) {
    super(message);
    this.status = status;
  }
}
export function json(res: ServerResponse, status: number, value: unknown) {
  if (res.writableEnded || res.destroyed) return;
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
}
export function body(
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
