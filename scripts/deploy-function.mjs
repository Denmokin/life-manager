// Deploys the cloud API to Supabase. Copies the shared code next to the function first,
// because Supabase uploads only the function's own folder.
// Needs a one-time `npx supabase login`.
import { cpSync, mkdirSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const PROJECT_REF = "wvtyhrncsszzitufugpk";
const dest = "supabase/functions/api/_shared";

mkdirSync(dest, { recursive: true });
for (const f of readdirSync("shared")) if (f.endsWith(".ts")) cpSync(`shared/${f}`, `${dest}/${f}`);

const r = spawnSync(
  "npx",
  ["supabase", "functions", "deploy", "api", "--no-verify-jwt", "--project-ref", PROJECT_REF],
  { stdio: "inherit" },
);
process.exit(r.status ?? 1);
