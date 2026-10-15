import type {IncomingMessage,ServerResponse} from "node:http";
import {existsSync,createReadStream,statSync} from "node:fs";
import {resolve,sep,extname} from "node:path";
import {web} from "./config.ts";
import {json} from "./http.ts";
const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

export function serveAssets(req:IncomingMessage,res:ServerResponse,url:URL){
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
}
