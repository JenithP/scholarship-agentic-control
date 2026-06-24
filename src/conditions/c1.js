// conditions/c1.js — C1: low-autonomy / high-control (SPEC §2).
//
// The agent's reasoning streams into a single terminal, evaluating each of the 8
// applicants in turn. When a recommendation line is typed (recommend /
// borderline / do not recommend), [Approve] [Reject] buttons appear inline right
// next to that line — but they stay LOCKED while the agent is still evaluating.
// Only once every applicant has been evaluated do the inline controls unlock, so
// the participant must read the whole log through first and then scroll back up
// to review and decide on each applicant individually (no rubber-stamping the
// agent's scoring mid-stream). The final [Approve selection] button unlocks once
// all applicants have a decision. The final 3 are drawn from the applicants the
// participant approved (control is real, not token). Intended feeling: approval
// fatigue + deliberate, considered review.

import { CONFIG } from '../config.js';
import { applicantScript, finalScript, selectionReason } from '../scripts/reasoning.js';
import { streamLines, StreamRun, makeSkippable } from '../typewriter.js';
import { el, clear, button, terminal, finalResult, conditionBanner } from '../ui.js';

const BANNER = 'The agent evaluates all applicants one by one in the log below. Read through '
  + 'its reasoning first — the approve/reject controls stay locked until it finishes. Then '
  + 'scroll back up and decide on each applicant; the Approve selection button unlocks only '
  + 'once you have decided on all of them.';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runC1({ container, applicants, logger }) {
  clear(container);
  const t = CONFIG.typing;
  const startMs = Date.now();
  const counts = { approve: 0, reject: 0 };
  const decisions = []; // { applicant, score, components, approved }

  const progress = el('div', { class: 'progress-pill' });
  const { panel, body } = terminal('agent reasoning — step-by-step');
  panel.classList.add('terminal-tall');
  const actionSlot = el('div', { class: 'action-slot' });

  container.appendChild(conditionBanner('C1', BANNER));
  container.appendChild(progress);
  container.appendChild(panel);
  container.appendChild(actionSlot);

  // The finalize bar exists from the start but stays disabled until every
  // applicant has a decision (the gate the participant must clear).
  const counter = el('span', {
    class: 'finalize-count', text: `Decided 0 / ${applicants.length}`,
  });
  const submitBtn = button('Approve selection', null, 'approve');
  setDisabled(submitBtn, true);
  const finalizeBar = el('div', { class: 'finalize-bar' }, [
    el('div', { class: 'finalize-hint' }, [
      el('span', { text: 'Decide on every applicant to continue. ' }),
      counter,
    ]),
    submitBtn,
  ]);

  let decidedCount = 0;
  const unlockers = []; // per-applicant fns that enable the inline decision

  // --- Stream the agent evaluating each applicant; attach the decision inline.
  for (let i = 0; i < applicants.length; i++) {
    const a = applicants[i];
    progress.textContent = `Evaluating applicant ${i + 1} of ${applicants.length}`;

    const { lines, score, components, verdict } = applicantScript(a);
    const run = new StreamRun();
    const detach = makeSkippable(body, run);
    await streamLines(body, [''].concat(lines), {
      charDelayMs: t.charDelayMs, lineDelayMs: t.lineDelayMs, run,
    });
    detach();

    // The last typed line is the recommendation ("…: do not recommend"). Attach
    // the approve/reject buttons inline, right next to it.
    const recLine = body.lastChild;
    const decision = { applicant: a, score, components, approved: null };
    decisions.push(decision);
    const unlock = attachDecision(recLine, (approved) => {
      if (decision.approved !== null) return; // already decided
      decision.approved = approved;
      decidedCount += 1;
      const action = approved ? 'approve' : 'reject';
      counts[action] += 1;
      counter.textContent = `Decided ${decidedCount} / ${applicants.length}`;
      logger.logEvent(action, {
        targetApplicantId: a.id, payload: { score, verdict: verdict.tag, approved },
      });
      if (decidedCount === applicants.length) {
        setDisabled(submitBtn, false);
        finalizeBar.classList.add('is-ready');
      }
    });
    unlockers.push(unlock);
    body.scrollTop = body.scrollHeight;
    await sleep(t.autoStepDelayMs);
  }

  // --- All evaluated: unlock the inline controls and prompt a review pass. ----
  progress.textContent = 'Review each applicant to finalize';
  const noteRun = new StreamRun();
  await streamLines(body, [
    '',
    `> all ${applicants.length} applicants evaluated.`,
    '> review controls are now unlocked.',
    '> scroll up and approve or reject each recommendation.',
    '> the Approve selection button unlocks once all are decided.',
  ], { charDelayMs: t.charDelayMs, lineDelayMs: t.lineDelayMs, run: noteRun });

  // Unlock every inline decision, then nudge back to the top so the participant
  // re-reads from applicant 1 rather than deciding from the bottom up.
  unlockers.forEach((fn) => fn());
  body.classList.add('is-reviewable');
  body.scrollTop = 0;

  actionSlot.appendChild(finalizeBar);

  // --- Wait for the participant to decide all, then submit. -------------------
  await new Promise((resolve) => {
    submitBtn.addEventListener('click', () => {
      if (submitBtn.disabled) return;
      logger.logEvent('approve', {
        payload: { phase: 'finalize', approvedCount: counts.approve, rejectedCount: counts.reject },
      });
      resolve();
    });
  });

  // --- Final selection: top N among approved; backfill by score if too few
  // approved so the deliverable always has 3 (SPEC §1).
  const approved = decisions.filter((d) => d.approved);
  const pool = (approved.length >= CONFIG.selectCount ? approved : decisions)
    .slice()
    .sort((x, y) => y.score - x.score);
  const selected = pool.slice(0, CONFIG.selectCount).map(toRow);

  await showFinal(actionSlot, panel, progress, selected, logger, t);

  return {
    condition: 'C1',
    totalTimeMs: Date.now() - startMs,
    counts,
    interventionOccurred: false,
    interventionAtMs: null,
    approvedCount: approved.length,
    selectedIds: selected.map((r) => r.applicant.id),
  };
}

