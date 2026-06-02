# SPEC.md — Scholarship-Selection Agentic-AI Control Experiment (Stimulus)

> Build target for Claude Code. This document is the source of truth. Build a deployable
> web stimulus that simulates an agentic AI selecting scholarship recipients, under three
> control conditions. The stimulus is a research instrument: **fidelity of the condition
> manipulation and clean logging matter more than visual flair.**

## 1. Purpose
Measure how an agentic AI's **autonomy level (distribution of control)** affects a user's
sense of **control/agency, achievement/self-efficacy, and psychological ownership**.

The participant plays a **scholarship committee officer**. A simulated AI agent evaluates
8 applicants and selects 3. The participant experiences this under three control conditions.

- Design: **within-subject**, 3 conditions (C1/C2/C3).
- Condition order: **counterbalanced (Latin square) by Qualtrics**, passed in via URL param `cond`.
  The site does NOT assign order; it only reads it. (Exact order codes TBD — leave configurable.)
- Task: select **3 of 8** applicants. Output format identical across conditions
  (final list of 3 + reasons).

## 2. Conditions (the core manipulation)

| | C1 low-autonomy / high-control | C2 mid-autonomy / selective-control | C3 high-autonomy / low-control |
|---|---|---|---|
| Planning | none | AI proposes criteria + weights → **one approval** | none |
| Execution | evaluates **one applicant at a time**, pauses each step | after approval, **auto-evaluates all** | **fully automatic** after goal input |
| Intervention | every step: **[Approve] [Reject] [Edit score]** | persistent **[Stop & intervene]** button | none |
| Participant action | approve/reject all 8 individually | approve plan + optional intervention | enter goal only, view result |
| Intended feeling | approval fatigue | "I can step in if I want" — control in reserve | hands-off ease / loss of grip |

- **Common**: the agent's "reasoning" streams in a terminal/log style (typed animation).
  Final deliverable identical in format across all three.
- The manipulation must be **clearly felt**. C1's approval fatigue and C2's standing
  ability to intervene are the most important to get right.

## 3. Agent "reasoning" = fixed scripted playback
The streamed reasoning is **pre-written, fixed scripts** replayed verbatim (typing
animation), **NOT** a live LLM call. This guarantees identical stimulus content across
participants and conditions (internal validity). Scripts live in `src/scripts/` keyed by
condition + applicant set.

## 4. Screen flow
1. **Entry**: read URL params `PROLIFIC_PID`, `STUDY_ID`, `SESSION_ID`, `cond`.
2. **Intro**: role framing ("You are a scholarship committee officer") + task description.
3. **Condition run ×3** (order from `cond`): brief condition framing → agent interaction →
   view final 3-recipient list → "Continue". **No survey here** (surveys are in Qualtrics).
4. **End**: redirect to Qualtrics post-survey (pass `PROLIFIC_PID`) or show completion code.

## 5. Applicant data
- `data/applicants.json` — 8 applicants × 3 difficulty-matched sets (setA/setB/setC),
  already generated. Each set carries the same archetype distribution so no set is easier.
- Fields: id, name, gpa (0–4.5), incomeDecile (1=lowest income/highest need … 10),
  volunteerHours, essaySummary, flag, archetype. `archetype` is an internal balancing
  label — **never shown to participants**.
- Map applicant set → condition slot by position in the order (set rotation), so each
  condition uses a fresh set.

## 6. Logging (Firebase Firestore)
Collection `sessions/{sessionId}/events`, one doc per event:
```
prolificPid, studyId, sessionId,
conditionOrder,            // e.g. "C2-C1-C3"
condition,                 // current C1|C2|C3
applicantSet,              // setA|setB|setC
eventType,                 // start|plan_approve|approve|reject|edit_score|
                           // intervene|view_result|complete|page_blur|page_focus
targetApplicantId,         // when applicable
timestamp,                 // serverTimestamp
elapsedMsFromCondStart,
payload                    // before/after scores, intervention detail, etc.
```
Also write a per-condition **summary** doc: total time, counts of approve/reject/edit,
whether/when an intervention occurred, blur count.

## 7. Prolific / Qualtrics integration
Flow: Prolific → Qualtrics (consent + pre) → **this site** (PID passed in URL) →
3 conditions → Qualtrics (post-survey: per-condition SoA, self-efficacy, ownership,
NASA-TLX, satisfaction) → Prolific submit.
- Embed `PROLIFIC_PID` in every log doc so logs merge with Qualtrics responses later.
- Pass each condition's end timestamp onward (URL or log) so survey blocks match conditions.
- Never put PID in a place that violates platform rules; URL param in is fine, keep it server-side in logs.

## 8. Firebase — do I need it open first?
You can build and fully demo the MVP **without** Firebase using a local/no-op logger
(console + in-memory + downloadable JSON). Firebase is only needed for real data collection.
Recommended order:
1. Build MVP with a `Logger` interface and a `ConsoleLogger` implementation.
2. Before piloting with real participants, create the Firebase project, add a
   `FirestoreLogger` implementation behind the same interface, set **write-only** security
   rules (clients append events; no read), and put config in env, not hardcoded.
So: **not required to start; required before live data.** Keep logging behind one interface
so the swap is trivial.

## 9. Tech stack
- Static SPA (vanilla JS or a light framework), Firebase Firestore for logging, Netlify deploy.
- Responsive (desktop-first, tablet ok). Minimize key exposure; Firestore rules restrict to append.

## 10. Build order for Claude Code
1. MVP with dummy data + fixed scripted streaming + ConsoleLogger; all 3 conditions playable.
2. Verify the manipulation feels distinct (C1 fatigue, C2 intervention-in-reserve, C3 hands-off).
3. Add FirestoreLogger + security rules.
4. Add URL-param intake (PID/STUDY/SESSION/cond) + Qualtrics redirect.
5. Pilot, then tune scripts/pacing.

## 11. Open items (decide later)
- Exact Latin-square order codes for `cond` (set by Qualtrics).
- Qualtrics post-survey item wording (SoA [Tapal et al. 2017], self-efficacy, psychological
  ownership [Pierce et al.], NASA-TLX, satisfaction).
- Completion-code vs auto-redirect handoff back to Prolific.
