import React from "react";
import { Blob as NodeBlob } from "node:buffer";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../src/app/App";

// This driver uses real HTTP, cookies and SSE. It never targets the normal app.
const base=process.env.GRAPHOPS_FRONTEND_URL || "", token=process.env.GRAPHOPS_ACCESS_TOKEN || "";
const workspace=process.env.GRAPHOPS_FRONTEND_WORKSPACE || "";
const realFetch=globalThis.fetch;
let cookie="",frames=0;
const calls:{path:string;method:string;status:number}[]=[];
const tasks:{path:string;id:string}[]=[];
const downloads:{name:string;value:any}[]=[];
const blobs=new Map<string,Blob>();
let questionId="", incidentId="";
async function transport(path:string,options:RequestInit={}) {
  const headers=new Headers(options.headers);if(cookie)headers.set("Cookie",cookie);
  const result=await realFetch(new URL(path,base),{...options,headers});
  const set=result.headers.get("set-cookie");if(set)cookie=set.includes("Max-Age=0")?"":set.split(";")[0];
  calls.push({path,method:options.method||"GET",status:result.status});
  if(options.method==="POST" && result.ok && path!=="/api/access") {
    const data=await result.clone().json();if(typeof data.task==="string")tasks.push({path,id:data.task});
  }
  return result;
}
class LiveEvents {
  onmessage:((event:{data:string})=>void)|null=null;
  controller=new AbortController();
  constructor(path:string){void this.read(path);}
  async read(path:string){
    try {
      const response=await transport(path,{signal:this.controller.signal});if(!response.ok||!response.body)return;
      const reader=response.body.getReader(),decoder=new TextDecoder();let text="";
      while(!this.controller.signal.aborted){
        const {done,value}=await reader.read();if(done)break;text+=decoder.decode(value,{stream:true});
        let end;
        while((end=text.indexOf("\n\n"))>=0){const frame=text.slice(0,end);text=text.slice(end+2);
          const data=frame.split("\n").filter(line=>line.startsWith("data:")).map(line=>line.slice(5).trim()).join("\n");
          if(data){frames++;this.onmessage?.({data});}
        }
      }
    } catch(error){if(!this.controller.signal.aborted)throw error;}
  }
  close(){this.controller.abort();}
}
async function read(path:string){const response=await transport(path);expect(response.ok).toBe(true);return response.json();}
async function loaded(){await screen.findByText("FalkorDB connected",{}, {timeout:15000});}
function nav(name:string){fireEvent.click(screen.getByRole("button",{name}));}
function close(){fireEvent.click(screen.getByRole("button",{name:"Close inspector"}));}
async function idle(button:HTMLElement){await waitFor(()=>expect((button as HTMLButtonElement).disabled).toBe(false),{timeout:120000});}
async function recovered(){await screen.findByText("Recovery and memory recorded",{}, {timeout:120000});await idle(screen.getByRole("button",{name:"Run agent"}));}

