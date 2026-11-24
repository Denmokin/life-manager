// Fallback sorting when there is no API key or the AI call fails.
// Deliberately simple: a guess is better than leaving things unsorted.
import type { Energy, Kind } from "./types.ts";

export interface SortedFields {
  title: string;
  kind: Kind;
  minutes: number;
  energy: Energy;
  importance: "low" | "normal" | "high";
  due: string | null;
  person: string | null;
}

const has = (text: string, words: string[]) => words.some((w) => text.includes(w));

export function sortByRules(raw: string): SortedFields[] {
  const t = raw.toLowerCase();
  let kind: Kind = "task";
  let minutes = 25;
  let energy: Energy = "medium";
  let person: string | null = null;

  if (has(t, ["someday", "one day", "maybe ", "would be nice", "learn "])) kind = "someday";
  if (has(t, ["game", "gaming", "3d print", "print ", "hobby", "draw", "guitar", "read a book"])) {
    kind = "hobby";
    minutes = 60;
  }
  if (has(t, ["rest", "nap", "walk", "relax", "break"])) {
    kind = "rest";
    energy = "low";
  }
  const call = /\b(call|text|message|visit|write to|talk to)\s+([a-z][\w'-]*)/i.exec(raw);
  if (call || has(t, ["birthday", "gift", "anniversary"])) {
    kind = "people";
    minutes = 15;
    energy = "low";
    if (call) person = call[2];
  }
  if (has(t, ["quick", "reply", "email", "pay ", "book "])) {
    minutes = 10;
    energy = "low";
  }

  return [
    {
      title: raw.trim(),
      kind,
      minutes,
      energy,
      importance: has(t, ["urgent", "asap", "today", "deadline"]) ? "high" : "normal",
      due: null,
      person,
    },
  ];
}

export function breakdownByRules(): { title: string; minutes: number }[] {
  return [
    { title: "Get set up: open what you need, nothing else", minutes: 3 },
    { title: "Do the smallest first part", minutes: 10 },
    { title: "Keep going for one more round", minutes: 10 },
    { title: "Wrap up and mark it done", minutes: 5 },
  ];
}
