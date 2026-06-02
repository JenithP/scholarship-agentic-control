# scholarship-agentic-control

Research stimulus for a within-subject experiment on **agentic-AI autonomy level → user
control / achievement / psychological ownership**, using a simulated AI that selects
scholarship recipients.

**Read `SPEC.md` first — it is the source of truth.**

## What this is
A deployable web stimulus. Participant = scholarship committee officer. A simulated AI agent
evaluates 8 applicants and selects 3, under three control conditions (C1/C2/C3). Surveys live
in Qualtrics; this site only runs the task and logs behavior.

## Key constraints
- Agent "reasoning" is **fixed scripted playback**, not a live LLM call (stimulus must be
  identical across participants).
- Condition order is assigned by **Qualtrics** and read from URL param `cond`.
- Logging sits behind a single `Logger` interface: start with `ConsoleLogger`, swap in
  `FirestoreLogger` before live data collection.

## Layout
- `SPEC.md` — full specification
- `data/applicants.json` — 8 applicants × 3 difficulty-matched sets
- `src/` — app code (to be built)
- `public/` — static assets

## Running locally
This is a static SPA (vanilla JS, ES modules) — no build step. It must be served over
HTTP (ES modules + `fetch` of the applicant JSON don't work from `file://`).

```bash
npm start                 # serves on http://localhost:5000 via `npx serve`
# or, with Python:
python -m http.server 5000
```

Then open `http://localhost:5000/`.

### URL params (SPEC §4)
All optional in dev — sensible defaults are filled in so the stimulus is fully playable
without Qualtrics:

- `cond` — condition order, e.g. `C2-C1-C3` (default `C1-C2-C3`). The site **reads** this; it
  never assigns order.
- `PROLIFIC_PID`, `STUDY_ID`, `SESSION_ID` — passed through to every log doc.

Example: `http://localhost:5000/?cond=C3-C1-C2&PROLIFIC_PID=abc123`

### Inspecting logs (MVP / ConsoleLogger)
Every event is `console.log`-ged live. On the End screen, **Download session log (JSON)**
saves all events + per-condition summaries. From the devtools console: `window.__logger.dump()`.

## Build status (SPEC §10)
- [x] **1. MVP** — dummy data + fixed scripted streaming + `ConsoleLogger`; all 3 conditions playable.
- [ ] 2. Verify the manipulation feels distinct (manual pilot pass).
- [ ] 3. Add `FirestoreLogger` + write-only security rules.
- [ ] 4. URL-param intake is wired; still need the Qualtrics post-survey redirect.
- [ ] 5. Pilot, then tune scripts/pacing (constants live in `src/config.js`).

## Code layout
- `index.html` — entry; loads `src/app.js` as a module.
- `src/app.js` — screen flow (Entry → Intro → 3 rounds → End), URL params, blur/focus tracking.
- `src/config.js` — tunable constants: condition order, set rotation, criteria weights, pacing.
- `src/logger.js` — `Logger` interface + `ConsoleLogger` (swap point for `FirestoreLogger`).
- `src/scoring.js` — deterministic weighted scoring/ranking (same model drives all conditions).
- `src/scripts/reasoning.js` — fixed scripted reasoning (per-applicant, plan, goal-ack, final).
- `src/typewriter.js` — terminal typing animation (skippable / cancellable).
- `src/ui.js` — DOM helpers (applicant card hides `archetype`, terminal, final result).
- `src/conditions/{c1,c2,c3}.js` — the three condition controllers (the core manipulation).
