import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "./app/App";
import { WorkspaceProvider, useWorkspace } from "./app/WorkspaceContext";
import { SourceManager } from "./features/company/SourceManager";
import { RunHistory } from "./features/runs/RunHistory";
import { SystemPanel } from "./features/system/SystemPanel";
import { KnowledgeGraph } from "./features/graph/KnowledgeGraph";
import { ServiceGraph } from "./features/graph/ServiceGraph";
import { api } from "./shared/api";
import type { Doc, Workspace } from "./shared/contracts";
import { incidentFixture, questionEventsFixture, questionFixture, workspaceFixture } from "./features/walkthrough/fixtures";

const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), {status, headers:{"Content-Type":"application/json"}});
function deferred<T>() {let resolve!: (value:T) => void; const promise = new Promise<T>(done => {resolve=done;}); return {promise,resolve};}
const source: Doc = {id:"owned-example",kind:"reference",title:"Review policy",text:"Review in 72 hours.",revision:"rev-1",source:"owned:document/example",data:{filename:"policy.md",document_type:"policy"}};
const readiness = {components:{graph:{status:"online"},lab:{status:"online"},model:{status:"available"},mcp:{status:"unchecked"}}};
function network(data = workspaceFixture(), handler?: (path:string, options?:RequestInit) => Response | Promise<Response> | undefined) {
  const fetch = vi.fn(async (path:string, options?:RequestInit) => {
    const custom = handler?.(path,options); if (custom !== undefined) return await custom;
    return response(path.startsWith("/api/workspace") ? data : path.startsWith("/api/readiness") ? readiness : path.startsWith("/api/history") ? {tasks:[],audits:[]} : {});
  }); vi.stubGlobal("fetch",fetch); return fetch;
}
async function loaded() {await screen.findByText("FalkorDB connected");}
beforeEach(() => {localStorage.clear(); vi.stubGlobal("EventSource",class {onmessage: unknown; close(){}});});
afterEach(() => {cleanup();vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();});

test.each([
  ["Company knowledge","Ask the company agent about payments"],
  ["Connected graph","Relationships guide the agent"],
  ["Agent tasks","How the demonstration works"],
  ["Memory navigator","A new session starts with evidence."],
  ["System & backups","System readiness"],
  ["Run history","Run history"],
])("Navigation opens %s and focuses the page title", async (name,heading) => {
  network();render(<App/>);await loaded();fireEvent.click(screen.getByRole("button",{name}));
  expect(await screen.findByRole("heading",{name:heading,level:2})).toBeTruthy();
  expect(document.activeElement?.id).toBe("page-title");
});

test.each(["1. Company knowledge","2. Connected graph","3. Agent","4. Actions","5. Shared memory","6. Workspace"])("Home module link %s opens its page", async name => {
  network();render(<App/>);await loaded();fireEvent.click(screen.getByText("Explore the six modules behind the demonstration"));
  fireEvent.click(screen.getByRole("button",{name:new RegExp(name.replaceAll(".","\\."))}));
  expect(screen.getByRole("navigation",{name:"Main navigation"}).querySelector('[aria-current="page"]')?.textContent).not.toBe("Start here");
});

