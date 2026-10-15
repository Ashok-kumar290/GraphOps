import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Workspace, Doc, Incident, View } from "../shared/contracts";
import { api } from "../shared/api";
import { nice } from "../shared/format";
type Evidence = { title: string; value: unknown };

function useWorkspaceController() {
const [data, setData] = useState<Workspace | null>(null),
    [view, setView] = useState<View>("home");

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
    refreshing = useRef(false),
    debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const next = await api(
        "/api/workspace" +
          (ref.current ? "?task=" + encodeURIComponent(ref.current) : ""),
      );
      if (mounted.current) {
        setData(next);
        setLocked(false);
        setConnectionError("");
      }
    } catch (e: any) {
      if (mounted.current) {
        if (e.status === 401) {
          setLocked(true);
          setData(null);
          setInspector(null);
        } else setConnectionError(e.message);
      }
    } finally {
      refreshing.current = false;
    }
  }, []);

useEffect(() => {
    ref.current = taskId;
    if (taskId) localStorage.setItem("graphops-task", taskId);
    void refresh();
  }, [taskId, refresh]);

useEffect(() => {
    mounted.current = true;
    void refresh();
    const interval = setInterval(() => void refresh(), 3000);
    const events = new EventSource("/api/events");
    events.onmessage = (message) => {
      const item = JSON.parse(message.data);
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
    setPending(true);
    setError("");
    try {
      const result = await api(path, body);
      if (result.task) setTaskId(result.task);
      if (path === "/api/access") setToken("");
      if (path === "/api/logout") {
        setData(null);
        setInspector(null);
        setLocked(true);
        return;
      }
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPending(false);
    }
  };

const busy = pending || !!data?.busy,
    selected = data?.selected;

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
        .then((full) => setInspector({ title, value: full }))
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
    setTaskId(id);
    const task = historyTask || data?.tasks.find((t) => t.id === id);
    if (task?.target) setService(task.target);
    setView(
      task?.diagnostic ? "system" : task?.question ? "company" : "workspace",
    );
  };

async function download(path: string, name: string) {
    setError("");
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
      link.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message);
    }
  }
return { data, view, setView, taskId, setTaskId, service, setService, scenario, setScenario, mode, setMode, pauseAfterHandoff, setPauseAfterHandoff, error, setError, connectionError, setConnectionError, pending, memoryQuery, setMemoryQuery, memoryKind, setMemoryKind, inspector, setInspector, question, setQuestion, owner, setOwner, locked, token, setToken, stage, refresh, command, busy, selected, selectedHealth, company, packet, allMemory, inspect, choose, download };
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
