// logger.js — logging behind a single interface (SPEC §6, §8).
//
// MVP ships ConsoleLogger only. A FirestoreLogger implementing the same
// interface is added before live data collection (build order §3); swapping it
// in must require no changes to condition/app code — so all event creation
// goes through this module.

/**
 * @typedef {Object} EventContext
 * Fields shared by every event in a session, set once via Logger#setContext.
 * @property {string} prolificPid
 * @property {string} studyId
 * @property {string} sessionId
 * @property {string} conditionOrder   e.g. "C2-C1-C3"
 */

/** Abstract logger interface. Implementations: ConsoleLogger, FirestoreLogger. */
export class Logger {
  /** @param {EventContext} ctx */
  setContext(ctx) { this.ctx = ctx; }

  /** Mark when the current condition started, for elapsedMsFromCondStart. */
  startCondition(/* condition, applicantSet */) {}

  /**
   * Record one behavioral event (SPEC §6).
   * @param {string} eventType
   * @param {Object} [fields] - { condition, applicantSet, targetApplicantId, payload }
   */
  logEvent(/* eventType, fields */) {}

  /** Record the per-condition summary doc (SPEC §6). */
  logSummary(/* summary */) {}
}

/**
 * ConsoleLogger — console output + in-memory buffer + downloadable JSON.
 * Sufficient to build and fully demo the MVP without Firebase (SPEC §8).
 */
export class ConsoleLogger extends Logger {
  constructor() {
    super();
    this.ctx = null;
    this.events = [];
    this.summaries = [];
    this._condStartMs = null;
    this._condition = null;
    this._applicantSet = null;
  }

  // Monotonic-ish timestamp. Real wall-clock here; FirestoreLogger will use
  // serverTimestamp() for the authoritative time.
  _now() { return Date.now(); }

  startCondition(condition, applicantSet) {
    this._condition = condition;
    this._applicantSet = applicantSet;
    this._condStartMs = this._now();
  }

  logEvent(eventType, fields = {}) {
    const c = this.ctx || {};
    const condition = fields.condition ?? this._condition;
    const applicantSet = fields.applicantSet ?? this._applicantSet;
    const doc = {
      prolificPid: c.prolificPid ?? null,
      studyId: c.studyId ?? null,
      sessionId: c.sessionId ?? null,
      conditionOrder: c.conditionOrder ?? null,
      condition: condition ?? null,
      applicantSet: applicantSet ?? null,
      eventType,
      targetApplicantId: fields.targetApplicantId ?? null,
      timestamp: this._now(),
      elapsedMsFromCondStart:
        this._condStartMs == null ? null : this._now() - this._condStartMs,
      payload: fields.payload ?? null,
    };
    this.events.push(doc);
    // eslint-disable-next-line no-console
    console.log('%c[event]', 'color:#3b82f6', doc.eventType, doc);
    return doc;
  }

  logSummary(summary) {
    const c = this.ctx || {};
    const doc = {
      prolificPid: c.prolificPid ?? null,
      studyId: c.studyId ?? null,
      sessionId: c.sessionId ?? null,
      conditionOrder: c.conditionOrder ?? null,
      ...summary,
      timestamp: this._now(),
    };
    this.summaries.push(doc);
    // eslint-disable-next-line no-console
    console.log('%c[summary]', 'color:#16a34a', doc.condition, doc);
    return doc;
  }

  /** Full dump for inspection / download. */
  dump() {
    return {
      context: this.ctx,
      events: this.events,
      summaries: this.summaries,
      exportedAt: new Date().toISOString(),
    };
  }

  /** Trigger a browser download of the session log as JSON (dev convenience). */
  download() {
    const data = JSON.stringify(this.dump(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const sid = this.ctx?.sessionId || 'local';
    a.href = url;
    a.download = `session-log-${sid}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