beforeAll(()=>{
  const url=new URL(base);expect(["localhost","127.0.0.1"]).toContain(url.hostname);expect(url.port).toBe("8084");
  expect(workspace.startsWith("frontend-")).toBe(true);expect(token.length).toBeGreaterThanOrEqual(24);
});
beforeEach(()=>{
  localStorage.clear();
  vi.stubGlobal("fetch",transport);vi.stubGlobal("EventSource",LiveEvents);vi.stubGlobal("Blob",NodeBlob);
  vi.stubGlobal("URL",class extends URL {
    static createObjectURL(blob:Blob){const id="blob:live-"+blobs.size;blobs.set(id,blob);return id;}
    static revokeObjectURL(id:string){blobs.delete(id);}
  });
  vi.spyOn(HTMLAnchorElement.prototype,"click").mockImplementation(function(this:HTMLAnchorElement){
    const blob=blobs.get(this.href);if(blob)void blob.text().then(text=>downloads.push({name:this.download,value:JSON.parse(text)}));
  });
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
afterAll(()=>{expect(frames).toBeGreaterThan(0);expect(calls.some(call=>call.path==="/api/events"&&call.status===200)).toBe(true);});

test("Access form rejects a bad token, unlocks the isolated app, and home links navigate",async()=>{
  render(<App/>);const input=await screen.findByLabelText("Workspace access token",{}, {timeout:15000});
  fireEvent.change(input,{target:{value:"incorrect-demo-token"}});fireEvent.click(screen.getByRole("button",{name:"Unlock workspace"}));
  await screen.findByRole("alert");fireEvent.change(input,{target:{value:token}});fireEvent.click(screen.getByRole("button",{name:"Unlock workspace"}));await loaded();
  expect((await screen.findAllByText(workspace)).length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button",{name:"Open incident workspace"}));expect(screen.getByRole("heading",{name:"How the demonstration works"})).toBeTruthy();
  nav("Start here");fireEvent.click(screen.getByRole("button",{name:"Start with a company question"}));expect((screen.getByLabelText("Company question") as HTMLInputElement).value).toContain("Who owns payments");
  nav("Start here");fireEvent.click(screen.getByRole("button",{name:"Inspect the graph in FalkorDB"}));expect(screen.getByRole("heading",{name:"Service dependencies"})).toBeTruthy();
  expect(screen.getByRole("link",{name:"GraphOps home"}).getAttribute("href")).toBe("/");
});

test("Company controls import, search, inspect and revise a real source, then update ownership",async()=>{
  render(<App/>);await loaded();nav("Company knowledge");
  fireEvent.click(screen.getByRole("button",{name:"Load synthetic sample"}));
  fireEvent.change(screen.getByLabelText("Source title"),{target:{value:"UI Review policy"}});
  fireEvent.change(screen.getByLabelText("Source filename"),{target:{value:"ui-review-policy.md"}});
  fireEvent.click(screen.getByRole("button",{name:"Import source"}));await screen.findByText(/Source saved/);
  const library=screen.getByRole("region",{name:"Company source library"});
  fireEvent.change(screen.getByLabelText("Search company sources"),{target:{value:"72 hours"}});
  fireEvent.click(within(library).getByRole("button",{name:"Search"}));
  const result=await screen.findByRole("button",{name:/UI Review policy # Synthetic support/});fireEvent.click(result);
  const inspected=await screen.findByRole("dialog");expect(inspected.textContent).toContain("72 hours");close();
  fireEvent.click(within(library).getByRole("button",{name:"Clear search"}));
  fireEvent.click(screen.getByRole("button",{name:"Edit source"}));await screen.findByRole("button",{name:"Save new revision"});
  fireEvent.change(screen.getByLabelText("Source content"),{target:{value:"The current refund review window is 96 hours. This is synthetic UI test data."}});
  fireEvent.click(screen.getByRole("button",{name:"Save new revision"}));await screen.findByText(/Source saved/);
  const previous=await screen.findByRole("heading",{name:"Previous source revisions"});
  fireEvent.click(within(previous.closest("section")!).getByRole("button",{name:/UI Review policy/}));
  expect((await screen.findByRole("dialog")).textContent).toContain("72 hours");close();
  fireEvent.change(screen.getByLabelText("New service owner"),{target:{value:"UI Response Team"}});
  fireEvent.click(screen.getByRole("button",{name:"Update owner"}));await screen.findByText(/Company change saved/);
  const state=await read("/api/workspace");expect(state.company.payments.owners[0].name).toBe("UI Response Team");
  expect(state.company.payments.documents.some((doc:any)=>doc.title==="UI Review policy"&&doc.text.includes("96 hours"))).toBe(true);
});

test("The rendered company question gets a real model answer and opens its cited evidence",async()=>{
  render(<App/>);await loaded();nav("Company knowledge");
  fireEvent.change(screen.getByLabelText("Company question"),{target:{value:"Who owns payments, and what is the refund review window in UI Review policy? Cite exact sources and revisions."}});
  const ask=screen.getByRole("button",{name:"Ask"});fireEvent.click(ask);await idle(ask);
  const answer=await screen.findByLabelText("Saved company answer");expect(answer.textContent).toContain("96");expect(answer.textContent).toContain("UI Response Team");
  questionId=tasks.filter(task=>task.path==="/api/questions").at(-1)!.id;expect(answer.textContent).toContain(questionId);
  const citation=within(answer).getAllByRole("button").find(button=>button.textContent?.startsWith("owned:document/"));expect(citation).toBeTruthy();
  fireEvent.click(citation!);expect((await screen.findByRole("dialog")).textContent).toContain("96 hours");close();
  fireEvent.click(within(answer).getByRole("button",{name:"Inspect answer and session evidence"}));expect((await screen.findByRole("dialog")).textContent).toContain("session_finished");close();
});

test("Graph service selectors, graph nodes and relationship controls inspect real graph records",async()=>{
  render(<App/>);await loaded();nav("Connected graph");
  fireEvent.click(screen.getByRole("button",{name:"Inspect orders"}));expect(screen.getByRole("heading",{name:"orders"})).toBeTruthy();
  fireEvent.keyDown(screen.getByRole("button",{name:"Inspect Service orders"}),{key:" "});expect((await screen.findByRole("dialog")).textContent).toContain('"kind": "Service"');close();
  const relationship=screen.getAllByRole("button",{name:/Inspect .* relationship/})[0];fireEvent.keyDown(relationship,{key:"Enter"});
  expect((await screen.findByRole("dialog")).textContent).toContain('"from"');close();
  fireEvent.click(screen.getByRole("button",{name:"payments"}));
  fireEvent.click(screen.getByRole("button",{name:"Open memory navigator"}));expect(screen.getByRole("heading",{name:"A new session starts with evidence."})).toBeTruthy();
});

test("The five-step guide runs an LLM question, handoff, fresh resolver, recovery and memory through UI controls",async()=>{
  render(<App/>);await loaded();const start=screen.getByRole("button",{name:"Start guided walkthrough"});await idle(start);fireEvent.click(start);
  const ask=screen.getByRole("button",{name:"Ask"});fireEvent.click(ask);await idle(ask);
  const graph=screen.getByRole("button",{name:"Continue: follow the graph"});await idle(graph);fireEvent.click(graph);
  fireEvent.click(screen.getByRole("button",{name:"Continue: find the cause"}));expect((screen.getByLabelText(/Pause at handoff/) as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole("button",{name:"Investigate only"}));
  const recover=screen.getByRole("button",{name:"Continue: resume and recover"});await idle(recover);
  let state=await read("/api/workspace?task="+tasks.filter(t=>t.path==="/api/incidents").at(-1)!.id);
  incidentId=state.selected.id;expect(state.selected.status).toBe("handoff");expect(state.events.filter((event:any)=>event.kind==="session_started"&&event.role==="resolver")).toHaveLength(0);
  fireEvent.click(recover);fireEvent.click(screen.getByRole("button",{name:"Resume in new session"}));
  const memory=screen.getByRole("button",{name:"Continue: inspect shared memory"});await idle(memory);fireEvent.click(memory);
  expect((screen.getByLabelText("Filter memory") as HTMLInputElement).value).toBe(incidentId);
  const records=screen.getByRole("group",{name:"Retrieved memory records"});expect(within(records).getByText("episodic")).toBeTruthy();expect(within(records).getByText("procedural")).toBeTruthy();expect(within(records).getByText("semantic")).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"Inspect navigator packet"}));expect((await screen.findByRole("dialog")).textContent).toContain('"authorizes_execution": false');close();
  fireEvent.click(within(records).getAllByRole("button")[0]);expect((await screen.findByRole("dialog")).textContent).toContain(incidentId);close();
  fireEvent.change(screen.getByLabelText("Memory type"),{target:{value:"procedural"}});expect(within(records).queryByText("episodic")).toBeNull();fireEvent.click(screen.getByRole("button",{name:"Clear filters"}));
  fireEvent.click(screen.getByRole("button",{name:"Download this incident"}));await waitFor(()=>expect(downloads.some(d=>d.value.incident?.id===incidentId)).toBe(true));
  fireEvent.click(screen.getByRole("button",{name:"Finish walkthrough"}));expect(screen.queryByRole("navigation",{name:"Workflow steps"})).toBeNull();
  state=await read("/api/workspace?task="+incidentId);expect(state.selected.ticket_closed).toBe(true);expect(new Set(state.events.filter((e:any)=>e.kind==="session_started").map((e:any)=>e.session)).size).toBe(2);
  expect(state.health.find((h:any)=>h.service==="analytics").http_status).toBe(503);
});

test("The orders scenario completes automatically and its activity and operation inspectors work",async()=>{
  render(<App/>);await loaded();nav("Agent tasks");fireEvent.change(screen.getByLabelText("Scenario"),{target:{value:"worker"}});
  fireEvent.click(screen.getByRole("button",{name:"Run agent"}));await recovered();
  const state=await read("/api/workspace?task="+tasks.filter(t=>t.path==="/api/incidents").at(-1)!.id);expect(state.selected.target).toBe("orders");expect(state.selected.outcome.action).toBe("restart_worker");
  fireEvent.click(screen.getByRole("button",{name:"Inspect recovery"}));expect((await screen.findByRole("dialog")).textContent).toContain("restart_worker");close();
  fireEvent.click(screen.getByRole("button",{name:"Inspect records"}));expect((await screen.findByRole("dialog")).textContent).toContain("DEPENDS_ON");close();
  const timeline=screen.getByRole("heading",{name:"Agent activity"}).closest("section")!;fireEvent.click(within(timeline).getAllByRole("button")[0]);expect((await screen.findByRole("dialog")).textContent).toContain("session_started");close();
  fireEvent.click(screen.getByRole("button",{name:"Inspect operation result"}));await screen.findByRole("dialog");close();
  fireEvent.click(screen.getByRole("button",{name:"Download incident report"}));await waitFor(()=>expect(downloads.some(d=>d.value.incident?.id===state.selected.id)).toBe(true));
});

test("Retiring a company procedure blocks the real agent; publishing and resuming completes recovery",async()=>{
  render(<App/>);await loaded();nav("Company knowledge");fireEvent.click(screen.getByRole("button",{name:"Retire current procedure"}));await screen.findByText(/Company change saved/);
  nav("Agent tasks");const run=screen.getByRole("button",{name:"Run agent"});await idle(run);fireEvent.click(run);await idle(run);
  await screen.findByText("Needs attention");const id=tasks.filter(t=>t.path==="/api/incidents").at(-1)!.id;
  let state=await read("/api/workspace?task="+id);expect(state.selected.status).toBe("blocked");expect(state.events.some((e:any)=>e.kind==="tool"&&e.data.tool==="execute_recovery")).toBe(false);
  nav("Company knowledge");fireEvent.click(screen.getByRole("button",{name:"Publish supported procedure"}));await screen.findByText(/Company change saved/);
  nav("Agent tasks");const resume=screen.getByRole("button",{name:"Resume in new session"});await idle(resume);fireEvent.click(resume);await recovered();
  state=await read("/api/workspace?task="+id);expect(state.selected.ticket_closed).toBe(true);
});

test("Stop at checkpoint and resume controls continue the same incident",async()=>{
  render(<App/>);await loaded();nav("Agent tasks");fireEvent.click(screen.getByRole("button",{name:"Run agent"}));
  const stop=await screen.findByRole("button",{name:"Stop at checkpoint"});await idle(stop);fireEvent.click(stop);
  await screen.findByText("Paused at a checkpoint",{}, {timeout:120000});const id=tasks.filter(t=>t.path==="/api/incidents").at(-1)!.id;
  expect((await read("/api/workspace?task="+id)).selected.job).toBe("interrupted");fireEvent.click(screen.getByRole("button",{name:"Resume in new session"}));await recovered();
  expect((await read("/api/workspace?task="+id)).selected.ticket_closed).toBe(true);
});

test("System refresh, live diagnostics and backup controls return verified data",async()=>{
  render(<App/>);await loaded();nav("System & backups");const refresh=await screen.findByRole("button",{name:"Refresh status"});fireEvent.click(refresh);await screen.findByRole("button",{name:"Refresh status"});
  const diagnose=screen.getByRole("button",{name:"Run system checks"});fireEvent.click(diagnose);await idle(diagnose);
  fireEvent.click(await screen.findByRole("button",{name:"Inspect latest verification"}));expect((await screen.findByRole("dialog")).textContent).toContain('"success": true');close();
  fireEvent.click(screen.getByRole("button",{name:"Download workspace backup"}));await screen.findByText("Download prepared: graphops-workspace-backup.json");
  await waitFor(()=>expect(downloads.some(d=>d.name==="graphops-workspace-backup.json")).toBe(true));const backup=downloads.find(d=>d.name==="graphops-workspace-backup.json")!.value;
  expect(backup.schema).toBe("graphops.workspace.v1");expect(backup.includes_provider_keys).toBe(false);expect(backup.nodes.length).toBeGreaterThan(30);
});

test("History searches, source-change audit inspection, run routing and workspace locking work",async()=>{
  render(<App/>);await loaded();nav("Run history");const query=screen.getByLabelText("Search run history");await screen.findAllByRole("button",{name:/company updated/});
  fireEvent.change(query,{target:{value:questionId}});const search=screen.getByRole("button",{name:"Search"});await idle(search);fireEvent.click(search);await idle(search);
  fireEvent.click(await screen.findByRole("button",{name:new RegExp(questionId)}));expect(await screen.findByLabelText("Saved company answer")).toBeTruthy();
  nav("Run history");await screen.findAllByRole("button",{name:/company updated/});fireEvent.click(screen.getAllByRole("button",{name:/company updated/})[0]);expect((await screen.findByRole("dialog")).textContent).toContain("company_updated");close();
  fireEvent.change(screen.getByLabelText("Search run history"),{target:{value:"no-such-run-frontend"}});fireEvent.click(screen.getByRole("button",{name:"Search"}));await screen.findByText("No matching runs.");
  fireEvent.click(screen.getByRole("button",{name:"Clear search"}));await screen.findByRole("button",{name:new RegExp(incidentId)});
  fireEvent.click(screen.getByRole("button",{name:"Lock workspace"}));await screen.findByRole("heading",{name:"Demo access"});
  expect(screen.queryByRole("button",{name:"Download workspace backup"})).toBeNull();expect((await transport("/api/workspace")).status).toBe(401);
});
