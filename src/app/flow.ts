/** Ordered steps shown in the progress indicator (design.md UI state machine). */
export const FLOW_STEPS = [
  "draft",
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
}

export const STEP_META: Record<FlowStep, StepMeta> = {
  draft: { label: "Job & photo", heading: "Describe the role and choose a photo" },
  "image-ready": { label: "Preview", heading: "Check your photo" },
  consenting: { label: "Consent", heading: "Review how your photo is used" },
  analyzing: { label: "Analysis", heading: "Analyzing presentation cues" },
  reviewed: { label: "Guidance", heading: "Your presentation guidance" },
  "trying-on": { label: "Try-on", heading: "Preview interview attire" },
  "report-ready": { label: "Report", heading: "Your report is ready" },
  error: { label: "Interrupted", heading: "That step could not be completed" },
};

export function isProgressStep(step: FlowStep): step is ProgressStep {
  return step !== "error";
}

/** Text announced to assistive technology whenever the step changes (R8.2). */
export function describeStep(step: FlowStep): string {
  if (!isProgressStep(step)) return `${STEP_META.error.label}: ${STEP_META.error.heading}`;
  const position = FLOW_STEPS.indexOf(step) + 1;
  return `Step ${position} of ${FLOW_STEPS.length}: ${STEP_META[step].label}`;
}
