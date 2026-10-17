import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Workspace, Doc, Incident, View } from "../shared/contracts";
import { api } from "../shared/api";
import { nice } from "../shared/format";
import { WALKTHROUGH_STEPS, type Walkthrough, type WalkthroughStep } from "../features/walkthrough/model";
type Evidence = { title: string; value: unknown };

// Each page has a URL fragment so refresh, Back and shared links keep the page.
const VIEW_HASH: Record<View, string> = {home: "", workspace: "agent", graph: "graph", memory: "memory", company: "company", history: "history", system: "system", results: "results", verify: "verify"};
const viewFromHash = (): View =>
  (Object.keys(VIEW_HASH) as View[]).find(v => VIEW_HASH[v] && VIEW_HASH[v] === location.hash.slice(1)) || "home";

function useWorkspaceController() {
const [data, setData] = useState<Workspace | null>(null),
    [view, setView] = useState<View>(viewFromHash);
useEffect(() => {
  const onHash = () => setView(viewFromHash());
  addEventListener("hashchange", onHash);
  return () => removeEventListener("hashchange", onHash);
}, []);
useEffect(() => {
  const hash = VIEW_HASH[view];
  if (location.hash.slice(1) !== hash) history.pushState(null, "", hash ? "#" + hash : location.pathname + location.search);
}, [view]);
const [walkthrough, setWalkthrough] = useState<Walkthrough | null>(null);

const [taskId, setTaskId] = useState(
      localStorage.getItem("graphops-task") || "",
    ),
    [service, setService] = useState("payments");

const [scenario, setScenario] = useState("config"),
    [mode, setMode] = useState("llm"),
    [pauseAfterHandoff, setPauseAfterHandoff] = useState(false),
    [error, setError] = useState(""),
    [connectionError, setConnectionError] = useState(""),
    [pending, setPending] = useState(false);
const [notice, setNotice] = useState(""), [downloading, setDownloading] = useState("");

const [memoryQuery, setMemoryQuery] = useState(""),
    [memoryKind, setMemoryKind] = useState("all");

const [inspector, setInspector] = useState<Evidence | null>(null),
    [question, setQuestion] = useState(""),
    [owner, setOwner] = useState("");

const [locked, setLocked] = useState(false),
    [token, setToken] = useState(""),
    [stage, setStage] = useState("Connecting to workspace");

const ref = useRef(taskId),
    mounted = useRef(true),
    refreshing = useRef<Promise<void> | null>(null),
    refreshAgain = useRef(false),
    accessEpoch = useRef(0),
    authenticating = useRef(false),
    commandInFlight = useRef(false),
    downloadInFlight = useRef(false),
    debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

const refresh = useCallback((): Promise<void> => {
    // Serialize reads, but remember a newer selection/refresh instead of dropping it.
    // An access transition also invalidates responses authorized before that change.
    if (authenticating.current) return Promise.resolve();
    if (refreshing.current) { refreshAgain.current = true; return refreshing.current; }
    const load = async () => {
      do {
        refreshAgain.current = false;
        const requestedTask = ref.current, epoch = accessEpoch.current;
        try {
          const next = await api("/api/workspace" +
            (requestedTask ? "?task=" + encodeURIComponent(requestedTask) : ""));
          if (mounted.current && epoch === accessEpoch.current && !authenticating.current) {
            if (requestedTask !== ref.current) { refreshAgain.current = true; continue; }
            setData(next);
            setLocked(false);
            setConnectionError("");
          }
        } catch (e: any) {
          if (mounted.current && epoch === accessEpoch.current && requestedTask === ref.current && !authenticating.current) {
            if (e.status === 401) {
              setLocked(true);
              setData(null);
              setInspector(null);
            } else setConnectionError(e.message);
          }
        }
      } while (refreshAgain.current && mounted.current && !authenticating.current);
    };
    refreshing.current = load().finally(() => {refreshing.current = null;});
    return refreshing.current;
  }, []);

useEffect(() => {
    ref.current = taskId;
    if (taskId) localStorage.setItem("graphops-task", taskId);
    else localStorage.removeItem("graphops-task");
    void refresh();
  }, [taskId, refresh]);

useEffect(() => {
    mounted.current = true;
    const interval = setInterval(() => void refresh(), 3000);
    const events = new EventSource("/api/events");
    events.onmessage = (message) => {
      let item;
      try { item = JSON.parse(message.data); } catch { return; }
      if (item.stage === "model")
        setStage(`${item.role} is selecting its next step`);
      else if (item.stage === "handoff_saved")
        setStage("Resolver is loading the saved handoff");
      else if (item.stage === "stopping")
        setStage("Stopping after the current request or operation");
      else if (item.tool) setStage(nice(item.tool));
      else if (item.stage === "finished") setStage("Checkpoint saved");
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => void refresh(), 180);
    };
    return () => {
      mounted.current = false;
      clearInterval(interval);
      if (debounce.current) clearTimeout(debounce.current);
      events.close();
    };
  }, [refresh, locked]);

