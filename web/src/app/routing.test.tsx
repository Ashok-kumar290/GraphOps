import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { App } from "./App";
import { workspaceFixture } from "../features/walkthrough/fixtures";

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("EventSource", class {onmessage: unknown; close() {}});
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(workspaceFixture()), {status: 200, headers: {"Content-Type": "application/json"}})));
});
afterEach(() => {cleanup(); vi.unstubAllGlobals();});

test("Navigating records the page in the URL", async () => {
  render(<App/>);
  await screen.findByText("FalkorDB connected");
  fireEvent.click(screen.getByRole("button", {name: "Memory navigator"}));
  expect(location.hash).toBe("#memory");
  fireEvent.click(screen.getByRole("button", {name: "Start here"}));
  expect(location.hash).toBe("");
});

test("Opening a page URL directly shows that page", async () => {
  history.replaceState(null, "", "/#company");
  render(<App/>);
  await screen.findByText("FalkorDB connected");
  expect(screen.getByRole("heading", {name: "Company knowledge", level: 1})).toBeTruthy();
});

test("Browser Back returns to the previous page", async () => {
  render(<App/>);
  await screen.findByText("FalkorDB connected");
  fireEvent.click(screen.getByRole("button", {name: "Run history"}));
  history.replaceState(null, "", "/#graph");
  dispatchEvent(new HashChangeEvent("hashchange"));
  expect(await screen.findByRole("heading", {name: "Connected graph", level: 1})).toBeTruthy();
});
