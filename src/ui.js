// ui.js — small DOM helpers shared by the three condition controllers.
// Keeps rendering consistent (and the archetype field reliably hidden).

/** Tiny hyperscript helper. props.class/.text/.html plus event handlers (onX). */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v != null) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

export function button(label, onClick, variant = 'primary') {
  return el('button', { class: `btn btn-${variant}`, text: label, onClick });
}

/**
 * Applicant card — public fields only (archetype is never rendered, SPEC §5).
 * @param {Object} a applicant
 * @param {Object} [opts] { highlight: boolean }
 */
export function applicantCard(a, opts = {}) {
  const card = el('div', { class: 'applicant-card' + (opts.highlight ? ' is-active' : '') }, [
    el('div', { class: 'applicant-head' }, [
      el('span', { class: 'applicant-name', text: a.name }),
      el('span', { class: 'applicant-id', text: a.id }),
    ]),
    el('div', { class: 'applicant-stats' }, [
      stat('GPA', a.gpa.toFixed(1)),
      stat('Income decile', `${a.incomeDecile}/10`),
      stat('Volunteer hrs', String(a.volunteerHours)),
    ]),
    el('p', { class: 'applicant-essay', text: a.essaySummary }),
    el('p', { class: 'applicant-flag', text: a.flag }),
  ]);
  return card;
}

function stat(label, value) {
  return el('div', { class: 'stat' }, [
    el('span', { class: 'stat-label', text: label }),
    el('span', { class: 'stat-value', text: value }),
  ]);
}

/** A terminal-style panel for streamed reasoning. Returns { panel, body }. */
export function terminal(title = 'agent reasoning') {
  const body = el('div', { class: 'term-body' });
  const panel = el('div', { class: 'terminal' }, [
    el('div', { class: 'term-bar' }, [
      el('span', { class: 'term-dot' }), el('span', { class: 'term-dot' }),
      el('span', { class: 'term-dot' }),
      el('span', { class: 'term-title', text: title }),
    ]),
    body,
  ]);
  return { panel, body };
}

/**
 * Final deliverable panel — identical layout across all three conditions
 * (SPEC §1). `selected` is an array of ranked rows; `reasonFn(row)->string`.
 */
export function finalResult(selected, reasonFn) {
  return el('div', { class: 'final-result' }, [
    el('h2', { class: 'final-title', text: 'Final selection — 3 recipients' }),
    el('ol', { class: 'final-list' }, selected.map((row) =>
      el('li', { class: 'final-item' }, [
        el('div', { class: 'final-item-head' }, [
          el('span', { class: 'final-item-name', text: row.applicant.name }),
          el('span', { class: 'final-item-score', text: `${row.score}/100` }),
        ]),
        el('p', { class: 'final-item-reason', text: reasonFn(row) }),
      ])
    )),
  ]);
}

/** Condition framing banner shown before each run. */
export function conditionBanner(label, blurb) {
  return el('div', { class: 'cond-banner' }, [
    el('span', { class: 'cond-badge', text: label }),
    el('p', { class: 'cond-blurb', text: blurb }),
  ]);
}
