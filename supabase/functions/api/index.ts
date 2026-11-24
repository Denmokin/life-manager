// Life Manager cloud API (Supabase Edge Function, Deno).
// Same routes as the local server: POST /sync, POST /breakdown, GET /health.
// The shared code is copied into ./_shared at deploy time (see scripts/deploy-function.mjs).
import { createClient } from "@supabase/supabase-js";
import type { Item, SyncRequest } from "./_shared/types.ts";
import { newId } from "./_shared/types.ts";
import { applySort, createAi, describeAiError } from "./_shared/ai.ts";
import { breakdownByRules, sortByRules } from "./_shared/rules.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const APP_TOKEN = Deno.env.get("APP_TOKEN") ?? "";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const ai = createAi({ apiKey: Deno.env.get("ANTHROPIC_API_KEY"), model: Deno.env.get("CLAUDE_MODEL") });

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, x-app-token",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });

async function merge(items: Item[]): Promise<void> {
  if (!items.length) return;
  const { error } = await db.rpc("merge_items", { changes: items });
  if (error) throw new Error(`merge failed: ${error.message}`);
}

async function getItem(id: string): Promise<Item | null> {
  const { data } = await db.from("items").select("doc, rev").eq("id", id).maybeSingle();
  return data ? ({ ...data.doc, rev: data.rev } as Item) : null;
}

/** Sort whatever is waiting. Claimed in the database, so parallel syncs never double-sort. */
async function sortPending(): Promise<void> {
  const { data, error } = await db.rpc("claim_unsorted", { max_items: 10 });
  if (error || !data?.length) return;
  await Promise.all(
    (data as Item[]).map(async (raw) => {
      let by: "ai" | "rules" = "rules";
      let fields;
      try {
        if (ai.enabled) {
          fields = await ai.sort(raw);
          by = "ai";
        } else fields = sortByRules(raw.title);
      } catch (e) {
        console.warn(`AI sort failed (${describeAiError(e)}), using rules`);
        fields = sortByRules(raw.title);
      }
      // The user may have sorted or edited it meanwhile; theirs wins.
      const current = await getItem(raw.id);
      if (!current || current.kind !== null || current.deleted) return;
      await merge(applySort(current, fields, by, newId));
    }),
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  // Fail closed: without a configured token, nothing is served.
  if (!APP_TOKEN || req.headers.get("x-app-token") !== APP_TOKEN) {
    return json({ error: APP_TOKEN ? "token required" : "APP_TOKEN secret is not set" }, 401);
  }

  const route = new URL(req.url).pathname.split("/").pop();
  try {
    if (route === "health") return json({ ok: true, aiEnabled: ai.enabled });

    if (route === "sync" && req.method === "POST") {
      const body = (await req.json()) as SyncRequest;
      await merge(body.changes ?? []);
      EdgeRuntime.waitUntil(sortPending()); // answer now, sort in the background
      const { data, error } = await db.rpc("changed_since", { since: Number(body.since) || 0 });
      if (error) throw new Error(error.message);
      return json({ ...data, aiEnabled: ai.enabled });
    }

    if (route === "breakdown" && req.method === "POST") {
      const { id } = await req.json();
      const item = await getItem(String(id));
      if (!item) return json({ error: "not found" }, 404);
      let steps;
      try {
        steps = ai.enabled ? await ai.breakdown(item) : breakdownByRules();
      } catch (e) {
        console.warn(`AI breakdown failed (${describeAiError(e)})`);
        steps = breakdownByRules();
      }
      const updated: Item = {
        ...item,
        steps: steps.map((s) => ({ id: newId(), title: s.title, minutes: s.minutes, done: false })),
        updatedAt: new Date().toISOString(),
      };
      await merge([updated]);
      return json({ steps: updated.steps });
    }

    return json({ error: "not found" }, 404);
  } catch (e) {
    console.error(e);
    return json({ error: "server error" }, 500);
  }
});