function toRow(d) {
  // Rebuild a ranked-row shape for the shared final renderer.
  return { applicant: d.applicant, score: d.score, components: d.components };
}

/**
 * Append inline approve/reject buttons to a streamed recommendation line. The
 * buttons start LOCKED (so the participant reads the whole log before deciding)
 * and the returned `unlock()` enables them once evaluation finishes.
 */
function attachDecision(lineEl, onDecide) {
  const approveBtn = button('Approve', (e) => { e.stopPropagation(); decide(true); }, 'approve');
  const rejectBtn = button('Reject', (e) => { e.stopPropagation(); decide(false); }, 'reject');
  const status = el('span', { class: 'decision-status' });
  setDisabled(approveBtn, true);
  setDisabled(rejectBtn, true);
  lineEl.appendChild(el('span', { class: 'term-decision' }, [approveBtn, rejectBtn, status]));

  function decide(approved) {
    setDisabled(approveBtn, true);
    setDisabled(rejectBtn, true);
    status.textContent = approved ? '✓ approved' : '✕ rejected';
    lineEl.classList.add(approved ? 'is-approved' : 'is-rejected');
    onDecide(approved);
  }

  return function unlock() {
    if (lineEl.classList.contains('is-approved') || lineEl.classList.contains('is-rejected')) return;
    setDisabled(approveBtn, false);
    setDisabled(rejectBtn, false);
  };
}

function setDisabled(btn, disabled) {
  btn.disabled = disabled;
  btn.classList.toggle('is-disabled', disabled);
}

async function showFinal(actionSlot, panel, progress, selected, logger, t) {
  progress.textContent = 'Compiling final selection…';
  clear(actionSlot);
  const { panel: fp, body } = terminal('agent reasoning — final');
  panel.replaceWith(fp);

  const run = new StreamRun();
  const detach = makeSkippable(body, run);
  await streamLines(body, [''].concat(finalScript(selected)), {
    charDelayMs: t.charDelayMs, lineDelayMs: t.lineDelayMs, run,
  });
  detach();
  progress.textContent = 'Selection complete';

  logger.logEvent('view_result', {
    payload: { selectedIds: selected.map((r) => r.applicant.id) },
  });
  actionSlot.appendChild(finalResult(selected, selectionReason));

  await new Promise((resolve) => {
    actionSlot.appendChild(el('div', { class: 'continue-bar' }, [
      button('Continue', () => resolve(), 'primary'),
    ]));
  });
}