const command = async (path: string, body: unknown) => {
    // The ref closes the interval before React renders the disabled button.
    if (commandInFlight.current) return null;
    const access = path === "/api/access" || path === "/api/logout";
    if (!access && viewOnly) {
      setError("This is the public view. Enter the access token above to run agents or change the workspace."); return null;
    }
    if (!access && (!data || locked || connectionError)) {
      setError("Reconnect to the workspace before submitting a command."); return null;
    }
    if (!access && data?.busy && path !== "/api/cancel") {
      setError("Finish or stop the active job before starting another change."); return null;
    }
    commandInFlight.current = true;
    if (access) {accessEpoch.current++; authenticating.current = true;}
    setPending(true);
    setError("");
    setNotice("");
    try {
      const result = await api(path, body);
      if (result.task) {
        ref.current = result.task;
        setTaskId(result.task);
        setWalkthrough(guide => !guide ? null : path === "/api/questions"
          ? {...guide, questionId: result.task, questionEvents: [], step: "company"}
          : path === "/api/incidents"
            ? {...guide, incidentId: result.task, incidentEvents: [], step: "investigate"}
            : guide);
      }
      if (path === "/api/access") setToken("");
      if (path === "/api/logout") {
        ref.current = "";
        setTaskId("");
        setWalkthrough(null);
        setData(null);
        setInspector(null);
        // A public deployment stays readable after signing out.
        if (data?.public_view) {accessEpoch.current++; authenticating.current = false; await refresh();}
        else setLocked(true);
        return result;
      }
      if (path === "/api/company") setNotice("Company change saved.");
      if (access) authenticating.current = false;
      await refresh();
      return result;
    } catch (e: any) {
      setError(e.message);
      return null;
    } finally {
      authenticating.current = false;
      commandInFlight.current = false;
      setPending(false);
    }
  };

const busy = pending || !!data?.busy,
    unavailable = !data || locked || !!connectionError,
    // Public visitors can browse everything but change nothing.
    viewOnly = !!data?.public_view && !data.authenticated,
    controlsDisabled = busy || unavailable || viewOnly,
    // Hide an old run's controls while the requested run is still loading.
    selected = taskId && data?.selected?.id !== taskId ? undefined : data?.selected;

useEffect(() => {
  if (!data) return;
  setWalkthrough(guide => {
    if (!guide) return guide;
    if (guide.workspace !== data.workspace) return null;
    const field = data.selected?.id === guide.questionId ? "questionEvents"
      : data.selected?.id === guide.incidentId ? "incidentEvents" : null;
    if (!field || guide[field].at(-1)?.id === data.events.at(-1)?.id) return guide;
    return {...guide, [field]: data.events};
  });
}, [data]);

const startWalkthrough = () => {
  if (!data || busy || locked || viewOnly || connectionError || data.health.find(h => h.service === "gateway")?.http_status !== 200) return;
  setWalkthrough({workspace: data.workspace, step: "company", questionId: null, incidentId: null, questionEvents: [], incidentEvents: []});
  setService("payments");
  setQuestion("Who owns payments, and which current procedure supports recovery? Cite the exact sources and revisions.");
  setMode("llm");
  setScenario("config");
  setPauseAfterHandoff(true);
  setView("company");
};

