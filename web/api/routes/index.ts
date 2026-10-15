import type {IncomingMessage,ServerResponse} from "node:http";
import type {WorkerBridge} from "../worker.ts";
import {accessToken} from "../config.ts";
import {authorized,login,logout} from "../access.ts";
import {body,json} from "../http.ts";
import {companyRoutes} from "./company.ts";
import {runRoutes} from "./runs.ts";
import {workspaceRoutes} from "./workspace.ts";

export async function handleApi(req:IncomingMessage,res:ServerResponse,url:URL,bridge:WorkerBridge) {
 if(!url.pathname.startsWith("/api/"))return false;
 if(url.pathname==="/api/access"&&req.method==="POST"){await login(req,res);return true;}
 if(url.pathname==="/api/logout"&&req.method==="POST"){logout(res);return true;}
 if(url.pathname==="/api/health"){const health=bridge.health();json(res,health.ready?200:503,{...health,access_required:!!accessToken});return true;}
 if(!authorized(req)){json(res,401,{error:"Enter the demo access token."});return true;}
 if(url.pathname==="/api/events"&&req.method==="GET"){bridge.connect(req,res);return true;}
 if(url.pathname==="/api/workspace"&&req.method==="GET"){json(res,200,{...(await bridge.rpc("snapshot",{task:url.searchParams.get("task")})),access_required:!!accessToken});return true;}
 const groups=[companyRoutes(url),runRoutes(url),workspaceRoutes()];
 for(const group of groups){
  if(req.method==="GET"&&group.reads[url.pathname]){
   const [command,input]=group.reads[url.pathname],result=await bridge.rpc(command,input);
   if(command==="report"||command==="backup")res.setHeader("Content-Disposition",`attachment; filename="graphops-${command}.json"`);
   json(res,200,result);return true;
  }
  if(req.method==="POST"&&group.writes[url.pathname]){
   const input=await body(req,url.pathname==="/api/sources"?98304:8192);
   json(res,202,await bridge.rpc(group.writes[url.pathname],input));return true;
  }
 }
 json(res,404,{error:"API endpoint not found."});return true;
}
