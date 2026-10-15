import type {RouteGroup} from "../contracts.ts";
export function runRoutes(url:URL):RouteGroup {
 return {reads:{
  "/api/history":["history",{query:url.searchParams.get("q")||"",before:url.searchParams.get("before")||""}],
  "/api/reports":["report",{task:url.searchParams.get("task")}]
 },writes:{"/api/incidents":"start","/api/resume":"resume","/api/cancel":"cancel"}};
}