const openWalkthroughStep = (step: WalkthroughStep) => {
  if (!walkthrough) return;
  setWalkthrough(guide => guide && {...guide, step});
  const id = step === "company" ? walkthrough.questionId : walkthrough.incidentId;
  if (id) { ref.current = id; setTaskId(id); }
  const incident = data?.tasks.find(t => t.id === walkthrough.incidentId);
  if (step === "memory") { setMemoryQuery(walkthrough.incidentId || ""); setMemoryKind("all"); }
  setService(step === "company" || step === "graph" ? "payments" : incident?.target || (scenario === "worker" ? "orders" : "payments"));
  setView(WALKTHROUGH_STEPS.find(s => s.id === step)!.view);
};

const selectedHealth = data?.health.find((h) => h.service === service),
    company = data?.company[service],
    packet = data?.memory[service];

const allMemory = data
    ? Object.values(data.memory).flatMap((p) => [
        ...p.active,
        ...p.historical,
        ...p.unverified,
      ])
    : [];

const inspect = (title: string, value: unknown) => {
    setInspector({ title, value });
    const doc = value as Doc;
    if (doc?.text_truncated && doc.id && doc.revision)
      void api(
        "/api/sources?id=" +
          encodeURIComponent(doc.id) +
          "&revision=" +
          encodeURIComponent(doc.revision),
      )
        .then((full) => setInspector(current => current?.value === value ? { title, value: full } : current))
        .catch((e) => setError(e.message));
  };

useEffect(() => {
    if (!inspector) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>(".inspector");
    dialog?.querySelector<HTMLElement>("button")?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") setInspector(null);
      if (event.key === "Tab" && dialog) {
        const elements = Array.from(
          dialog.querySelectorAll<HTMLElement>('button,[tabindex="0"]'),
        );
        const first = elements[0],
          last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("keydown", keyboard);
      previous?.focus();
    };
  }, [inspector]);

const choose = (id: string, historyTask?: Incident) => {
    ref.current = id;
    setTaskId(id);
    const task = historyTask || data?.tasks.find((t) => t.id === id);
    if (task?.target) setService(task.target);
    setView(
      task?.verification ? "verify" : task?.diagnostic ? "system" : task?.question ? "company" : "workspace",
    );
  };

async function download(path: string, name: string) {
    if (downloadInFlight.current || unavailable) return;
    downloadInFlight.current = true;
    setDownloading(name);
    setError("");
    setNotice("");
    try {
      const value = await api(path);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(value, null, 2)], {
          type: "application/json",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      try {link.click();} finally {link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);}
      setNotice("Download prepared: " + name);
    } catch (e: any) {
      setError(e.message);
    } finally {
      downloadInFlight.current = false;
      setDownloading("");
    }
  }
return { data, view, setView, taskId, setTaskId, service, setService, scenario, setScenario, mode, setMode, pauseAfterHandoff, setPauseAfterHandoff, error, setError, connectionError, pending, notice, setNotice, downloading, unavailable, controlsDisabled, viewOnly, memoryQuery, setMemoryQuery, memoryKind, setMemoryKind, inspector, setInspector, question, setQuestion, owner, setOwner, locked, token, setToken, stage, refresh, command, busy, selected, selectedHealth, company, packet, allMemory, inspect, choose, download, walkthrough, startWalkthrough, openWalkthroughStep, leaveWalkthrough: () => {setWalkthrough(null); if (memoryQuery === walkthrough?.incidentId) setMemoryQuery("");} };
}
type Controller = ReturnType<typeof useWorkspaceController>;
const Context = createContext<Controller | null>(null);
export function WorkspaceProvider({ children }: {children: React.ReactNode}) {
 const value = useWorkspaceController();
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useWorkspace() {
 const value=useContext(Context);
 if (!value) throw new Error("WorkspaceProvider is required");
 return value;
}
