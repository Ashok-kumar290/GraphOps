import type {RouteGroup} from "../contracts.ts";
export function companyRoutes(url:URL):RouteGroup {
 return {reads:{
  "/api/search":["search",{query:url.searchParams.get("q")||"",service:url.searchParams.get("service")}],
  "/api/sources":["source",{id:url.searchParams.get("id"),revision:url.searchParams.get("revision")}]
 },writes:{"/api/questions":"question","/api/company":"update_company","/api/sources":"import_source"}};
}
