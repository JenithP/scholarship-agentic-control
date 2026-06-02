// config.js — central, tunable constants for the stimulus.
// Pacing values are deliberately exposed here so scripts/pacing can be tuned
// during piloting (SPEC §10.5) without hunting through component code.

export const CONFIG = {
  // Default condition order if the `cond` URL param is absent (dev/demo only;
  // in production Qualtrics always supplies it — SPEC §1).
  defaultConditionOrder: 'C1-C2-C3',

  // Position in the condition order -> applicant set (set rotation, SPEC §5).
  // First condition uses setA, second setB, third setC.
  setRotation: ['setA', 'setB', 'setC'],

  // Number of applicants shown and number to be selected (SPEC §1).
  selectCount: 3,

  // Selection criteria weights. These ARE the plan the participant approves in
  // C2, and the same weights drive the AI's ranking in all three conditions so
  // the recommended set is identical across conditions (internal validity).
  criteria: [
    { key: 'need', label: 'Financial need', weight: 0.35 },
    { key: 'merit', label: 'Academic merit', weight: 0.30 },
    { key: 'service', label: 'Community service', weight: 0.25 },
    { key: 'essay', label: 'Personal circumstances', weight: 0.10 },
  ],

  // Typing animation pacing (ms). Skippable per line via click.
  typing: {
    charDelayMs: 14,       // per-character type speed
    lineDelayMs: 260,      // pause between reasoning lines
    autoStepDelayMs: 650,  // pause between applicants in auto modes (C2/C3)
  },
};

// Qualtrics URL params we read on entry (SPEC §4). Held here so the intake
// step (build order §4) and the logger agree on names.
export const URL_PARAMS = ['PROLIFIC_PID', 'STUDY_ID', 'SESSION_ID', 'cond'];
