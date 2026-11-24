import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import type { BreakdownResponse, Item, SyncRequest, SyncResponse } from "../shared/types.ts";
import { newId } from "../shared/types.ts";
import * as store from "./store.ts";
import { applySort, createAi, describeAiError } from "../shared/ai.ts";
import { breakdownByRules, sortByRules, type SortedFields } from "../shared/rules.ts";

const PORT = Number(process.env.PORT ?? 8787);
const APP_TOKEN = process.env.APP_TOKEN ?? "";
const ai = createAi({ apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.CLAUDE_MODEL });
const aiEnabled = ai.enabled;

store.load();

// ---- Sorting raw dumps -------------------------------------------------

const sorting = new Set<string>();

async function sortItem(raw: Item): Promise<void> {
  if (sorting.has(raw.id)) return;
  sorting.add(raw.id);
  let fields: SortedFields[];
  let by: "ai" | "rules" = "rules";
  try {
    if (aiEnabled) {
      fields = await ai.sort(raw);
      by = "ai";
    } else {
      fields = sortByRules(raw.title);
    }
  } catch (error) {
    console.warn(`AI sort failed (${describeAiError(error)}), using rules for: ${raw.title}`);
    fields = sortByRules(raw.title);
  } finally {
    sorting.delete(raw.id);
  }

  // The user may have edited or sorted it themselves meanwhile; theirs wins.
  const current = store.get(raw.id);
  if (!current || current.kind !== null || current.deleted) return;

  for (const it of applySort(current, fields, by, newId)) store.put(it);
}

function sortPending(): void {
  for (const it of store.unsorted()) void sortItem(it);
}

// ---- HTTP ---------------------------------------------------------------

const app = express();
app.use(express.json({ limit: "2mb" }));

app.use("/api", (req, res, next) => {
  if (!APP_TOKEN || req.get("x-app-token") === APP_TOKEN) return next();
  res.status(401).json({ error: "token required" });
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, aiEnabled });
});

app.post("/api/sync", (req, res) => {
  const body = req.body as SyncRequest;
  for (const change of body.changes ?? []) store.merge(change);
  sortPending();
  const response: SyncResponse = {
    rev: store.currentRev(),
    items: store.changedSince(Number(body.since) || 0),
    aiEnabled,
  };
  res.json(response);
});

app.post("/api/breakdown", async (req, res) => {
  const item = store.get(String(req.body?.id));
  if (!item) {
    res.status(404).json({ error: "not found" });
    return;
  }
  let steps: { title: string; minutes: number }[];
  try {
    steps = aiEnabled ? await ai.breakdown(item) : breakdownByRules();
  } catch (error) {
    console.warn(`AI breakdown failed (${describeAiError(error)})`);
    steps = breakdownByRules();
  }
  const updated = store.put({
    ...item,
    steps: steps.map((s) => ({ id: newId(), title: s.title, minutes: s.minutes, done: false })),
    updatedAt: new Date().toISOString(),
  });
  const response: BreakdownResponse = { steps: updated.steps };
  res.json(response);
});

// In production, serve the built app from the same port.
const dist = path.resolve("dist");
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.listen(PORT, () => {
  console.log(`Life Manager API on http://localhost:${PORT}  (AI ${aiEnabled ? "on" : "off: using rules"})`);
  sortPending();
});

process.on("SIGINT", () => {
  store.saveNow();
  process.exit();
});
process.on("SIGTERM", () => {
  store.saveNow();
  process.exit();
});
