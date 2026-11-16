import type { ApiError } from "./errors.ts";

/** Opaque Interview Fit identifiers. They never embed provider task or file IDs. */
export type AnalysisJobId = string & { readonly __brand: "AnalysisJobId" };
export type TryOnJobId = string & { readonly __brand: "TryOnJobId" };

export const ANALYSIS_JOB_ID_PATTERN = /^an_[A-Za-z0-9]{20,40}$/;
export const TRY_ON_JOB_ID_PATTERN = /^to_[A-Za-z0-9]{20,40}$/;

export const JOB_STATES = ["queued", "processing", "succeeded", "failed", "cancelled"] as const;
export type JobState = (typeof JOB_STATES)[number];

export const TERMINAL_JOB_STATES: readonly JobState[] = ["succeeded", "failed", "cancelled"];

/** Neutral capture-context categories. Appearance scoring categories do not exist by design (R5.3). */
export const OBSERVATION_CATEGORIES = ["lighting", "framing", "background", "image-clarity", "attire"] as const;
export type ObservationCategory = (typeof OBSERVATION_CATEGORIES)[number];

/** A job-context cue backed by an excerpt from the job description (R5.1). */
export interface JobCue {
  id: string;
  label: string;
  evidence: string;
}

export interface JobContext {
  summary: string;
  cues: JobCue[];
}

/** Whether an observation is already fine or worth an optional adjustment. Never a score. */
export const OBSERVATION_ASSESSMENTS = ["ok", "adjustable"] as const;
export type ObservationAssessment = (typeof OBSERVATION_ASSESSMENTS)[number];

export interface Observation {
  id: string;
  category: ObservationCategory;
  assessment: ObservationAssessment;
  text: string;
}

/** Observation, optional adjustment, and rationale are separate fields (R5.2). */
export interface Recommendation {
  id: string;
  category: ObservationCategory;
  observationId: string | null;
  adjustment: string;
  rationale: string;
  cueIds: string[];
}

export interface AnalysisResult {
  generatedAt: string;
  jobContext: JobContext;
  observations: Observation[];
  recommendations: Recommendation[];
}

export interface AnalysisJob {
  id: AnalysisJobId;
  state: JobState;
  createdAt: string;
  /** When the backend deletes the job and its temporary image. */
  expiresAt: string;
  result: AnalysisResult | null;
  error: ApiError | null;
}

/** Multipart field names for `POST /v1/analysis-jobs`. */
export const ANALYSIS_REQUEST_FIELDS = {
  consentVersion: "consentVersion",
  jobDescription: "jobDescription",
  image: "image",
} as const;

/** The single curated try-on style in the MVP (R6.1). */
export const TRY_ON_STYLES = [
  {
    id: "navy-blazer",
    label: "Navy blazer",
    description: "A classic single-breasted navy blazer, a common choice for business interviews.",
  },
] as const;

export type TryOnStyleId = (typeof TRY_ON_STYLES)[number]["id"];

export interface TryOnRequest {
  analysisJobId: AnalysisJobId;
  styleId: TryOnStyleId;
}

/** When `state` is `succeeded`, the result image is available from `API_ROUTES.tryOnResult`. */
export interface TryOnJob {
  id: TryOnJobId;
  state: JobState;
  styleId: TryOnStyleId;
  createdAt: string;
  expiresAt: string;
  error: ApiError | null;
}
