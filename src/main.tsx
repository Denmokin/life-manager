import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { startSync } from "./store.ts";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

startSync();

// Offline shell + installable app. Browsers only allow this on HTTPS or localhost.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  const base = import.meta.env.BASE_URL; // "/" locally, "/life-manager/" on GitHub Pages
  navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {});
}
