// conditions/c1.js — C1: low-autonomy / high-control (SPEC §2).
//
// The agent evaluates all 8 applicants; each one appears in a review list as it
// is scored, tagged with the agent's recommendation (recommend / borderline /
// do not recommend). Every applicant row carries its own [Approve] [Reject]
// buttons — the participant must decide on each one individually. Only after all
// 8 have a decision does the final [Approve selection] button unlock. The final
// 3 are drawn from the applicants the participant approved (control is real, not
// token). Intended feeling: approval fatigue — you cannot finalize until you
// have personally signed off on every applicant, one by one.

import { CONFIG } from '../config.js';
import { componentScores } from '../scoring.js';
import { applicantScript, finalScript, selectionReason } from '../scripts/reasoning.js';
import { streamLines, StreamRun, makeSkippable } from '../typewriter.js';
import { el, clear, button, applicantCard, terminal, finalResult, conditionBanner } from '../ui.js';

const BANNER = 'The agent evaluates each applicant and posts its recommendation below. '
  + 'Approve or reject every applicant individually — the Approve selection button '
  + 'unlocks only once you have decided on all of them.';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runC1({ container, applicants, logger }) {
  clear(container);
  const t = CONFIG.typing;
  const startMs = Date.now();
  const counts = { approve: 0, reject: 0 };
  const decisions = []; // { applicant, score, components, approved }

  const progress = el('div', { class: 'progress-pill' });
  const { panel, body } = terminal('agent reasoning — evaluating all applicants');
  const list = el('div', { class: 'c1-list' });
  const actionSlot = el('div', { class: 'action-slot' });

  container.appendChild(conditionBanner('C1', BANNER));
  container.appendChild(progress);
  container.appendChild(panel);
  container.appendChild(list);
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

  // --- Stream the agent evaluating each applicant; reveal a review row per one.
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

    // Reveal this applicant's review row with the agent's recommendation and a
    // per-applicant approve/reject decision.
    const decision = { applicant: a, score, components, approved: null };
    decisions.push(decision);
    const { row } = reviewRow(a, verdict, (approved) => {
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
    list.appendChild(row);
    row.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    await sleep(t.autoStepDelayMs);
  }

  // --- All evaluated: post the gating instruction and show the finalize bar. --
  progress.textContent = 'Decide on all applicants to finalize';
  const noteRun = new StreamRun();
  await streamLines(body, [
    '',
    `> all ${applicants.length} applicants evaluated.`,
    '> approve or reject each applicant above.',
    '> the Approve selection button unlocks once all are decided.',
  ], { charDelayMs: t.charDelayMs, lineDelayMs: t.lineDelayMs, run: noteRun });

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

  await showFinal(actionSlot, list, panel, progress, selected, logger, t);

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
  return {
    applicant: d.applicant,
    score: d.score,
    components: d.components || componentScores(d.applicant),
  };
}

/** A single applicant review row: card + recommendation + approve/reject. */
function reviewRow(a, verdict, onDecide) {
  const approveBtn = button('Approve', () => decide(true), 'approve');
  const rejectBtn = button('Reject', () => decide(false), 'reject');
  const status = el('div', { class: 'decision-status' });
  const row = el('div', { class: 'c1-row' }, [
    applicantCard(a),
    el('div', { class: 'c1-row-side' }, [
      recommendationBadge(verdict),
      el('div', { class: 'decision-buttons' }, [approveBtn, rejectBtn]),
      status,
    ]),
  ]);

  function decide(approved) {
    row.classList.add(approved ? 'is-approved' : 'is-rejected');
    setDisabled(approveBtn, true);
    setDisabled(rejectBtn, true);
    status.textContent = approved ? '✓ Approved' : '✕ Rejected';
    onDecide(approved);
  }

  return { row };
}

/** Agent recommendation badge, colored by verdict band (reasoning.js). */
function recommendationBadge(verdict) {
  const cls = verdict.tag === 'STRONG' ? 'rec-strong'
    : verdict.tag === 'CONSIDER' ? 'rec-consider' : 'rec-weak';
  return el('div', { class: `rec-badge ${cls}` }, [
    el('span', { class: 'rec-label', text: 'Agent recommendation' }),
    el('span', { class: 'rec-text', text: verdict.rec }),
  ]);
}

function setDisabled(btn, disabled) {
  btn.disabled = disabled;
  btn.classList.toggle('is-disabled', disabled);
}

async function showFinal(actionSlot, list, panel, progress, selected, logger, t) {
  progress.textContent = 'Compiling final selection…';
  clear(list);
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
  list.appendChild(finalResult(selected, selectionReason));

  await waitContinue(actionSlot);
}

function waitContinue(slot) {
  return new Promise((resolve) => {
    clear(slot);
    slot.appendChild(el('div', { class: 'continue-bar' }, [
      button('Continue', () => resolve(), 'primary'),
    ]));
  });
}
