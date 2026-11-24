// AI sorting and task breakdown through the Claude API.
// Runtime-agnostic: used by the local Node server and the Supabase Edge Function.
import Anthropic from "@anthropic-ai/sdk";
import type { Item } from "./types.ts";
import { localDate } from "./types.ts";
import type { SortedFields } from "./rules.ts";

const SORT_SYSTEM = `You are the sorting brain of a personal life-manager app built for people with ADHD.
The user dumps raw thoughts in, often messy, voice-typed, or several things in one line. Your job is to turn each dump into clean, concrete items so they never have to organize anything themselves.

For each item:
- title: short, concrete, starts with a verb when it is an action ("Call mom", "Buy PLA filament"). Keep their language and names. No emojis.
- kind:
  - task: something to get done (work, chores, errands, admin, shopping)
  - someday: no pressure, maybe later, ideas, wishes
  - hobby: doing something for fun (3D printing, gaming, etc.). Buying supplies for a hobby is a task.
  - rest: recovery (walk, nap, doing nothing)
  - people: anything centered on a person: calls, messages, birthdays, gifts, quality time with partner or family
- minutes: a realistic estimate. People with ADHD underestimate, so lean longer for anything with several parts.
- energy: how much focus it needs to start and do (low / medium / high).
- importance: high only for real consequences or deadlines; most things are normal.
- due: YYYY-MM-DD only if the dump states or clearly implies a date; otherwise null. Resolve "tomorrow", "Friday", "next week" against today's date.
- person: the person's name if it is about someone, else null.

Splitting:
- If one dump contains several separate things, return one item per thing.
- A birthday or event date becomes two items: a gift task due about 14 days before (if a gift fits), and a people item on the day ("Wish Dana happy birthday"). If the date already passed this year, use next year.
- Do not invent tasks that were not asked for beyond that.`;

const SORT_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          kind: { type: "string", enum: ["task", "someday", "hobby", "rest", "people"] },
          minutes: { type: "integer" },
          energy: { type: "string", enum: ["low", "medium", "high"] },
          importance: { type: "string", enum: ["low", "normal", "high"] },
          due: { anyOf: [{ type: "string" }, { type: "null" }] },
          person: { anyOf: [{ type: "string" }, { type: "null" }] },
        },
        required: ["title", "kind", "minutes", "energy", "importance", "due", "person"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

const BREAKDOWN_SYSTEM = `You help a person with ADHD start a task they feel stuck on.
Break the task into 3 to 6 tiny, concrete steps, in order. Each step must be physically obvious ("Open the laptop and the invoice folder"), take 2 to 15 minutes, and start with a verb. Make the first step almost too easy to refuse. No emojis, no motivational filler.`;

const BREAKDOWN_SCHEMA = {
  type: "object",
  properties: {
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, minutes: { type: "integer" } },
        required: ["title", "minutes"],
        additionalProperties: false,
      },
    },
  },
  required: ["steps"],
  additionalProperties: false,
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface Ai {
  enabled: boolean;
  sort(raw: Item, now?: Date): Promise<SortedFields[]>;
  breakdown(item: Item): Promise<{ title: string; minutes: number }[]>;
}

export function createAi(opts: { apiKey?: string; model?: string }): Ai {
  const client = opts.apiKey ? new Anthropic({ apiKey: opts.apiKey }) : null;
  const model = opts.model || "claude-opus-5-5";

  async function askJson<T>(system: string, prompt: string, schema: Record<string, unknown>): Promise<T> {
    if (!client) throw new Error("AI is not configured");
    const response = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      system,
      messages: [{ role: "user", content: prompt }],
      output_config: { effort: "low", format: { type: "json_schema", schema } },
      // If a safety classifier declines, the API retries on a fallback model in the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    if (response.stop_reason === "refusal") throw new Error("AI declined this request");
    if (response.stop_reason === "max_tokens") throw new Error("AI response was cut off");
    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") throw new Error("AI returned no text");
    return JSON.parse(text.text) as T;
  }

  return {
    enabled: Boolean(client),

    async sort(raw, now = new Date()) {
      const weekday = now.toLocaleDateString("en-US", { weekday: "long" });
      const prompt = `Today is ${weekday}, ${localDate(now)}.\n\nDump:\n${raw.title}`;
      const out = await askJson<{ items: SortedFields[] }>(SORT_SYSTEM, prompt, SORT_SCHEMA);
      if (!out.items.length) throw new Error("AI returned no items");
      return out.items.map((it) => ({
        ...it,
        minutes: Math.min(Math.max(Math.round(it.minutes) || 25, 2), 600),
        due: it.due && DATE_RE.test(it.due) ? it.due : null,
      }));
    },

    async breakdown(item) {
      const prompt = `Task: ${item.title}\nRough size: ${item.minutes} minutes.`;
      const out = await askJson<{ steps: { title: string; minutes: number }[] }>(
        BREAKDOWN_SYSTEM,
        prompt,
        BREAKDOWN_SCHEMA,
      );
      if (!out.steps.length) throw new Error("AI returned no steps");
      return out.steps.slice(0, 6);
    },
  };
}

/** A readable reason for an API failure, using the SDK's typed errors. */
export function describeAiError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) return "invalid API key";
  if (error instanceof Anthropic.RateLimitError) return "rate limited";
  if (error instanceof Anthropic.BadRequestError) return `bad request: ${error.message}`;
  if (error instanceof Anthropic.APIConnectionError) return "no connection to the API";
  if (error instanceof Anthropic.APIError) return `API error ${error.status}: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}

/** Turn sort results into stored items: the first reuses the raw item, extras are new. */
export function applySort(
  raw: Item,
  fields: SortedFields[],
  by: "ai" | "rules",
  newId: () => string,
  now = new Date().toISOString(),
): Item[] {
  return fields.map((f, i) => {
    const base: Item = i === 0 ? raw : { ...raw, id: newId(), fromId: raw.id, createdAt: now };
    return { ...base, ...f, sortedBy: by, updatedAt: now };
  });
}
