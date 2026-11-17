// Reference body profiles (s = 1): cross-section rows of the torso, arms and legs (Limbophobia's realistic adult).
import type { Row } from './rig';

// ------------------------------------------------------------------ profiles (reference body, s = 1)
// a realistic adult (Limbophobia): a ribcage deeper than it is square, shoulders sloping from the neck, a waist
export const TORSO_ROWS: Row[] = [
  { y: 0.815, rx: 0.064, rf: 0.051, rb: 0.059 },
  { y: 0.86, rx: 0.136, rf: 0.077, rb: 0.09 },
  { y: 0.93, rx: 0.148, rf: 0.081, rb: 0.099 },
  { y: 1.0, rx: 0.138, rf: 0.079, rb: 0.087 },
  { y: 1.08, rx: 0.124, rf: 0.078, rb: 0.075 },
  { y: 1.16, rx: 0.129, rf: 0.084, rb: 0.078 },
  { y: 1.25, rx: 0.14, rf: 0.091, rb: 0.084 },
  { y: 1.32, rx: 0.145, rf: 0.09, rb: 0.087, sq: 2.15 },
  { y: 1.37, rx: 0.147, rf: 0.078, rb: 0.081, sq: 2.3 },
  { y: 1.405, rx: 0.13, rf: 0.065, rb: 0.071, sq: 2.25 },
  { y: 1.44, rx: 0.092, rf: 0.057, rb: 0.063, sq: 2.1 },
  { y: 1.475, rx: 0.057, rf: 0.051, rb: 0.053, cz: -0.006 },
];
// arms: a deltoid cap, the upper arm, a bony elbow, the forearm's belly tapering to the wrist
export const ARM_ROWS: Row[] = [
  { y: 0.012, rx: 0.02, rf: 0.026, rb: 0.026 },
  { y: 0.0, rx: 0.031, rf: 0.035, rb: 0.035 },
  { y: -0.02, rx: 0.038, rf: 0.04, rb: 0.04 },
  { y: -0.06, rx: 0.039, rf: 0.04, rb: 0.04 },
  { y: -0.12, rx: 0.036, rf: 0.038, rb: 0.036 },
  { y: -0.2, rx: 0.031, rf: 0.032, rb: 0.033 },
  { y: -0.255, rx: 0.029, rf: 0.029, rb: 0.032 },
  { y: -0.3, rx: 0.029, rf: 0.028, rb: 0.034 },
  { y: -0.345, rx: 0.033, rf: 0.035, rb: 0.031 },
  { y: -0.4, rx: 0.029, rf: 0.031, rb: 0.027 },
  { y: -0.455, rx: 0.022, rf: 0.026, rb: 0.023 },
  { y: -0.5, rx: 0.018, rf: 0.024, rb: 0.022 },
  { y: -0.535, rx: 0.017, rf: 0.024, rb: 0.022 },
];
export const LEG_ROWS: Row[] = [
  { y: 0.055, rx: 0.056, rf: 0.059, rb: 0.063 },
  { y: -0.01, rx: 0.072, rf: 0.073, rb: 0.078 },
  { y: -0.1, rx: 0.067, rf: 0.069, rb: 0.07 },
  { y: -0.22, rx: 0.057, rf: 0.059, rb: 0.057 },
  { y: -0.34, rx: 0.046, rf: 0.049, rb: 0.046 },
  { y: -0.405, rx: 0.042, rf: 0.046, rb: 0.041 },
  { y: -0.445, rx: 0.042, rf: 0.047, rb: 0.04 },
  { y: -0.49, rx: 0.039, rf: 0.041, rb: 0.045 },
  { y: -0.57, rx: 0.041, rf: 0.038, rb: 0.052 },
  { y: -0.67, rx: 0.034, rf: 0.033, rb: 0.04 },
  { y: -0.77, rx: 0.025, rf: 0.027, rb: 0.028 },
  { y: -0.83, rx: 0.023, rf: 0.026, rb: 0.025 },
  { y: -0.865, rx: 0.025, rf: 0.03, rb: 0.029 },
];

