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

## On the phone

1. Run `npm start` on the computer and find its local IP (`ip -4 addr`).
2. Open `http://<that-ip>:8787` on the phone (same Wi-Fi).

That works, but phones only allow **install to home screen and offline use over HTTPS**. The easiest way to get HTTPS at home is [Tailscale](https://tailscale.com): install it on both devices, then run `tailscale serve --bg 8787` on the computer and open the `https://…ts.net` address it prints. That also works away from home.

If the server can be reached from outside your home network, set `APP_TOKEN` in `.env` and enter the same token in the app under **All → Settings**.

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
