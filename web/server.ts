/** Application composition: access policy, module routes, worker and assets. */
import {createServer} from "node:http";
import {host,port,python,root} from "./api/config.ts";
import {HttpError,json} from "./api/http.ts";
import {validateRequest} from "./api/access.ts";
import {createWorkerBridge} from "./api/worker.ts";
import {handleApi} from "./api/routes/index.ts";
import {serveAssets} from "./api/assets.ts";

const bridge=createWorkerBridge(python,root);
const server=createServer(async(req,res)=>{
 try{
  validateRequest(req);
  const url=new URL(req.url||"/",`http://${req.headers.host||"localhost"}`);
  if(await handleApi(req,res,url,bridge))return;
  serveAssets(req,res,url);
 }catch(error){json(res,error instanceof HttpError?error.status:503,{error:error instanceof Error?error.message:"Request failed."});}
});
server.requestTimeout=35000;server.headersTimeout=10000;server.maxHeadersCount=40;
server.listen(port,host,()=>console.log(`GraphOps company copilot: http://${host}:${port}`));
let stopping=false;
function stop(){if(stopping)return;stopping=true;server.close();void bridge.stop().then(()=>process.exit(0));}
process.on("SIGINT",stop);process.on("SIGTERM",stop);
