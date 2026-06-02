// conditions/c1.js — C1: low-autonomy / high-control (SPEC §2).
//
// The agent evaluates ONE applicant at a time and pauses on each. Every step
// the participant must act: [Approve] [Reject] [Edit score]. They decide all 8
// individually. Intended feeling: approval fatigue. The final 3 are drawn from
// the applicants the participant approved (so the control is real, not token).

import { CONFIG } from '../config.js';
import { componentScores } from '../scoring.js';
import { applicantScript, finalScript, selectionReason } from '../scripts/reasoning.js';
import { streamLines, StreamRun, makeSkippable } from '../typewriter.js';
import { el, clear, button, applicantCard, terminal, finalResult, conditionBanner } from '../ui.js';

const BANNER = 'The agent will evaluate each applicant one at a time and stop for your '
  + 'decision. You approve, reject, or adjust its score for every applicant.';

export async function runC1({ container, applicants, logger }) {
  clear(container);
  const t = CONFIG.typing;
  const counts = { approve: 0, reject: 0, edit_score: 0 };
  const decisions = []; // { applicant, score, approved }
  const startMs = Date.now();

  const progress = el('div', { class: 'progress-pill' });
  const cardSlot = el('div', { class: 'card-slot' });
  const { panel, body } = terminal('agent reasoning — step-by-step');
  const actionSlot = el('div', { class: 'action-slot' });

  container.appendChild(conditionBanner('C1', BANNER));
  container.appendChild(progress);
  container.appendChild(el('div', { class: 'run-grid' }, [cardSlot, panel]));
  container.appendChild(actionSlot);

  for (let i = 0; i < applicants.length; i++) {
    const a = applicants[i];
    progress.textContent = `Applicant ${i + 1} of ${applicants.length}`;
    clear(cardSlot);
    cardSlot.appendChild(applicantCard(a, { highlight: true }));

    const { lines, score } = applicantScript(a);
    const run = new StreamRun();
    const detach = makeSkippable(body, run);
    await streamLines(body, [''].concat(lines), {
      charDelayMs: t.charDelayMs, lineDelayMs: t.lineDelayMs, run,
    });
    detach();

    const decision = await askDecision(actionSlot, a, score, logger);
    counts[decision.action] = (counts[decision.action] || 0) + 1;
    decisions.push({
      applicant: a,
      score: decision.score,
      approved: decision.approved,
    });
  }

  // Final selection: top N among approved; backfill by score if too few approved
  // so the deliverable always has 3 (SPEC §1).
  const approved = decisions.filter((d) => d.approved);
  const pool = (approved.length >= CONFIG.selectCount ? approved : decisions)
    .slice()
    .sort((x, y) => y.score - x.score);
  const selected = pool.slice(0, CONFIG.selectCount).map(toRow);

  await showFinal(container, cardSlot, panel, actionSlot, progress, selected, logger, t);

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
    components: componentScores(d.applicant),
  };
}

/** Render the per-applicant action bar; resolve when the participant acts. */
function askDecision(slot, applicant, aiScore, logger) {
  return new Promise((resolve) => {
    clear(slot);

    const finish = (action, score, approved) => {
      logger.logEvent(action, {
        targetApplicantId: applicant.id,
        payload: { aiScore, finalScore: score, approved },
      });
      resolve({ action, score, approved });
    };

    const editPanel = el('div', { class: 'edit-panel hidden' });
    const input = el('input', {
      class: 'score-input', type: 'number', min: '0', max: '100',
      value: String(aiScore),
    });
    editPanel.appendChild(el('label', { class: 'edit-label', text: 'Override score (0–100):' }));
    editPanel.appendChild(input);
    editPanel.appendChild(button('Save & approve', () => {
      let v = Math.round(Number(input.value));
      if (!Number.isFinite(v)) v = aiScore;
      v = Math.max(0, Math.min(100, v));
      finish('edit_score', v, true);
    }, 'primary'));

    const bar = el('div', { class: 'action-bar' }, [
      el('div', { class: 'action-prompt', text:
        `The agent recommends a score of ${aiScore}/100 for ${applicant.name}. Your decision:` }),
      el('div', { class: 'action-buttons' }, [
        button('Approve', () => finish('approve', aiScore, true), 'approve'),
        button('Reject', () => finish('reject', aiScore, false), 'reject'),
        button('Edit score', () => {
          editPanel.classList.remove('hidden');
          input.focus(); input.select();
        }, 'ghost'),
      ]),
      editPanel,
    ]);
    slot.appendChild(bar);
  });
}

async function showFinal(container, cardSlot, panel, actionSlot, progress, selected, logger, t) {
  progress.textContent = 'Compiling final selection…';
  clear(cardSlot);
  const { panel: fp, body } = terminal('agent reasoning — final');
  panel.replaceWith(fp);
  clear(actionSlot);

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
  cardSlot.appendChild(finalResult(selected, selectionReason));

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
