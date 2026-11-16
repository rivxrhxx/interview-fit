import { en } from "../lib/i18n/messages/en";
import type { Messages } from "../lib/i18n";

/** Ordered steps shown in the progress indicator (design.md UI state machine). */
export const FLOW_STEPS = [
  "draft",
  "job-reviewed",
  "image-ready",
  "consenting",
  "analyzing",
  "reviewed",
  "trying-on",
  "report-ready",
] as const;

export type ProgressStep = (typeof FLOW_STEPS)[number];
export type FlowStep = ProgressStep | "error";

export interface StepMeta {
  /** Short label used in the progress indicator and status announcements. */
  label: string;
  /** Page heading that receives focus when the step becomes active. */
  heading: string;
  /** One supporting sentence under the heading. */
  description: string;
}

/** English step copy (the default locale). Localized copy comes from `useI18n().m.steps`. */
export const STEP_META: Record<FlowStep, StepMeta> = en.steps;

export function isProgressStep(step: FlowStep): step is ProgressStep {
  return step !== "error";
}

/** Text announced to assistive technology whenever the step changes (R8.2). */
export function describeStep(step: FlowStep, m: Messages = en): string {
  if (!isProgressStep(step)) return m.shell.interrupted(m.steps.error.label, m.steps.error.heading);
  return m.shell.describe(FLOW_STEPS.indexOf(step) + 1, FLOW_STEPS.length, m.steps[step].label);
}
