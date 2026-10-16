import type {RouteGroup} from "../contracts.ts";
export function workspaceRoutes():RouteGroup {
 return {reads:{"/api/readiness":["readiness",{}],"/api/backup":["backup",{}]},writes:{"/api/diagnostics":"diagnose","/api/verify":"verify"}};
}
