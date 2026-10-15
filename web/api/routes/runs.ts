import type {RouteGroup} from "../contracts.ts";
export function runRoutes(url:URL):RouteGroup {
 return {reads:{
  "/api/history":["history",{query:url.searchParams.get("q")||"",before:url.searchParams.get("before")||""}],
  "/api/reports":["report",{task:url.searchParams.get("task")}],
  "/api/run-events":["run_events",{task:url.searchParams.get("task"),after:url.searchParams.get("after")||"",limit:Number(url.searchParams.get("limit")||200)}]
 },writes:{"/api/incidents":"start","/api/resume":"resume","/api/cancel":"cancel"}};
}
