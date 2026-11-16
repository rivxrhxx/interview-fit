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
  /** One supporting sentence under the heading. */
  description: string;
}

export const STEP_META: Record<FlowStep, StepMeta> = {
  draft: {
    label: "Job & photo",
    heading: "Describe the role and choose a photo",
    description: "Suggestions are tailored to the posting, always optional, and never judge how you look.",
  },
  "image-ready": {
    label: "Preview",
    heading: "Check your photo",
    description: "This copy was re-encoded on your device without location or camera details.",
  },
  consenting: {
    label: "Consent",
    heading: "Review how your photo is used",
    description: "Nothing leaves your device until you agree below.",
  },
  analyzing: {
    label: "Analysis",
    heading: "Analyzing presentation cues",
    description: "This usually takes a few seconds.",
  },
  reviewed: {
    label: "Guidance",
    heading: "Your presentation guidance",
    description: "Optional suggestions based on your photo and the job description.",
  },
  "trying-on": {
    label: "Try-on",
    heading: "Preview interview attire",
    description: "One curated style, shown next to your original photo.",
  },
  "report-ready": {
    label: "Report",
    heading: "Your report is ready",
    description: "A text-only summary you can keep for your preparation.",
  },
  error: {
    label: "Interrupted",
    heading: "That step could not be completed",
    description: "Nothing was saved. Choose how you'd like to continue.",
  },
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
