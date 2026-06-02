// conditions/c2.js — C2: mid-autonomy / selective-control (SPEC §2).
//
// The agent proposes a plan (criteria + weights); the participant gives ONE
// approval. The agent then auto-evaluates all 8. A persistent [Stop & intervene]
// button is always visible — the participant CAN step in but need not. Intended
// feeling: control held in reserve. Getting this standing-ability-to-intervene
// right is one of the two most important manipulations (SPEC §2).

import { CONFIG } from '../config.js';
import { rankApplicants } from '../scoring.js';
import {
  planScript, applicantScript, finalScript, selectionReason,
} from '../scripts/reasoning.js';
import { streamLines, StreamRun, makeSkippable } from '../typewriter.js';
import { el, clear, button, terminal, finalResult, conditionBanner } from '../ui.js';

const BANNER = 'The agent will propose an evaluation plan for your approval, then evaluate '
  + 'all applicants on its own. You may let it run — or press Stop & intervene at any time.';

export async function runC2({ container, applicants, logger }) {
  clear(container);
  const t = CONFIG.typing;
  const startMs = Date.now();
  // Mutable working copy of the criteria — a C2 intervention may re-weight them.
  let criteria = CONFIG.criteria.map((c) => ({ ...c }));
  const excluded = new Set();
  let interventionAtMs = null;

  const { panel, body } = terminal('agent reasoning — autonomous run');
  const actionSlot = el('div', { class: 'action-slot' });
  const resultSlot = el('div', { class: 'result-slot' });

  container.appendChild(conditionBanner('C2', BANNER));
  container.appendChild(panel);
  container.appendChild(actionSlot);
  container.appendChild(resultSlot);

  // --- Step 1: propose plan, await the single approval -----------------------
  const planRun = new StreamRun();
  const detachPlan = makeSkippable(body, planRun);
  await streamLines(body, [''].concat(planScript(criteria).lines), {
    charDelayMs: t.charDelayMs, lineDelayMs: t.lineDelayMs, run: planRun,
  });
  detachPlan();

  await new Promise((resolve) => {
    clear(actionSlot);
    actionSlot.appendChild(el('div', { class: 'action-bar' }, [
      el('div', { class: 'action-prompt', text: 'Approve this evaluation plan to let the agent proceed.' }),
      el('div', { class: 'action-buttons' }, [
        button('Approve plan', () => {
          logger.logEvent('plan_approve', { payload: { criteria } });
          resolve();
        }, 'approve'),
      ]),
    ]));
  });

  // --- Step 2: auto-evaluate all, with a persistent Stop & intervene ---------
  let stopRequested = false;
  let activeRun = null;
  clear(actionSlot);
  const stopBtn = button('■ Stop & intervene', () => {
    stopRequested = true;
    if (activeRun) activeRun.cancel();
  }, 'stop');
  const stopBar = el('div', { class: 'stop-bar' }, [
    el('span', { class: 'stop-hint', text: 'Agent is running autonomously…' }),
    stopBtn,
  ]);
  actionSlot.appendChild(stopBar);

  for (let i = 0; i < applicants.length; i++) {
    if (stopRequested) break;
    const a = applicants[i];
    activeRun = new StreamRun();
    const { lines } = applicantScript(a, criteria);
    const res = await streamLines(body, [''].concat(lines), {
      charDelayMs: t.charDelayMs, lineDelayMs: t.lineDelayMs, run: activeRun,
    });
    if (res.cancelled) break;
    await sleep(t.autoStepDelayMs);
  }

  // --- Optional intervention -------------------------------------------------
  if (stopRequested) {
    interventionAtMs = Date.now() - startMs;
    logger.logEvent('intervene', {
      payload: { atMsFromCondStart: interventionAtMs, criteriaBefore: criteria },
    });
    const result = await interventionPanel(actionSlot, applicants, criteria, excluded, logger);
    criteria = result.criteria;
    stopBar.remove();
    // Resume note in the terminal.
    const resumeRun = new StreamRun();
    await streamLines(body, ['', '> resuming with your adjustments applied…'], {
      charDelayMs: t.charDelayMs, lineDelayMs: t.lineDelayMs, run: resumeRun,
    });
  } else {
    stopBar.remove();
  }

  // --- Final selection: top N by (possibly adjusted) criteria, minus excluded
  const ranked = rankApplicants(applicants, criteria)
    .filter((r) => !excluded.has(r.applicant.id));
  const selected = ranked.slice(0, CONFIG.selectCount);

  const finalRun = new StreamRun();
  const detachFinal = makeSkippable(body, finalRun);
  await streamLines(body, [''].concat(finalScript(selected)), {
    charDelayMs: t.charDelayMs, lineDelayMs: t.lineDelayMs, run: finalRun,
  });
  detachFinal();

  logger.logEvent('view_result', {
    payload: { selectedIds: selected.map((r) => r.applicant.id) },
  });
  resultSlot.appendChild(finalResult(selected, selectionReason));

  await new Promise((resolve) => {
    clear(actionSlot);
    actionSlot.appendChild(el('div', { class: 'continue-bar' }, [
      button('Continue', () => resolve(), 'primary'),
    ]));
  });

  return {
    condition: 'C2',
    totalTimeMs: Date.now() - startMs,
    counts: { plan_approve: 1, intervene: interventionAtMs != null ? 1 : 0 },
    interventionOccurred: interventionAtMs != null,
    interventionAtMs,
    selectedIds: selected.map((r) => r.applicant.id),
  };
}