test("Ownership and both procedure controls send the selected service and acknowledge success", async () => {
  const data=workspaceFixture(),fetch=network(data, (path,options) => options?.method==="POST" ? response({updated:true}) : undefined);
  render(<App/>);await loaded();fireEvent.click(screen.getByRole("button",{name:"Company knowledge"}));
  fireEvent.change(screen.getByRole("textbox",{name:"New service owner"}),{target:{value:"Response Team"}});
  fireEvent.click(screen.getByRole("button",{name:"Update owner"}));
  await screen.findByText(/Company change saved/);
  expect((screen.getByRole("textbox",{name:"New service owner"}) as HTMLInputElement).value).toBe("");
  fireEvent.click(screen.getByRole("button",{name:"Dismiss notification"}));
  for (const name of ["Retire current procedure","Publish supported procedure"]) {
    await waitFor(() => expect((screen.getByRole("button",{name}) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button",{name}));await screen.findByText(/Company change saved/);
    await waitFor(() => expect((screen.getByRole("button",{name}) as HTMLButtonElement).disabled).toBe(false));
  }
  expect(fetch.mock.calls.filter(([,o])=>o?.method==="POST").map(([,o])=>JSON.parse(o!.body as string))).toEqual([
    {service:"payments",operation:"owner",owner:"Response Team"}, {service:"payments",operation:"retire_runbook"}, {service:"payments",operation:"restore_runbook"},
  ]);
  fireEvent.change(screen.getByRole("textbox",{name:"New service owner"}),{target:{value:"Payments only"}});
  fireEvent.click(screen.getByRole("button",{name:"orders"}));
  expect((screen.getByRole("textbox",{name:"New service owner"}) as HTMLInputElement).value).toBe("");
});

test("A slow workspace refresh cannot overwrite a newly selected run", async () => {
  const old=workspaceFixture(),a=incidentFixture(),b={...a,id:"INC-NEW"};old.selected=a;old.tasks=[a,b];
  const stale=deferred<Response>();let reads=0;
  const fetch=network(old,path => path.startsWith("/api/workspace") ? ++reads===2 ? stale.promise : response(path.includes("INC-NEW")?{...old,selected:b}:old) : undefined);
  function Probe(){const c=useWorkspace();return <><span>{c.selected?.id||"No selection"}</span><button onClick={()=>void c.refresh()}>Refresh</button><button onClick={()=>c.choose(b.id,b)}>Choose new</button></>;}
  render(<WorkspaceProvider><Probe/></WorkspaceProvider>);await screen.findByText(a.id);
  fireEvent.click(screen.getByRole("button",{name:"Refresh"}));fireEvent.click(screen.getByRole("button",{name:"Choose new"}));
  expect(screen.queryByText(a.id)).toBeNull();
  await act(async()=>stale.resolve(response(old)));
  expect(await screen.findByText(b.id)).toBeTruthy();expect(fetch.mock.calls.some(([p])=>p.includes("task=INC-NEW"))).toBe(true);
});

test("Logging out rejects late snapshots and clears the persisted selection", async () => {
  const data=workspaceFixture();data.access_required=true;const stale=deferred<Response>();let reads=0,locked=false;
  localStorage.setItem("graphops-task","INC-OLD");
  network(data,(path,options)=>{
    if (path==="/api/logout") {locked=true;return response({locked:true});}
    if (path.startsWith("/api/workspace")) return ++reads===2 ? stale.promise : locked?response({error:"Enter access token"},401):response(data);
  });
  render(<App/>);await loaded();fireEvent.click(screen.getByRole("button",{name:"Refresh workspace"}));
  fireEvent.click(screen.getByRole("button",{name:"Lock workspace"}));await screen.findByRole("heading",{name:"Demo access"});
  await act(async()=>stale.resolve(response(data)));
  expect(screen.getByRole("heading",{name:"Demo access"})).toBeTruthy();expect(screen.queryByRole("button",{name:"Start guided walkthrough"})).toBeNull();
  await waitFor(()=>expect(localStorage.getItem("graphops-task")).toBeNull());
});

test("Unlock shows failures, prevents empty submission, then loads the workspace", async () => {
  let unlocked=false;const fetch=network(workspaceFixture(),(path,options)=>{
    if(path.startsWith("/api/workspace")&&!unlocked)return response({error:"Access required"},401);
    if(path==="/api/access") {unlocked=JSON.parse(options!.body as string).token==="correct";return response(unlocked?{authenticated:true}:{error:"Wrong demo token"},unlocked?200:403);}
  });
  render(<App/>);const token=await screen.findByLabelText("Workspace access token");
  expect((screen.getByRole("button",{name:"Unlock workspace"}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(token,{target:{value:"wrong"}});fireEvent.click(screen.getByRole("button",{name:"Unlock workspace"}));await screen.findByText("Wrong demo token");
  fireEvent.change(token,{target:{value:"correct"}});fireEvent.click(screen.getByRole("button",{name:"Unlock workspace"}));await loaded();
  expect(screen.queryByRole("heading",{name:"Demo access"})).toBeNull();expect(fetch.mock.calls.filter(([p])=>p==="/api/access")).toHaveLength(2);
});

test("A disconnected workspace keeps mutations disabled until an actual successful refresh", async () => {
  let offline=false;network(workspaceFixture(),path=>path.startsWith("/api/workspace")&&offline?response({error:"Worker unavailable"},503):undefined);
  render(<App/>);await loaded();fireEvent.click(screen.getByRole("button",{name:"Company knowledge"}));
  offline=true;fireEvent.click(screen.getByRole("button",{name:"Refresh workspace"}));await screen.findByText(/Displayed records may be stale/);
  expect((screen.getByRole("button",{name:"Retire current procedure"}) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByRole("button",{name:"Dismiss error"})).toBeNull();
  offline=false;fireEvent.click(screen.getByRole("button",{name:"Reconnect workspace"}));
  await waitFor(()=>expect((screen.getByRole("button",{name:"Retire current procedure"}) as HTMLButtonElement).disabled).toBe(false));
});

test("Duplicate command submissions share one operation while awaiting the server", async () => {
  const slow=deferred<Response>(),fetch=network(workspaceFixture(),path=>path==="/api/incidents"?slow.promise:undefined);
  render(<App/>);await loaded();fireEvent.click(screen.getByRole("button",{name:"Agent tasks"}));
  const run=screen.getByRole("button",{name:"Run agent"});fireEvent.click(run);fireEvent.click(run);
  expect(fetch.mock.calls.filter(([p])=>p==="/api/incidents")).toHaveLength(1);await act(async()=>slow.resolve(response({task:"INC-NEW"})));
});

test("Download controls fetch real payloads once and prepare named JSON files", async () => {
  const data=workspaceFixture(),task=incidentFixture();data.selected=task;data.tasks=[task];
  const slow=deferred<Response>(),fetch=network(data,path=>path==="/api/backup"?slow.promise:path.startsWith("/api/reports")?response({schema:"graphops.incident.v1"}):undefined);
  const blobs:Blob[]=[],links:string[]=[];
  vi.stubGlobal("URL",Object.assign(URL,{createObjectURL:vi.fn((blob:Blob)=>{blobs.push(blob);return "blob:audit";}),revokeObjectURL:vi.fn()}));
  vi.spyOn(HTMLAnchorElement.prototype,"click").mockImplementation(function(this:HTMLAnchorElement){links.push(this.download);});
  render(<App/>);await loaded();fireEvent.click(screen.getByRole("button",{name:"System & backups"}));
  const download=screen.getByRole("button",{name:"Download workspace backup"});fireEvent.click(download);fireEvent.click(download);
  expect(fetch.mock.calls.filter(([p])=>p==="/api/backup")).toHaveLength(1);
  await act(async()=>slow.resolve(response({schema:"graphops.workspace.v1"})));
  await screen.findByText("Download prepared: graphops-workspace-backup.json");
  fireEvent.click(screen.getByRole("button",{name:"Agent tasks"}));fireEvent.click(screen.getByRole("button",{name:"Download incident report"}));
  await screen.findByText(`Download prepared: ${task.id}.json`);
  expect(links).toEqual(["graphops-workspace-backup.json",task.id+".json"]);expect(blobs.map(b=>b.type)).toEqual(["application/json","application/json"]);
});

test("Source edit uses the current revision, supports cancel, and preserves a conflicting draft", async () => {
  const api=vi.fn(async(path:string,body?:unknown)=>{if(body)throw new Error("Source changed. Open latest before editing.");return {...source,revision:"rev-2"};});
  render(<SourceManager api={api} busy={false} inspect={vi.fn()} service="payments" documents={[source]} onChanged={async()=>{}}/>);
  fireEvent.click(screen.getByRole("button",{name:"Edit source"}));await screen.findByRole("button",{name:"Save new revision"});
  expect((screen.getByLabelText("Source filename") as HTMLInputElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Source content"),{target:{value:"My pending change"}});fireEvent.click(screen.getByRole("button",{name:"Save new revision"}));
  await screen.findByRole("alert");expect(api.mock.calls[1][1]).toMatchObject({id:source.id,base_revision:"rev-2",text:"My pending change"});
  expect((screen.getByLabelText("Source content") as HTMLTextAreaElement).value).toBe("My pending change");
  fireEvent.click(screen.getByRole("button",{name:"Cancel edit"}));expect((screen.getByLabelText("Source content") as HTMLTextAreaElement).value).toBe("");
});

test("Source search can inspect its captured revision and clear the results", async () => {
  const inspect=vi.fn(),api=vi.fn(async(path:string)=>path.startsWith("/api/search")?{documents:[source]}:source);
  render(<SourceManager api={api} busy={false} inspect={inspect} service="payments" documents={[]} onChanged={async()=>{}}/>);
  fireEvent.change(screen.getByLabelText("Search company sources"),{target:{value:"72 hours"}});fireEvent.click(screen.getByRole("button",{name:"Search"}));
  fireEvent.click(await screen.findByRole("button",{name:/Review policy Review in/}));await waitFor(()=>expect(inspect).toHaveBeenCalledWith(source.title,source));
  expect(api.mock.calls[1][0]).toContain("revision=rev-1");
  fireEvent.click(screen.getByRole("button",{name:"Clear search"}));expect(screen.queryByText(source.title)).toBeNull();
});

test("Changing a source query discards an in-flight result", async () => {
  const slow=deferred<any>();render(<SourceManager api={()=>slow.promise} busy={false} inspect={vi.fn()} service="payments" documents={[]} onChanged={async()=>{}}/>);
  const query=screen.getByLabelText("Search company sources");fireEvent.change(query,{target:{value:"old"}});fireEvent.click(screen.getByRole("button",{name:"Search"}));
  fireEvent.change(query,{target:{value:"new"}});await act(async()=>slow.resolve({documents:[source]}));expect(screen.queryByText(source.title)).toBeNull();
});

test.each([
  [{name:"big.txt",size:65537,text:async()=>"text"},"under 64 KB"],
  [{name:"binary.txt",size:5,text:async()=>"a\0b"},"plain text"],
  [{name:"long.md",size:16001,text:async()=>"x".repeat(16001)},"16000 characters"],
])("Invalid local source files report a visible error (%#)", async(file,message) => {
  render(<SourceManager api={vi.fn()} busy={false} inspect={vi.fn()} service="payments" documents={[]} onChanged={async()=>{}}/>);
  fireEvent.change(screen.getByLabelText("Read a local file"),{target:{files:[file]}});
  expect((await screen.findByRole("alert")).textContent).toContain(message);
});

test("File reading blocks importing partial content and fills the editor when ready", async()=>{
  const text=deferred<string>();render(<SourceManager api={vi.fn()} busy={false} inspect={vi.fn()} service="payments" documents={[]} onChanged={async()=>{}}/>);
  fireEvent.change(screen.getByLabelText("Read a local file"),{target:{files:[{name:"review.md",size:20,text:()=>text.promise}]}});
  expect((screen.getByRole("button",{name:/Please wait/}) as HTMLButtonElement).disabled).toBe(true);
  await act(async()=>text.resolve("Synthetic policy text"));expect((screen.getByLabelText("Source title") as HTMLInputElement).value).toBe("review");
  expect((screen.getByLabelText("Source filename") as HTMLInputElement).value).toBe("review.md");expect((screen.getByLabelText("Source content") as HTMLTextAreaElement).value).toBe("Synthetic policy text");
});

test("History pagination uses the submitted query even when its input changes", async()=>{
  const task=incidentFixture(),choose=vi.fn(),api=vi.fn(async(path:string)=>({tasks:[{...task,id:path.includes("before=")?"INC-OLDER":task.id}],audits:[],next_cursor:path.includes("before=")?null:"older"}));
  render(<RunHistory api={api} inspect={vi.fn()} onChoose={choose}/>);await screen.findByText(task.id);
  fireEvent.change(screen.getByLabelText("Search run history"),{target:{value:"payments"}});fireEvent.click(screen.getByRole("button",{name:"Search"}));
  await waitFor(()=>expect(api.mock.calls).toHaveLength(2));await waitFor(()=>expect((screen.getByRole("button",{name:"Load older runs"}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.change(screen.getByLabelText("Search run history"),{target:{value:"not submitted"}});fireEvent.click(screen.getByRole("button",{name:"Load older runs"}));await screen.findByText("INC-OLDER");
  expect(api.mock.calls[2][0]).toContain("q=payments&before=older");fireEvent.click(screen.getByRole("button",{name:/INC-OLDER/}));expect(choose).toHaveBeenCalledWith("INC-OLDER",expect.anything());
});

test("An old history response cannot replace a newer search", async()=>{
  const old=deferred<any>(),api=vi.fn((path:string)=>path.includes("q=new")?Promise.resolve({tasks:[{...incidentFixture(),id:"INC-NEW"}],audits:[]}):old.promise);
  render(<RunHistory api={api} inspect={vi.fn()} onChoose={vi.fn()}/>);fireEvent.change(screen.getByLabelText("Search run history"),{target:{value:"new"}});
  fireEvent.submit(screen.getByRole("button",{name:"Search"}).closest("form")!);await screen.findByText("INC-NEW");
  await act(async()=>old.resolve({tasks:[incidentFixture()],audits:[]}));expect(screen.queryByText("INC-GUIDE")).toBeNull();
});

test("Graph nodes and relationships support both Enter and Space without scrolling",()=>{
  const data=workspaceFixture(),inspect=vi.fn(),select=vi.fn();data.graph.nodes.push({key:8,id:source.id,kind:"Document",title:source.title,source:source.source});data.graph.edges.push({from:2,to:8,kind:"HAS_DOCUMENT",source:source.source});
  render(<><KnowledgeGraph data={data} service="payments" inspect={inspect}/><ServiceGraph data={data} active="payments" onSelect={select}/></>);
  for(const key of ["Enter"," "]){fireEvent.keyDown(screen.getByRole("button",{name:"Inspect Document Review policy"}),{key});fireEvent.keyDown(screen.getByRole("button",{name:/Inspect HAS DOCUMENT relationship/}),{key});fireEvent.keyDown(screen.getByRole("button",{name:"Inspect orders"}),{key});}
  expect(inspect).toHaveBeenCalledTimes(4);expect(select.mock.calls).toEqual([["orders"],["orders"]]);
});

test("Unreadable server responses retain their HTTP status and produce a usable error",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>new Response("not JSON",{status:502})));
  await expect(api("/api/workspace")).rejects.toMatchObject({status:502,message:expect.stringContaining("unreadable response")});
});
test("A network failure after a submitted command warns against duplicate effects",async()=>{
  const fetch=vi.fn(async()=>{throw new TypeError("network failed");});vi.stubGlobal("fetch",fetch);
  await expect(api("/api/incidents",{scenario:"config"})).rejects.toThrow("may have been accepted");expect(fetch).toHaveBeenCalledTimes(1);
});

test("Scenario and execution-mode selectors change the submitted action and baseline notice",async()=>{
  const fetch=network(workspaceFixture(),(path,options)=>options?.method==="POST"?response({task:"INC-BASELINE"}):undefined);
  render(<App/>);await loaded();fireEvent.click(screen.getByRole("button",{name:"Agent tasks"}));
  fireEvent.change(screen.getByLabelText("Scenario"),{target:{value:"worker"}});fireEvent.change(screen.getByLabelText("Execution mode"),{target:{value:"scripted"}});
  expect(screen.getByText(/Scripted baseline selected/)).toBeTruthy();fireEvent.click(screen.getByRole("button",{name:"Run agent"}));
  await waitFor(()=>expect(fetch.mock.calls.some(([p])=>p==="/api/incidents")).toBe(true));
  expect(JSON.parse(fetch.mock.calls.find(([p])=>p==="/api/incidents")![1]!.body as string)).toMatchObject({scenario:"worker",mode:"scripted"});
});

test("Memory service tabs switch packets and conflicting claims open their evidence",async()=>{
  const data=workspaceFixture();data.memory.orders.conflicts=[{claim:"health",values:["healthy","unhealthy"]}];network(data);
  render(<App/>);await loaded();fireEvent.click(screen.getByRole("button",{name:"Memory navigator"}));
  fireEvent.click(within(document.querySelector(".service-tabs") as HTMLElement).getByRole("button",{name:/orders/}));
  fireEvent.click(screen.getByRole("button",{name:/Conflicting claims need fresh verification/}));
  expect(screen.getByRole("dialog",{name:"Conflicting memory claims"}).textContent).toContain("unhealthy");
});

test("A busy source editor cannot submit through the form's Enter handler",async()=>{
  const api=vi.fn(),props={api,busy:false,inspect:vi.fn(),service:"payments",documents:[],onChanged:async()=>{}};
  const view=render(<SourceManager {...props}/>);fireEvent.click(screen.getByRole("button",{name:"Load synthetic sample"}));
  view.rerender(<SourceManager {...props} busy/>);fireEvent.submit(screen.getByRole("button",{name:"Import source"}).closest("form")!);
  expect(api).not.toHaveBeenCalled();
});

test("History clear search reloads all records and request failures remain visible",async()=>{
  let fail=false;const api=vi.fn(async(path:string)=>{if(fail)throw new Error("History connection lost");return {tasks:[],audits:[]};});
  render(<RunHistory api={api} inspect={vi.fn()} onChoose={vi.fn()}/>);await screen.findByText("No matching runs.");
  fireEvent.change(screen.getByLabelText("Search run history"),{target:{value:"orders"}});fireEvent.click(screen.getByRole("button",{name:"Search"}));
  await waitFor(()=>expect((screen.getByRole("button",{name:"Clear search"}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button",{name:"Clear search"}));await waitFor(()=>expect(api.mock.calls.at(-1)![0]).toBe("/api/history?q="));
  await waitFor(()=>expect((screen.getByRole("button",{name:"Search"}) as HTMLButtonElement).disabled).toBe(false));fail=true;
  fireEvent.click(screen.getByRole("button",{name:"Search"}));expect((await screen.findByRole("alert")).textContent).toContain("History connection lost");
});

test("System readiness refresh recovers from a visible dependency error",async()=>{
  let calls=0;const api=vi.fn(async()=>{if(++calls===1)throw new Error("Readiness unavailable");return readiness;});
  render(<SystemPanel api={api} busy={false} data={workspaceFixture()} inspect={vi.fn()} onDiagnose={vi.fn()} onBackup={vi.fn()}/>);
  expect((await screen.findByRole("alert")).textContent).toBe("Readiness unavailable");fireEvent.click(screen.getByRole("button",{name:"Refresh status"}));
  await waitFor(()=>expect(screen.queryByRole("alert")).toBeNull());expect(screen.getAllByText("online")).toHaveLength(2);
});

test("A timed-out request releases its UI wait and never automatically retries a mutation",async()=>{
  vi.useFakeTimers();const fetch=vi.fn((_path:string,options:RequestInit)=>new Promise((_,reject)=>options.signal!.addEventListener("abort",()=>reject(new DOMException("Aborted","AbortError")))));
  vi.stubGlobal("fetch",fetch);const result=api("/api/resume",{task:"INC-WAIT"}).catch(error=>error);
  await vi.advanceTimersByTimeAsync(35000);expect((await result).message).toContain("request timed out");expect(fetch).toHaveBeenCalledTimes(1);
});

test("Guide shortcuts reopen the current step and its own run after inspecting another incident",async()=>{
  const data=workspaceFixture(),other={...incidentFixture(),id:"INC-OTHER"};data.tasks=[other];data.selected=other;
  network(data,(path,options)=>{
    if(path==="/api/questions"&&options?.method==="POST"){data.tasks.push(questionFixture);data.selected=questionFixture;data.events=questionEventsFixture();return response({task:questionFixture.id});}
    if(path.startsWith("/api/workspace?task=")){const question=path.includes(questionFixture.id);return response({...data,selected:question?questionFixture:other,events:question?questionEventsFixture():[]});}
  });
  render(<App/>);await loaded();fireEvent.click(screen.getByRole("button",{name:"Start guided walkthrough"}));fireEvent.click(screen.getByRole("button",{name:"Ask"}));
  await screen.findByLabelText("Saved company answer");fireEvent.click(screen.getByRole("button",{name:"Memory navigator"}));
  fireEvent.click(screen.getByRole("button",{name:"Open current step"}));expect(screen.getByLabelText("Company question")).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:/INC-OTHER/}));const reopen=await screen.findByRole("button",{name:"Open this run"});fireEvent.click(reopen);
  await screen.findByLabelText("Saved company answer");expect(screen.getByRole("heading",{level:1}).textContent).toBe("Company knowledge");
});
