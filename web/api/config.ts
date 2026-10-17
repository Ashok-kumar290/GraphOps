import {fileURLToPath} from "node:url";
import {existsSync} from "node:fs";
import {resolve} from "node:path";
const root = fileURLToPath(new URL("../../", import.meta.url)),
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
  accessToken = process.env.GRAPHOPS_ACCESS_TOKEN || "",
  // Public view: anyone may read; every change still needs the access token.
  publicView = !!accessToken && process.env.GRAPHOPS_PUBLIC_VIEW === "1";
const local = ["127.0.0.1", "localhost"].includes(host);
if (!local && accessToken.length < 24)
  throw new Error(
    "Network hosting requires GRAPHOPS_ACCESS_TOKEN of at least 24 characters.",
  );

export {root,web,python,host,port,accessToken,publicView,local};
