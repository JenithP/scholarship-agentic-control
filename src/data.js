// data.js — load and expose applicant sets (SPEC §5).

let _cache = null;

/** Fetch applicants.json once. Returns the parsed object (with setA/B/C). */
export async function loadApplicants() {
  if (_cache) return _cache;
  const res = await fetch('./data/applicants.json');
  if (!res.ok) throw new Error(`Failed to load applicants.json (${res.status})`);
  _cache = await res.json();
  return _cache;
}

/** Get the applicants for a given set key ("setA" | "setB" | "setC"). */
export async function getSet(setKey) {
  const all = await loadApplicants();
  const set = all[setKey];
  if (!Array.isArray(set)) throw new Error(`Unknown applicant set: ${setKey}`);
  return set;
}

// Fields safe to show participants. `archetype` is an internal balancing label
// and must NEVER be displayed (SPEC §5).
export const PUBLIC_FIELDS = [
  'id', 'name', 'gpa', 'incomeDecile', 'volunteerHours', 'essaySummary', 'flag',
];
