import type {RouteGroup} from "../contracts.ts";
export function companyRoutes(url:URL):RouteGroup {
 return {reads:{
  "/api/search":["search",{query:url.searchParams.get("q")||"",service:url.searchParams.get("service")}],
  "/api/sources":["source",{id:url.searchParams.get("id"),revision:url.searchParams.get("revision")}],
  "/api/company-context":["company_context",{service:url.searchParams.get("service")||"payments"}],
  "/api/graph":["graph",{service:url.searchParams.get("service")||"gateway"}],
  "/api/memory":["memory",{service:url.searchParams.get("service")||"payments"}],
  "/api/connectors":["connectors",{}]
 },writes:{"/api/questions":"question","/api/company":"update_company","/api/sources":"import_source","/api/connectors":"connect"}};
}