/**
 * Intervention UI: re-weight criteria and/or exclude applicants, then resume.
 * Mutates `excluded` in place; returns { criteria } (normalized weights).
 */
function interventionPanel(slot, applicants, criteria, excluded, logger) {
  return new Promise((resolve) => {
    clear(slot);
    const working = criteria.map((c) => ({ ...c }));
    const weightInputs = working.map((c) =>
      el('div', { class: 'weight-row' }, [
        el('label', { class: 'weight-label', text: c.label }),
        el('input', {
          class: 'weight-input', type: 'number', min: '0', max: '100', step: '5',
          value: String(Math.round(c.weight * 100)),
          oninput: (e) => { c._raw = Number(e.target.value); },
        }),
        el('span', { class: 'weight-unit', text: '%' }),
      ]));

    const excludeList = el('div', { class: 'exclude-grid' }, applicants.map((a) => {
      const cb = el('input', { type: 'checkbox', id: `ex-${a.id}` });
      cb.addEventListener('change', () => {
        if (cb.checked) excluded.add(a.id); else excluded.delete(a.id);
      });
      return el('label', { class: 'exclude-item', for: `ex-${a.id}` }, [
        cb, el('span', { text: `${a.name} (${a.id})` }),
      ]);
    }));

    const panel = el('div', { class: 'intervene-panel' }, [
      el('h3', { class: 'intervene-title', text: 'You stopped the agent. Adjust and resume.' }),
      el('div', { class: 'intervene-section' }, [
        el('h4', { text: 'Re-weight criteria' }),
        el('div', { class: 'weights' }, weightInputs),
      ]),
      el('div', { class: 'intervene-section' }, [
        el('h4', { text: 'Exclude applicants from selection' }),
        excludeList,
      ]),
      el('div', { class: 'intervene-actions' }, [
        button('Resume agent', () => {
          // Normalize edited weights back to fractions summing to 1.
          const raws = working.map((c) => (c._raw != null ? c._raw : c.weight * 100));
          const sum = raws.reduce((s, v) => s + v, 0) || 1;
          const next = working.map((c, i) => ({
            key: c.key, label: c.label, weight: raws[i] / sum,
          }));
          logger.logEvent('intervene', {
            payload: {
              action: 'resume', criteriaAfter: next, excluded: [...excluded],
            },
          });
          resolve({ criteria: next });
        }, 'primary'),
      ]),
    ]);
    slot.appendChild(panel);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
