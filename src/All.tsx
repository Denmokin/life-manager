import { useState } from "react";
import type { Energy, Importance, Item, Kind } from "../shared/types.ts";
import { isToday } from "./picker.ts";
import { getToken, reopen, setToken, update, useStore } from "./store.ts";
import { KIND_LABEL, metaLine } from "./bits.tsx";

const ORDER: Kind[] = ["task", "people", "hobby", "rest", "someday"];

export function All() {
  const { items, sync, aiEnabled } = useStore();
  const [open, setOpen] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const all = Object.values(items).filter((it) => !it.deleted);
  const live = all.filter((it) => it.status === "open");
  const doneToday = all.filter((it) => it.status === "done" && isToday(it.doneAt));
  const unsorted = live.filter((it) => it.kind === null);

  const row = (it: Item) => (
    <li key={it.id} className={open === it.id ? "open" : ""}>
      <button className="row" onClick={() => setOpen(open === it.id ? null : it.id)}>
        <span className="row-title">{it.title}</span>
        <span className="muted small">{it.kind ? metaLine(it) : "sorting…"}</span>
      </button>
      {open === it.id && <Editor item={it} close={() => setOpen(null)} />}
    </li>
  );

  return (
    <section className="all">
      {unsorted.length > 0 && (
        <>
          <h2>Being sorted</h2>
          <ul className="list">{unsorted.map(row)}</ul>
        </>
      )}
      {ORDER.map((kind) => {
        const list = live
          .filter((it) => it.kind === kind)
          .sort((a, b) => (a.due ?? "9999") .localeCompare(b.due ?? "9999") || a.createdAt.localeCompare(b.createdAt));
        if (!list.length) return null;
        return (
          <div key={kind}>
            <h2>
              {KIND_LABEL[kind]} <span className="muted small">{list.length}</span>
            </h2>
            <ul className="list">{list.map(row)}</ul>
          </div>
        );
      })}
      {live.length === 0 && <p className="muted">Nothing here yet. Everything you dump shows up here.</p>}

      {doneToday.length > 0 && (
        <>
          <h2>
            <button className="link" onClick={() => setShowDone((s) => !s)}>
              Done today ({doneToday.length}) {showDone ? "▾" : "▸"}
            </button>
          </h2>
          {showDone && (
            <ul className="list done">
              {doneToday.map((it) => (
                <li key={it.id}>
                  <div className="row">
                    <span className="row-title">{it.title}</span>
                    <button className="link small" onClick={() => reopen(it.id)}>
                      Undo
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <Settings sync={sync} aiEnabled={aiEnabled} />
    </section>
  );
}

function Editor({ item, close }: { item: Item; close: () => void }) {
  const [draft, setDraft] = useState(item);
  const set = <K extends keyof Item>(k: K, v: Item[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const save = () => {
    update(item.id, {
      title: draft.title.trim() || item.title,
      kind: draft.kind ?? "task",
      minutes: draft.minutes,
      due: draft.due || null,
      energy: draft.energy,
      importance: draft.importance,
      sortedBy: "me",
    });
    close();
  };

  return (
    <div className="editor">
      <input value={draft.title} onChange={(e) => set("title", e.target.value)} aria-label="Title" />
      <div className="editor-grid">
        <label>
          Kind
          <select value={draft.kind ?? "task"} onChange={(e) => set("kind", e.target.value as Kind)}>
            {ORDER.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Minutes
          <input
            type="number"
            min={1}
            value={draft.minutes}
            onChange={(e) => set("minutes", Math.max(1, Number(e.target.value) || 1))}
          />
        </label>
        <label>
          Due
          <input type="date" value={draft.due ?? ""} onChange={(e) => set("due", e.target.value || null)} />
        </label>
        <label>
          Energy
          <select value={draft.energy} onChange={(e) => set("energy", e.target.value as Energy)}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <label>
          Importance
          <select value={draft.importance} onChange={(e) => set("importance", e.target.value as Importance)}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
        </label>
      </div>
      <div className="editor-actions">
        <button className="primary" onClick={save}>
          Save
        </button>
        <button className="ghost" onClick={() => (update(item.id, { status: "done", doneAt: new Date().toISOString() }), close())}>
          Done
        </button>
        <button className="ghost" onClick={() => (update(item.id, { deleted: true }), close())}>
          Delete
        </button>
      </div>
    </div>
  );
}

function Settings({ sync, aiEnabled }: { sync: string; aiEnabled: boolean }) {
  const [token, setTokenDraft] = useState(getToken());
  const status =
    sync === "ok"
      ? "Synced"
      : sync === "offline"
        ? "Offline. Everything is saved on this device and syncs later."
        : sync === "needs-token"
          ? "The server needs the app token."
          : "Syncing…";
  return (
    <details className="settings" open={sync === "needs-token"}>
      <summary>Settings</summary>
      <p className="small">{status}</p>
      <p className="small">AI sorting: {aiEnabled ? "on" : "off (simple rules for now)"}</p>
      <label className="small">
        App token
        <input type="password" value={token} onChange={(e) => setTokenDraft(e.target.value)} />
      </label>
      <button className="ghost" onClick={() => setToken(token)}>
        Save token
      </button>
    </details>
  );
}
