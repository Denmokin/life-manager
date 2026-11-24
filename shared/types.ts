// Shared between the browser app and the server.

export type Kind = "task" | "someday" | "hobby" | "rest" | "people";
export type Energy = "low" | "medium" | "high";
export type Importance = "low" | "normal" | "high";
export type Status = "open" | "done" | "dropped";

export interface Step {
  id: string;
  title: string;
  minutes: number;
  done: boolean;
}

export interface Item {
  id: string;
  title: string;
  /** null until the item has been sorted (by AI or rules). */
  kind: Kind | null;
  minutes: number;
  energy: Energy;
  importance: Importance;
  /** YYYY-MM-DD */
  due: string | null;
  person: string | null;
  steps: Step[];
  status: Status;
  /** ISO time; hidden from Right Now until then. */
  snoozedUntil: string | null;
  skips: number;
  /** How it was sorted, null while still raw. */
  sortedBy: "ai" | "rules" | "me" | null;
  /** For items split out of a dump: the raw item they came from. */
  fromId: string | null;
  createdAt: string;
  updatedAt: string;
  doneAt: string | null;
  deleted: boolean;
  /** Server-assigned change counter, used as the sync cursor. */
  rev: number;
}

export interface SyncRequest {
  since: number;
  changes: Item[];
}

export interface SyncResponse {
  rev: number;
  items: Item[];
  aiEnabled: boolean;
}

export interface BreakdownResponse {
  steps: Step[];
}

export function newId(): string {
  // crypto.randomUUID only exists in secure contexts (HTTPS / localhost);
  // the phone may open the app over plain http on the home network.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    try {
      return crypto.randomUUID();
    } catch {
      /* fall through */
    }
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function rawItem(title: string, now = new Date()): Item {
  const ts = now.toISOString();
  return {
    id: newId(),
    title: title.trim(),
    kind: null,
    minutes: 25,
    energy: "medium",
    importance: "normal",
    due: null,
    person: null,
    steps: [],
    status: "open",
    snoozedUntil: null,
    skips: 0,
    sortedBy: null,
    fromId: null,
    createdAt: ts,
    updatedAt: ts,
    doneAt: null,
    deleted: false,
    rev: 0,
  };
}

/** Local calendar date as YYYY-MM-DD. */
export function localDate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
