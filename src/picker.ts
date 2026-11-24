// Picks the one thing to show on Right Now. Rules only, so it works offline
// and instantly. The AI's job is to sort items well; this just weighs them.
import type { Energy, Item } from "../shared/types.ts";
import { localDate } from "../shared/types.ts";

export interface Pick {
  item: Item;
  reason: string;
}

const ENERGY_RANK: Record<Energy, number> = { low: 0, medium: 1, high: 2 };
const DAY = 86_400_000;

function daysUntil(due: string, today: string): number {
  return Math.round((Date.parse(due) - Date.parse(today)) / DAY);
}

export function isToday(iso: string | null): boolean {
  return Boolean(iso) && localDate(new Date(iso!)) === localDate();
}

/** Work items finished today since the last rest or hobby. */
export function workSinceBreak(items: Item[]): number {
  const doneToday = items
    .filter((it) => it.status === "done" && !it.deleted && isToday(it.doneAt))
    .sort((a, b) => (a.doneAt! < b.doneAt! ? -1 : 1));
  let count = 0;
  for (const it of doneToday) count = it.kind === "rest" || it.kind === "hobby" ? 0 : count + 1;
  return count;
}

export function candidates(items: Item[], now = Date.now()): Item[] {
  const today = localDate(new Date(now));
  return items.filter(
    (it) =>
      !it.deleted &&
      it.status === "open" &&
      it.kind !== null &&
      it.kind !== "someday" &&
      // A birthday wish weeks ahead is not for today.
      !(it.kind === "people" && it.due && it.due > today) &&
      (!it.snoozedUntil || Date.parse(it.snoozedUntil) <= now),
  );
}

export function pick(items: Item[], energy: Energy | null): Pick | null {
  const today = localDate();
  const level = energy ?? "medium";
  const earnedBreak = workSinceBreak(items) >= 3;
  let best: Pick | null = null;
  let bestScore = -Infinity;

  for (const it of candidates(items)) {
    let score = 0;
    let reason = "";
    const note = (r: string, s: number) => {
      score += s;
      if (s > 0 && !reason) reason = r;
    };

    if (it.due) {
      const d = daysUntil(it.due, today);
      if (d < 0) note("Was due earlier, still worth doing", 45);
      else if (d === 0) note("Due today", 50);
      else if (d <= 2) note("Due in a couple of days", 30);
      else if (d <= 7) note("Due this week", 12);
    }

    if (it.kind === "rest" || it.kind === "hobby") {
      if (earnedBreak) note("You've done 3 things. Rest is part of the plan", 60);
      else if (level === "low") note("Low energy: something easy and good for you", 25);
      else score -= 15;
    } else {
      if (it.importance === "high") note("Important", 25);
      else if (it.importance === "normal") score += 10;

      const gap = ENERGY_RANK[it.energy] - ENERGY_RANK[level];
      if (gap === 0) note(`Fits your ${level} energy`, 12);
      else if (gap > 0) score -= 25 * gap;

      if (it.minutes <= 15) note("Quick win", level === "low" ? 18 : 6);
    }

    // Partly-done items pull you back in.
    if (it.steps.some((s) => s.done)) note("You already started this", 15);

    // Old items rise slowly so nothing rots, skipped ones sink a little.
    score += Math.min((Date.now() - Date.parse(it.createdAt)) / DAY, 10);
    score -= it.skips * 6;

    if (score > bestScore) {
      bestScore = score;
      best = { item: it, reason: reason || "A good next thing" };
    }
  }
  return best;
}
