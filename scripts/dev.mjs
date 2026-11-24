// Runs the API server and the Vite dev server together. Ctrl+C stops both.
import { spawn } from "node:child_process";

const procs = [
  spawn("node", ["--watch", "--env-file-if-exists=.env", "server/index.ts"], { stdio: "inherit" }),
  spawn("npx", ["vite"], { stdio: "inherit" }),
];

const stop = () => {
  for (const p of procs) p.kill();
  process.exit();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const p of procs) p.on("exit", stop);
