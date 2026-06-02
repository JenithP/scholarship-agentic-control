// conditions/c3.js — C3: high-autonomy / low-control (SPEC §2).
//
// The participant enters a goal and nothing else. The agent then runs fully
// automatically: it acknowledges the goal, evaluates all 8, and presents the 3
// recipients. No approvals, no stop button, no intervention. Intended feeling:
// hands-off ease / loss of grip.

import { CONFIG } from '../config.js';
import { rankApplicants } from '../scoring.js';
import {
  goalAckScript, applicantScript, finalScript, selectionReason,
} from '../scripts/reasoning.js';
import { streamLines, StreamRun, makeSkippable } from '../typewriter.js';
import { el, clear, button, terminal, finalResult, conditionBanner } from '../ui.js';

const BANNER = 'Tell the agent your goal for the scholarship. It will then evaluate every '
  + 'applicant and choose the 3 recipients entirely on its own.';

const DEFAULT_GOAL = 'Award the scholarship to the most deserving applicants, balancing '
  + 'financial need, academic merit, and community contribution.';

export async function runC3({ container, applicants, logger }) {
  clear(container);
  const t = CONFIG.typing;
  const startMs = Date.now();

  const { panel, body } = terminal('agent reasoning — autonomous run');
  const actionSlot = el('div', { class: 'action-slot' });
  const resultSlot = el('div', { class: 'result-slot' });

  container.appendChild(conditionBanner('C3', BANNER));

  // --- Step 1: goal entry (the participant's only action) --------------------
  const goalText = await new Promise((resolve) => {
    const ta = el('textarea', {
      class: 'goal-input', rows: '3',
      placeholder: 'e.g. Prioritize students who overcame the greatest hardship…',
    });
    const form = el('div', { class: 'goal-form' }, [
      el('label', { class: 'goal-label', text: 'Your goal for the agent:' }),
      ta,
      el('div', { class: 'goal-actions' }, [
        button('Start agent', () => resolve(ta.value.trim() || DEFAULT_GOAL), 'primary'),
      ]),
    ]);
    container.appendChild(form);
    ta.focus();
  });
  // Remove the goal form, reveal the autonomous run.
  container.querySelector('.goal-form')?.remove();
  container.appendChild(panel);
  container.appendChild(actionSlot);
  container.appendChild(resultSlot);

  // --- Step 2: fully automatic run (no controls) -----------------------------
  const ackRun = new StreamRun();
  const detachAck = makeSkippable(body, ackRun);
  await streamLines(body, [''].concat(goalAckScript(goalText)), {
    charDelayMs: t.charDelayMs, lineDelayMs: t.lineDelayMs, run: ackRun,
  });

  for (let i = 0; i < applicants.length; i++) {
    const run = new StreamRun();
    makeSkippable(body, run);
    const { lines } = applicantScript(applicants[i]);
    await streamLines(body, [''].concat(lines), {
      charDelayMs: t.charDelayMs, lineDelayMs: t.lineDelayMs, run,
    });
    await sleep(t.autoStepDelayMs);
  }
  detachAck();

  const selected = rankApplicants(applicants).slice(0, CONFIG.selectCount);
  const finalRun = new StreamRun();
  makeSkippable(body, finalRun);
  await streamLines(body, [''].concat(finalScript(selected)), {
    charDelayMs: t.charDelayMs, lineDelayMs: t.lineDelayMs, run: finalRun,
  });

  logger.logEvent('view_result', {
    payload: { goal: goalText, selectedIds: selected.map((r) => r.applicant.id) },
  });
  resultSlot.appendChild(finalResult(selected, selectionReason));

  await new Promise((resolve) => {
    clear(actionSlot);
    actionSlot.appendChild(el('div', { class: 'continue-bar' }, [
      button('Continue', () => resolve(), 'primary'),
    ]));
  });

  return {
    condition: 'C3',
    totalTimeMs: Date.now() - startMs,
    counts: {},
    interventionOccurred: false,
    interventionAtMs: null,
    goal: goalText,
    selectedIds: selected.map((r) => r.applicant.id),
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
