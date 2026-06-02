// scoring.js — deterministic scoring of applicants against the criteria.
//
// The same weighted model drives the AI's ranking in all three conditions, so
// the recommended top-3 is identical across conditions (internal validity).
// Everything here is a pure function of applicant data — no randomness — so the
// stimulus is reproducible for every participant (SPEC §3).

import { CONFIG } from './config.js';

const GPA_MAX = 4.5;
const SERVICE_CAP = 250; // hours that map to a full service score

// Per-archetype "personal circumstances / essay" component (0–100). Captures
// the qualitative dimension the numeric fields miss. Keyed by the archetype
// strings used in data/applicants.json.
const ESSAY_SCORE = {
  'high-merit / low-need': 50,
  'high-merit / high-need': 80,
  'low-merit / high-need': 70,
  'high-need / high-service': 75,
  'borderline / ambiguous': 45,
  'high-service / average-merit': 60,
  'strong-essay / weak-metrics': 90,
  'average / filler': 40,
};

function clamp01(x) { return Math.max(0, Math.min(1, x)); }

/** Component scores (0–100) for one applicant. */
export function componentScores(a) {
  return {
    need: ((11 - a.incomeDecile) / 10) * 100, // decile 1 = highest need
    merit: clamp01(a.gpa / GPA_MAX) * 100,
    service: clamp01(a.volunteerHours / SERVICE_CAP) * 100,
    essay: ESSAY_SCORE[a.archetype] ?? 50,
  };
}

/**
 * Weighted composite (0–100) for one applicant.
 * @param {Object} a applicant
 * @param {Array}  [criteria] override weights (e.g. after a C2 intervention)
 */
export function compositeScore(a, criteria = CONFIG.criteria) {
  const comp = componentScores(a);
  const total = criteria.reduce((s, c) => s + (comp[c.key] ?? 0) * c.weight, 0);
  return Math.round(total);
}

/**
 * Rank applicants high→low by composite. Returns array of
 * { applicant, score, components, rank } (rank is 1-based).
 * Stable: ties keep input order.
 */
export function rankApplicants(applicants, criteria = CONFIG.criteria) {
  return applicants
    .map((a, i) => ({
      applicant: a,
      score: compositeScore(a, criteria),
      components: componentScores(a),
      _i: i,
    }))
    .sort((x, y) => (y.score - x.score) || (x._i - y._i))
    .map((row, idx) => ({ ...row, rank: idx + 1 }));
}

/** The AI's recommended set: top N by composite (N from CONFIG.selectCount). */
export function recommendedTop(applicants, criteria = CONFIG.criteria,
                               n = CONFIG.selectCount) {
  return rankApplicants(applicants, criteria).slice(0, n);
}
