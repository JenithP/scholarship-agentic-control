// typewriter.js — terminal-style typed playback of scripted reasoning (SPEC §3).
//
// Streams pre-written lines into a container one character at a time. Designed
// so the *content* is fixed; only the animation is cosmetic. A run can be
// skipped (jump to fully-typed) and cancelled (e.g. C2 "Stop & intervene").

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Controls one streaming run. cancel() stops mid-stream; skip() finishes the
 * current run instantly (still resolves normally).
 */
export class StreamRun {
  constructor() {
    this.cancelled = false;
    this.skipped = false;
  }
  cancel() { this.cancelled = true; }
  skip() { this.skipped = true; }
}

/**
 * Type an array of lines into `container`.
 * @param {HTMLElement} container
 * @param {string[]} lines
 * @param {Object} [opts]
 * @param {number} [opts.charDelayMs]
 * @param {number} [opts.lineDelayMs]
 * @param {StreamRun} [opts.run] external controller for skip/cancel
 * @returns {Promise<{cancelled:boolean}>}
 */
export async function streamLines(container, lines, opts = {}) {
  const {
    charDelayMs = 14,
    lineDelayMs = 260,
    run = new StreamRun(),
  } = opts;

  for (const line of lines) {
    if (run.cancelled) return { cancelled: true };

    const lineEl = document.createElement('div');
    lineEl.className = 'term-line';
    container.appendChild(lineEl);
    container.scrollTop = container.scrollHeight;

    if (run.skipped) {
      lineEl.textContent = line;
    } else {
      for (let i = 0; i < line.length; i++) {
        if (run.cancelled) return { cancelled: true };
        if (run.skipped) { lineEl.textContent = line; break; }
        lineEl.textContent += line[i];
        if (i % 3 === 0) container.scrollTop = container.scrollHeight;
        await sleep(charDelayMs);
      }
    }
    container.scrollTop = container.scrollHeight;
    if (!run.skipped) await sleep(lineDelayMs);
  }
  return { cancelled: run.cancelled };
}

/** Attach a one-click "skip animation" handler to an element. */
export function makeSkippable(el, run) {
  const handler = () => run.skip();
  el.addEventListener('click', handler);
  return () => el.removeEventListener('click', handler);
}
