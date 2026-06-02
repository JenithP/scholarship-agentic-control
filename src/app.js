// app.js — application controller: screen flow + orchestration (SPEC §4).
//
// Flow: Entry (read URL params) → Intro → 3 condition runs (order from `cond`)
// → End. Surveys live in Qualtrics, not here (SPEC §4). MVP shows a completion
// code at the end; the Qualtrics redirect is added in build order §4.

import { CONFIG, URL_PARAMS } from './config.js';
import { ConsoleLogger } from './logger.js';
import { getSet } from './data.js';
import { el, clear, button } from './ui.js';
import { runC1 } from './conditions/c1.js';
import { runC2 } from './conditions/c2.js';
import { runC3 } from './conditions/c3.js';

const RUNNERS = { C1: runC1, C2: runC2, C3: runC3 };

const CONDITION_INTRO = {
  C1: 'In this round you review the agent step by step.',
  C2: 'In this round you approve a plan, then oversee the agent.',
  C3: 'In this round you hand the task to the agent.',
};

export function start() {
  const root = document.getElementById('app');
  const params = readParams();
  const conditionOrder = parseOrder(params.cond);

  const logger = new ConsoleLogger();
  logger.setContext({
    prolificPid: params.PROLIFIC_PID,
    studyId: params.STUDY_ID,
    sessionId: params.SESSION_ID,
    conditionOrder: conditionOrder.join('-'),
  });
  // Expose for dev inspection / log download from the console or End screen.
  window.__logger = logger;

  const app = new App(root, logger, conditionOrder);
  app.showIntro();
}

class App {
  constructor(root, logger, order) {
    this.root = root;
    this.logger = logger;
    this.order = order;
    this.blurCount = 0;     // reset per condition
    this.tracking = false;  // only count blur during a condition run
    this._installVisibility();
  }

  _installVisibility() {
    const onBlur = () => {
      if (!this.tracking) return;
      this.blurCount += 1;
      this.logger.logEvent('page_blur', { payload: { blurCount: this.blurCount } });
    };
    const onFocus = () => {
      if (!this.tracking) return;
      this.logger.logEvent('page_focus');
    };
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', () => {
      (document.hidden ? onBlur : onFocus)();
    });
  }

  _screen(className) {
    clear(this.root);
    const screen = el('div', { class: `screen ${className}` });
    this.root.appendChild(screen);
    return screen;
  }

  showIntro() {
    const s = this._screen('intro-screen');
    s.appendChild(el('div', { class: 'intro-card' }, [
      el('h1', { class: 'intro-title', text: 'Scholarship Selection Committee' }),
      el('p', { class: 'intro-lead', text:
        'You are a scholarship committee officer. For each round, an AI agent will help '
        + 'evaluate 8 applicants and select 3 recipients. Your role and the agent’s '
        + 'autonomy change from round to round.' }),
      el('ul', { class: 'intro-points' }, [
        el('li', { text: 'There are 3 rounds. Each uses a different group of 8 applicants.' }),
        el('li', { text: 'Read the agent’s reasoning as it streams, and act when prompted.' }),
        el('li', { text: 'There are no right answers — we are interested in your experience.' }),
      ]),
      el('p', { class: 'intro-meta', text: `Condition order: ${this.order.join(' → ')}` }),
      el('div', { class: 'continue-bar' }, [
        button('Begin', () => this.runConditions(), 'primary'),
      ]),
    ]));
  }

  async runConditions() {
    for (let i = 0; i < this.order.length; i++) {
      const condition = this.order[i];
      const applicantSet = CONFIG.setRotation[i] || CONFIG.setRotation[0];
      await this.runOne(i, condition, applicantSet);
    }
    this.showEnd();
  }

  async runOne(index, condition, applicantSet) {
    await this.showRoundFraming(index, condition);

    const applicants = await getSet(applicantSet);
    const runner = RUNNERS[condition];

    // Reset per-condition blur counter and begin tracking + timing.
    this.blurCount = 0;
    this.tracking = true;
    this.logger.startCondition(condition, applicantSet);
    this.logger.logEvent('start', { payload: { roundIndex: index, applicantSet } });

    const container = this._screen(`run-screen cond-${condition.toLowerCase()}`);
    const summary = await runner({ container, applicants, applicantSet, condition, logger: this.logger });

    this.tracking = false;
    this.logger.logEvent('complete', { payload: { roundIndex: index } });
    this.logger.logSummary({
      condition,
      applicantSet,
      roundIndex: index,
      ...summary,
      blurCount: this.blurCount,
    });
  }

  showRoundFraming(index, condition) {
    return new Promise((resolve) => {
      const s = this._screen('framing-screen');
      s.appendChild(el('div', { class: 'framing-card' }, [
        el('span', { class: 'framing-round', text: `Round ${index + 1} of ${this.order.length}` }),
        el('span', { class: `cond-badge cond-badge-${condition.toLowerCase()}`, text: condition }),
        el('p', { class: 'framing-text', text: CONDITION_INTRO[condition] }),
        el('div', { class: 'continue-bar' }, [
          button('Start round', () => resolve(), 'primary'),
        ]),
      ]));
    });
  }

  showEnd() {
    this.tracking = false;
    const s = this._screen('end-screen');
    const code = completionCode(this.logger.ctx);
    s.appendChild(el('div', { class: 'end-card' }, [
      el('h1', { class: 'end-title', text: 'All rounds complete' }),
      el('p', { class: 'end-lead', text:
        'Thank you. Please return to the survey to continue. (In the live study this page '
        + 'redirects to Qualtrics automatically — see build order §4.)' }),
      el('div', { class: 'end-code' }, [
        el('span', { class: 'end-code-label', text: 'Completion code' }),
        el('span', { class: 'end-code-value', text: code }),
      ]),
      el('div', { class: 'end-actions' }, [
        button('Download session log (JSON)', () => this.logger.download(), 'ghost'),
      ]),
    ]));
    this.logger.logEvent('complete', { payload: { phase: 'session_end', completionCode: code } });
  }
}

// --- URL params (SPEC §4) ---------------------------------------------------
function readParams() {
  const q = new URLSearchParams(window.location.search);
  const out = {};
  for (const key of URL_PARAMS) out[key] = q.get(key);
  // Dev/demo defaults so the stimulus is fully playable without Qualtrics.
  if (!out.cond) out.cond = CONFIG.defaultConditionOrder;
  if (!out.SESSION_ID) out.SESSION_ID = `local-${Date.now()}`;
  if (!out.PROLIFIC_PID) out.PROLIFIC_PID = 'LOCAL_DEV';
  if (!out.STUDY_ID) out.STUDY_ID = 'LOCAL_STUDY';
  return out;
}

/** Parse "C2-C1-C3" → ["C2","C1","C3"]; fall back to default on bad input. */
function parseOrder(cond) {
  const valid = new Set(['C1', 'C2', 'C3']);
  const parts = String(cond || '').toUpperCase().split('-').map((s) => s.trim());
  const ok = parts.length === 3 && parts.every((p) => valid.has(p))
    && new Set(parts).size === 3;
  return ok ? parts : CONFIG.defaultConditionOrder.split('-');
}

function completionCode(ctx) {
  const sid = (ctx?.sessionId || 'LOCAL').replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase();
  return `SCH-${sid || 'XXXXXX'}`;
}
