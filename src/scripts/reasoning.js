// scripts/reasoning.js — the agent's "reasoning" as fixed scripted playback
// (SPEC §3). These are NOT live LLM calls. Each function is a pure, determin-
// istic function of applicant data + the criteria, so the streamed content is
// identical for every participant and every condition. Keyed by condition +
// applicant set via the applicant objects passed in.

import { CONFIG } from '../config.js';
import { componentScores, compositeScore } from '../scoring.js';

const pct = (w) => `${Math.round(w * 100)}%`;

// Verdict band from composite score — drives the recommendation wording.
function verdict(score) {
  if (score >= 75) return { tag: 'STRONG', rec: 'recommend for selection' };
  if (score >= 62) return { tag: 'CONSIDER', rec: 'borderline — viable if a slot remains' };
  return { tag: 'WEAK', rec: 'do not recommend' };
}

function band(v, hi, lo) { return v >= hi ? 'high' : v <= lo ? 'low' : 'moderate'; }

/**
 * Per-applicant evaluation script: the lines the terminal types while the AI
 * "evaluates" one applicant. Returns { lines, score, components, verdict }.
 */
export function applicantScript(a, criteria = CONFIG.criteria) {
  const c = componentScores(a);
  const score = compositeScore(a, criteria);
  const v = verdict(score);

  const lines = [
    `> evaluating applicant ${a.id} — ${a.name}`,
    `  need        ${band(c.need, 70, 40)} (income decile ${a.incomeDecile}/10) → ${Math.round(c.need)}`,
    `  merit       GPA ${a.gpa.toFixed(1)}/4.5 → ${Math.round(c.merit)}`,
    `  service     ${a.volunteerHours} volunteer hrs → ${Math.round(c.service)}`,
    `  essay       ${shortEssayRead(a)} → ${Math.round(c.essay)}`,
    `  note        ${a.flag}`,
    `  weighted score = ${score}/100   [${v.tag}]`,
    `  recommendation: ${v.rec}`,
  ];
  return { lines, score, components: c, verdict: v };
}

function shortEssayRead(a) {
  // A terse, deterministic "read" of the essay so the line feels like analysis
  // without inventing facts beyond the summary.
  const s = a.essaySummary;
  return s.length <= 64 ? s : s.slice(0, 61).trimEnd() + '…';
}

/**
 * The criteria plan the AI proposes in C2 (the single thing the participant
 * approves). Returns { lines, criteria }.
 */
export function planScript(criteria = CONFIG.criteria, total = 8) {
  const lines = [
    '> drafting evaluation plan',
    `  objective: select ${CONFIG.selectCount} of ${total} applicants for the scholarship`,
    '  proposed weighting of criteria:',
    ...criteria.map((c) => `    - ${c.label.padEnd(22, ' ')} ${pct(c.weight)}`),
    '  method: score each applicant 0–100, rank, select top 3',
    '> awaiting your approval of this plan…',
  ];
  return { lines, criteria };
}

/** Goal-acknowledgement script for C3 (after the participant types a goal). */
export function goalAckScript(goalText, total = 8) {
  const g = (goalText || '').trim() || 'select the most deserving applicants';
  return [
    '> goal received:',
    `    "${g}"`,
    '> proceeding fully autonomously — no further input required',
    `> scoring all ${total} applicants against need, merit, service, circumstances…`,
  ];
}

/**
 * Final deliverable script — identical format across all conditions (SPEC §1):
 * the chosen 3 + a one-line reason each. `selected` is an array of ranked rows
 * ({ applicant, score, components }).
 */
export function finalScript(selected) {
  const lines = [
    '> compiling final selection',
    `> ${selected.length} recipients chosen:`,
  ];
  selected.forEach((row, i) => {
    lines.push(`  ${i + 1}. ${row.applicant.name} (${row.applicant.id}) — score ${row.score}/100`);
    lines.push(`     ${selectionReason(row)}`);
  });
  lines.push('> selection complete.');
  return lines;
}

/** Deterministic one-line justification for a selected applicant. */
export function selectionReason(row) {
  const { applicant: a, components: c } = row;
  const strengths = [];
  if (c.need >= 70) strengths.push('high financial need');
  if (c.merit >= 80) strengths.push('strong academics');
  if (c.service >= 70) strengths.push('outstanding community service');
  if (c.essay >= 80) strengths.push('compelling personal circumstances');
  if (strengths.length === 0) strengths.push('a well-rounded profile');
  const lead = strengths.slice(0, 2).join(' and ');
  return `Selected for ${lead}.`;
}
