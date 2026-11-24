import { useEffect, useState } from "react";
import type { Energy, Item } from "../shared/types.ts";
import { isToday, pick } from "./picker.ts";
import { API, apiHeaders, applyServerItem, complete, setEnergy, update, useStore } from "./store.ts";
import { KindChip, metaLine, minutesLabel } from "./bits.tsx";

const ENERGY_STALE_MS = 4 * 3600_000;

const CHEERS = ["Nice.", "Done. That counts.", "One less thing in your head.", "Good. Breathe.", "That's real progress."];

function tomorrowMorning(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(6, 0, 0, 0);
  return d.toISOString();
}

export function Now({ goDump }: { goDump: () => void }) {
  const { items, energy, sync } = useStore();
  const [askEnergy, setAskEnergy] = useState(false);
  const [celebrate, setCelebrate] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [breaking, setBreaking] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Re-render every minute so snoozed items come back on their own.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const all = Object.values(items);
  const level = energy && Date.now() - energy.at < ENERGY_STALE_MS ? energy.level : null;
  const doneToday = all.filter((it) => it.status === "done" && !it.deleted && isToday(it.doneAt)).length;
  const sorting = all.filter((it) => it.kind === null && !it.deleted).length;
  const current = pick(all, level);

  if (celebrate) {
    return (
      <section className="now celebrate" onClick={() => setCelebrate(null)}>
        <div className="check-burst" aria-hidden="true">✓</div>
        <p className="cheer">{celebrate}</p>
        <p className="muted">{doneToday} done today</p>
        <button className="primary" onClick={() => setCelebrate(null)}>
          Next
        </button>
      </section>
    );
  }

  if (!level || askEnergy) {
    const choose = (e: Energy) => {
      setEnergy(e);
      setAskEnergy(false);
    };
    return (
      <section className="now">
        <h1 className="quiet-title">How's your energy right now?</h1>
        <div className="energy-choices">
          <button onClick={() => choose("low")}>Low</button>
          <button onClick={() => choose("medium")}>Okay</button>
          <button onClick={() => choose("high")}>Good</button>
        </div>
        <p className="hint">No wrong answer. It only changes what gets suggested.</p>
      </section>
    );
  }

  const header = (
    <div className="now-meta">
      <button className="link" onClick={() => setAskEnergy(true)}>
        Energy: {level === "medium" ? "okay" : level === "high" ? "good" : "low"}
      </button>
      {doneToday > 0 && <span className="muted">{doneToday} done today</span>}
      {sorting > 0 && <span className="muted">sorting {sorting} new…</span>}
      {sync === "offline" && <span className="muted">offline, saved here</span>}
    </div>
  );

  if (!current) {
    return (
      <section className="now">
        {header}
        <div className="empty">
          <h1 className="quiet-title">Nothing needs you right now.</h1>
          <p className="muted">Rest, or dump whatever's on your mind.</p>
          <button className="primary" onClick={goDump}>
            Dump something
          </button>
        </div>
        {note && <p className="toast">{note}</p>}
      </section>
    );
  }

  const it: Item = current.item;
  const nextStep = it.steps.find((s) => !s.done);
  const stepIndex = nextStep ? it.steps.indexOf(nextStep) : -1;

  const flash = (msg: string) => {
    setNote(msg);
    setTimeout(() => setNote(null), 2500);
  };

  const done = () => {
    setMenu(false);
    if (nextStep) {
      const steps = it.steps.map((s) => (s.id === nextStep.id ? { ...s, done: true } : s));
      update(it.id, { steps });
      if (steps.some((s) => !s.done)) {
        flash("Step done. Next one's small too.");
        return;
      }
    }
    complete(it.id);
    setCelebrate(CHEERS[Math.floor(Math.random() * CHEERS.length)]);
  };

  const notNow = (mode: "else" | "tomorrow" | "drop") => {
    setMenu(false);
    if (mode === "drop") {
      update(it.id, { status: "dropped" });
      flash("Let go. That's a decision, not a failure.");
    } else if (mode === "tomorrow") {
      update(it.id, { snoozedUntil: tomorrowMorning(), skips: it.skips + 1 });
      flash("Moved to tomorrow.");
    } else {
      update(it.id, { snoozedUntil: new Date(Date.now() + 45 * 60_000).toISOString(), skips: it.skips + 1 });
    }
  };

  const breakDown = async () => {
    setBreaking(true);
    try {
      const res = await fetch(`${API}/breakdown`, {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({ id: it.id }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const { steps } = (await res.json()) as { steps: Item["steps"] };
      applyServerItem({ ...it, steps });
    } catch {
      flash("Can't break it down while offline. Try just the first 5 minutes?");
    } finally {
      setBreaking(false);
    }
  };

  return (
    <section className="now">
      {header}
      <article className="focus">
        <p className="reason">{current.reason}</p>
        {nextStep ? (
          <>
            <h1 className="focus-title">{nextStep.title}</h1>
            <p className="muted">
              Step {stepIndex + 1} of {it.steps.length} · {minutesLabel(nextStep.minutes)} · for “{it.title}”
            </p>
          </>
        ) : (
          <>
            <h1 className="focus-title">{it.title}</h1>
            <p className="muted">
              {it.kind && <KindChip kind={it.kind} />} {metaLine(it)}
            </p>
          </>
        )}
      </article>

      <div className="focus-actions">
        <button className="primary big" onClick={done}>
          Done
        </button>
        {!nextStep && it.kind === "task" && (
          <button className="ghost" onClick={breakDown} disabled={breaking}>
            {breaking ? "Breaking it down…" : "Too big? Break it down"}
          </button>
        )}
        <button className="ghost" onClick={() => setMenu((m) => !m)}>
          Not now
        </button>
        {menu && (
          <div className="not-now">
            <button onClick={() => notNow("else")}>Show me something else</button>
            <button onClick={() => notNow("tomorrow")}>Tomorrow</button>
            <button onClick={() => notNow("drop")}>Let it go</button>
          </div>
        )}
      </div>
      {note && <p className="toast">{note}</p>}
    </section>
  );
}
