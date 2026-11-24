// One-user storage: everything in memory, saved to data/store.json.
// "Latest change wins" per item, using updatedAt.
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { Item } from "../shared/types.ts";

const DATA_DIR = process.env.DATA_DIR ?? path.resolve("data");
const FILE = path.join(DATA_DIR, "store.json");

interface Saved {
  rev: number;
  items: Item[];
}

const items = new Map<string, Item>();
let rev = 0;
let saveTimer: NodeJS.Timeout | null = null;

export function load(): void {
  mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(FILE)) return;
  const saved = JSON.parse(readFileSync(FILE, "utf8")) as Saved;
  rev = saved.rev;
  for (const it of saved.items) items.set(it.id, it);
}

function scheduleSave(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveNow();
  }, 300);
}

export function saveNow(): void {
  const tmp = FILE + ".tmp";
  const data: Saved = { rev, items: [...items.values()] };
  writeFileSync(tmp, JSON.stringify(data));
  renameSync(tmp, FILE); // atomic: never leaves a half-written file
}

export function currentRev(): number {
  return rev;
}

export function get(id: string): Item | undefined {
  return items.get(id);
}

/** Store an item and give it a new rev, so other devices pull it. */
export function put(item: Item): Item {
  const stored = { ...item, rev: ++rev };
  items.set(stored.id, stored);
  scheduleSave();
  return stored;
}

/** Apply a change from a device. Returns false if the stored copy is newer. */
export function merge(incoming: Item): boolean {
  const existing = items.get(incoming.id);
  if (existing && existing.updatedAt > incoming.updatedAt) return false;
  put(incoming);
  return true;
}

export function changedSince(since: number): Item[] {
  return [...items.values()].filter((it) => it.rev > since);
}

export function unsorted(): Item[] {
  return [...items.values()].filter((it) => it.kind === null && !it.deleted);
}
