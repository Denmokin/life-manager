# Life Manager: stage 1 (Dump + Right Now)

Dump everything in, the robot sorts it, you see one thing to do.

- **Dump:** type or speak, Enter saves. Several lines = several items. No categories needed.
- **Sorting:** Claude turns each dump into clean items (task / people / hobby / rest / someday, duration, energy, date, person). It splits "call mom and buy filament" into two, and turns a birthday into a gift reminder about two weeks earlier plus a wish on the day. Without an API key, simple rules sort instead.
- **Now:** one thing, big. Energy check-in first (asked again after 4 hours). Buttons:
  - **Done:** short celebration, "N done today".
  - **Too big? Break it down:** 3–6 tiny steps; Now then shows one step at a time.
  - **Not now:** something else (back in 45 min), tomorrow, or **let it go** (dropped, no guilt).
  - After 3 work items it suggests rest or a hobby.
- **All:** everything by kind, tap to edit, today's done list with undo, settings.
- **Offline:** everything is saved on the device first and syncs when the server is reachable.

Keyboard on the computer: `n` opens Dump, `Esc` goes back.

## Run it

```bash
npm install
```

```bash
cp .env.example .env
```

Put your Anthropic API key in `.env` (`ANTHROPIC_API_KEY=...`). Then either:

```bash
npm run dev
```

for development (opens on http://localhost:5173), or for daily use:

```bash
npm run build && npm start
```

which serves everything on http://localhost:8787.

Your data lives in `data/store.json`. Back that file up; it's your whole brain.

## The live app (cloud)

**https://denmokin.github.io/life-manager/**: open it on any device, enter your passphrase once, then install it (Chrome menu → Install).

| Part | Where it runs |
| --- | --- |
| App screens | GitHub Pages, rebuilt on every push to `main` (`.github/workflows/pages.yml`) |
| API + AI sorting | Supabase Edge Function `api` (`supabase/functions/api/`) |
| Data | Supabase Postgres table `items` (`supabase/migrations/`) |

Secrets live in Supabase → Edge Functions → Secrets: `ANTHROPIC_API_KEY` and `APP_TOKEN` (your passphrase). The passphrase is also in your local `.env` so you can find it again.

To update the cloud API after changing `shared/` or the function:

```bash
npx supabase login
```

```bash
npm run deploy:function
```

The free Supabase plan pauses a project after 7 days without use; restore it with one click in the dashboard.

The local server (`npm run dev` / `npm start`) is still there for trying changes before pushing.

## Quick-dump hotkey on Omarchy

Add to `~/.config/hypr/bindings.conf` (Super+Alt+D is free on this machine):

```
bindd = SUPER ALT, D, Life dump, exec, omarchy-launch-webapp "http://localhost:8787/#dump"
```

On Android, long-press the installed app icon for a "Quick dump" shortcut.

## How it's built

| Part | Where |
| --- | --- |
| Shared item model | `shared/types.ts` |
| Server: sync, storage, sorting queue | `server/index.ts`, `server/store.ts` |
| Claude prompts and schemas | `server/ai.ts` (model `claude-opus-5-5`, low effort, structured JSON output) |
| Fallback rules | `server/rules.ts` |
| Picker for Right Now (rules, works offline) | `src/picker.ts` |
| Device storage + sync | `src/store.ts` |
| Screens | `src/Now.tsx`, `src/Dump.tsx`, `src/All.tsx` |
| Offline shell | `public/sw.js` |

The AI only sorts and breaks down. Picking what's next is plain rules in `src/picker.ts`: instant, offline, and easy to tune once you've lived with it for a week.
