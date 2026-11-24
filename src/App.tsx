import { useEffect, useState } from "react";
import { Now } from "./Now.tsx";
import { Dump } from "./Dump.tsx";
import { All } from "./All.tsx";
import { setToken, useStore } from "./store.ts";

/** Shown on every screen until the passphrase matches the server's APP_TOKEN. */
function PassphraseGate() {
  const { sync } = useStore();
  const [value, setValue] = useState("");
  if (sync !== "needs-token") return null;
  return (
    <form
      className="gate"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) setToken(value.trim());
      }}
    >
      <p>
        <strong>Enter your app passphrase</strong> to sync. Your dumps are safe on this device meanwhile.
      </p>
      <input type="password" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="current-password" />
      <button className="primary" type="submit">
        Unlock
      </button>
    </form>
  );
}

type Tab = "now" | "dump" | "all";

function tabFromHash(): Tab {
  const h = location.hash.replace("#", "");
  return h === "dump" || h === "all" ? h : "now";
}

export function App() {
  const [tab, setTab] = useState<Tab>(tabFromHash);

  const go = (t: Tab) => {
    setTab(t);
    history.replaceState(null, "", t === "now" ? location.pathname : `#${t}`);
  };

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    // Desktop: press "n" anywhere to dump a thought, Escape to go back.
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea, select");
      if (!typing && e.key === "n" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        go("dump");
      }
      if (e.key === "Escape" && tab === "dump") go("now");
    };
    window.addEventListener("hashchange", onHash);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("keydown", onKey);
    };
  }, [tab]);

  return (
    <div className="app">
      <main>
        <PassphraseGate />
        {tab === "now" && <Now goDump={() => go("dump")} />}
        {tab === "dump" && <Dump />}
        {tab === "all" && <All />}
      </main>
      <nav className="tabs">
        <button className={tab === "now" ? "active" : ""} onClick={() => go("now")}>
          Now
        </button>
        <button className={`dump-tab ${tab === "dump" ? "active" : ""}`} onClick={() => go("dump")}>
          + Dump
        </button>
        <button className={tab === "all" ? "active" : ""} onClick={() => go("all")}>
          All
        </button>
      </nav>
    </div>
  );
}
