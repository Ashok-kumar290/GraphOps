import type {IncomingMessage,ServerResponse} from "node:http";
import type {WorkerBridge} from "../worker.ts";
import {accessToken,publicView} from "../config.ts";
import {authorized,login,logout} from "../access.ts";
import {body,json} from "../http.ts";
import {companyRoutes} from "./company.ts";
import {runRoutes} from "./runs.ts";
import {workspaceRoutes} from "./workspace.ts";

export async function handleApi(req:IncomingMessage,res:ServerResponse,url:URL,bridge:WorkerBridge) {
 if(!url.pathname.startsWith("/api/"))return false;
 if(url.pathname==="/api/access"&&req.method==="POST"){await login(req,res);return true;}
 if(url.pathname==="/api/logout"&&req.method==="POST"){logout(res);return true;}
 const signedIn=authorized(req),access={access_required:!!accessToken,public_view:publicView,authenticated:signedIn};
 if(url.pathname==="/api/health"){const health=bridge.health();json(res,health.ready?200:503,{...health,...access});return true;}
 if(!signedIn&&!(publicView&&req.method==="GET")){json(res,401,{error:publicView?"Viewing is public. Enter the access token to run agents or change the workspace.":"Enter the demo access token."});return true;}
 if(url.pathname==="/api/events"&&req.method==="GET"){bridge.connect(req,res);return true;}
 if(url.pathname==="/api/monitor"&&req.method==="GET"){
  const usage=process.cpuUsage();
  const api={name:"Node HTTP API",pid:process.pid,running:true,rss_bytes:process.memoryUsage().rss,cpu_seconds:(usage.user+usage.system)/1e6,uptime_seconds:process.uptime(),metrics_available:true};
  let report:any;
  try {report=await bridge.rpc("monitor",{task:url.searchParams.get("task")});}
  catch {report={schema:"graphops.monitor.v1",degraded:true,error:"Agent worker is unavailable. The API supervisor will retry.",processes:[],modules:[]};}
  json(res,200,{...report,server:bridge.health(),observed_at:report.observed_at||new Date().toISOString(),processes:[api,...report.processes]});return true;
 }
 if(url.pathname==="/api/workspace"&&req.method==="GET"){json(res,200,{...(await bridge.rpc("snapshot",{task:url.searchParams.get("task")})),...access});return true;}
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
