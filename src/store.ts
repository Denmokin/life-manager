// Client state: everything lives on this device first (localStorage),
// and syncs with the server whenever it can be reached.
import { useSyncExternalStore } from "react";
import type { Energy, Item, SyncResponse } from "../shared/types.ts";
import { rawItem } from "../shared/types.ts";

export type SyncState = "ok" | "syncing" | "offline" | "needs-token";

interface State {
  items: Record<string, Item>;
  rev: number;
  dirty: Record<string, string>; // id -> updatedAt that still needs pushing
  sync: SyncState;
  aiEnabled: boolean;
  energy: { level: Energy; at: number } | null;
}

const KEY = "lm.state.v1";
const TOKEN_KEY = "lm.token";

/** The cloud API in the published app; the local server's /api during development. */
export const API: string = import.meta.env.VITE_API_URL || "/api";

function loadState(): State {
  const base: State = { items: {}, rev: 0, dirty: {}, sync: "syncing", aiEnabled: false, energy: null };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (saved) return { ...base, ...saved, sync: "syncing" };
  } catch {
    /* corrupted storage: start fresh rather than crash */
  }
  return base;
}

let state = loadState();
const listeners = new Set<() => void>();

function set(patch: Partial<State>): void {
  state = { ...state, ...patch };
  const { items, rev, dirty, aiEnabled, energy } = state;
  localStorage.setItem(KEY, JSON.stringify({ items, rev, dirty, aiEnabled, energy }));
  for (const l of listeners) l();
}

export function useStore(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

// ---- Actions ------------------------------------------------------------

function save(item: Item): void {
  set({
    items: { ...state.items, [item.id]: item },
    dirty: { ...state.dirty, [item.id]: item.updatedAt },
  });
  scheduleSync(150);
}

/** Capture a dump. Each non-empty line becomes its own raw item. */
export function capture(text: string): Item[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const created = lines.map((l) => rawItem(l));
  for (const it of created) save(it);
  return created;
}

export function update(id: string, patch: Partial<Item>): void {
  const current = state.items[id];
  if (!current) return;
  save({ ...current, ...patch, updatedAt: new Date().toISOString() });
}

export function complete(id: string): void {
  update(id, { status: "done", doneAt: new Date().toISOString() });
}

export function reopen(id: string): void {
  update(id, { status: "open", doneAt: null, snoozedUntil: null });
}

export function setEnergy(level: Energy): void {
  set({ energy: { level, at: Date.now() } });
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  scheduleSync(0);
}

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

/** Merge steps from the server's breakdown answer into local state. */
export function applyServerItem(item: Item): void {
  if (state.dirty[item.id]) return;
  set({ items: { ...state.items, [item.id]: item } });
}

// ---- Sync ---------------------------------------------------------------

let timer: ReturnType<typeof setTimeout> | null = null;
let inFlight = false;

function scheduleSync(ms: number): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(runSync, ms);
}

export function apiHeaders(): HeadersInit {
  return { "content-type": "application/json", "x-app-token": getToken() };
}

async function runSync(): Promise<void> {
  if (inFlight) return scheduleSync(500);
  inFlight = true;
  const sent = { ...state.dirty };
  const changes = Object.keys(sent).map((id) => state.items[id]).filter(Boolean);
  try {
    const res = await fetch(`${API}/sync`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ since: state.rev, changes }),
    });
    if (res.status === 401) {
      set({ sync: "needs-token" });
      return;
    }
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as SyncResponse;

    // Pushed items are clean unless they were edited again while in flight.
    const dirty = { ...state.dirty };
    for (const [id, at] of Object.entries(sent)) if (dirty[id] === at) delete dirty[id];

    const items = { ...state.items };
    for (const incoming of data.items) {
      const local = items[incoming.id];
      if (dirty[incoming.id] && local && local.updatedAt > incoming.updatedAt) continue;
      items[incoming.id] = incoming;
    }
    set({ items, dirty, rev: data.rev, sync: "ok", aiEnabled: data.aiEnabled });
  } catch {
    set({ sync: "offline" });
  } finally {
    inFlight = false;
    const waitingOnSort = Object.values(state.items).some((it) => it.kind === null && !it.deleted);
    const pending = Object.keys(state.dirty).length > 0;
    if (state.sync === "offline") scheduleSync(15000);
    else if (state.sync !== "needs-token") scheduleSync(pending ? 300 : waitingOnSort ? 2500 : 30000);
  }
}

export function startSync(): void {
  scheduleSync(0);
  window.addEventListener("online", () => scheduleSync(0));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") scheduleSync(0);
  });
}
