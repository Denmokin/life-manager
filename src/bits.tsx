import type { Item, Kind } from "../shared/types.ts";

export const KIND_LABEL: Record<Kind, string> = {
  task: "Task",
  people: "People",
  hobby: "Hobby",
  rest: "Rest",
  someday: "Someday",
};

export function KindChip({ kind }: { kind: Kind }) {
  return <span className={`chip chip-${kind}`}>{KIND_LABEL[kind]}</span>;
}

export function minutesLabel(m: number): string {
  if (m < 60) return `~${m} min`;
  const h = m / 60;
  return `~${Number.isInteger(h) ? h : h.toFixed(1)} h`;
}

export function dueLabel(due: string | null): string | null {
  if (!due) return null;
  const d = new Date(due + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function metaLine(it: Item): string {
  return [minutesLabel(it.minutes), it.person, dueLabel(it.due)].filter(Boolean).join(" · ");
}
