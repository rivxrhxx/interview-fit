import type { ApiError } from "./errors.ts";
import type { Locale } from "./locale.ts";

/** Opaque Interview Fit identifiers. They never embed provider task or file IDs. */
export type AnalysisJobId = string & { readonly __brand: "AnalysisJobId" };
export type TryOnJobId = string & { readonly __brand: "TryOnJobId" };

export const ANALYSIS_JOB_ID_PATTERN = /^an_[A-Za-z0-9]{20,40}$/;
export const TRY_ON_JOB_ID_PATTERN = /^to_[A-Za-z0-9]{20,40}$/;

export const JOB_STATES = ["queued", "processing", "succeeded", "failed", "cancelled"] as const;
export type JobState = (typeof JOB_STATES)[number];

export const TERMINAL_JOB_STATES: readonly JobState[] = ["succeeded", "failed", "cancelled"];

/**
 * Neutral capture-context categories. Appearance scoring categories do not exist by
 * design (R5.3). `skin-prep` carries optional lighting and grooming-prep tips only,
 * never scores or condition names (R5.4).
 */
export const OBSERVATION_CATEGORIES = ["lighting", "framing", "background", "image-clarity", "skin-prep", "attire", "hair"] as const;
export type ObservationCategory = (typeof OBSERVATION_CATEGORIES)[number];

/** A job-context cue backed by an excerpt from the job description (R5.1). */
export interface JobCue {
  id: string;
  label: string;
  evidence: string;
}

/** Job-analysis points shown on the job step, in display order (R1.4). */
export const JOB_INSIGHT_FIELDS = ["role", "industry", "atmosphere", "interview-format", "dress-code"] as const;
export type JobInsightField = (typeof JOB_INSIGHT_FIELDS)[number];

/**
 * One job-analysis point. `value` and `evidence` are both null when the posting
 * does not say; otherwise `evidence` is a verbatim excerpt of the posting.
 */
export interface JobInsightPoint {
  id: JobInsightField;
  value: string | null;
  evidence: string | null;
}

/** Dress formality the posting suggests. Drives attire and hairstyle suggestions. */
export const FORMALITY_LEVELS = ["formal", "business-casual", "smart-casual", "casual", "unknown"] as const;
export type Formality = (typeof FORMALITY_LEVELS)[number];

/** Who wrote the job analysis: the AI provider, or the deterministic rules fallback (R1.6). */
export const JOB_ANALYSIS_SOURCES = ["ai", "rules"] as const;
export type JobAnalysisSource = (typeof JOB_ANALYSIS_SOURCES)[number];

export interface JobContext {
  summary: string;
  source: JobAnalysisSource;
  formality: Formality;
  /** Exactly one point per `JOB_INSIGHT_FIELDS` entry, in that order. */
  points: JobInsightPoint[];
  /** Presentation cues from a fixed catalog, each with verbatim evidence. */
  cues: JobCue[];
}

/** Response of `POST /v1/job-analyses`. No image is involved. */
export interface JobAnalysis {
  generatedAt: string;
  locale: Locale;
  jobContext: JobContext;
}

/** JSON body fields for `POST /v1/job-analyses`. */
export const JOB_ANALYSIS_REQUEST_FIELDS = {
  jobDescription: "jobDescription",
  /** Optional; "en" when absent. */
  locale: "locale",
} as const;

/** IDs a recommendation may cite: catalog cues and job-analysis points that have evidence. */
export function citableJobIds(context: JobContext): Set<string> {
  return new Set([
    ...context.cues.map((cue) => cue.id),
    ...context.points.filter((point) => point.evidence !== null).map((point) => point.id),
  ]);
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
  /** Cited catalog cue IDs or job-analysis point IDs (see `citableJobIds`). */
  cueIds: string[];
}

export interface AnalysisResult {
  generatedAt: string;
  /** Language of every generated string in this result. */
  locale: Locale;
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
  /** Optional; "en" when absent. Selects the language of generated guidance. */
  locale: "locale",
} as const;

/** The single try-on category in the MVP (R6.1). */
export const TRY_ON_CATEGORY = "hairstyle" as const;

/**
 * Curated interview hairstyles (R6.1). Every style keeps the user's own hair color,
 * and none is tied to a gender: the user chooses, and suggestions come only from the
 * job's dress formality (R6.4). Display names are localized in the desktop.
 */
export const TRY_ON_STYLES = [
  { id: "sleek-middle-part", formality: ["formal", "business-casual"] },
  { id: "neat-updo", formality: ["formal", "business-casual"] },
  { id: "side-swept-cut", formality: ["formal", "business-casual", "smart-casual"] },
  { id: "side-part-straight", formality: ["business-casual", "smart-casual"] },
  { id: "short-bob", formality: ["business-casual", "smart-casual", "casual"] },
  { id: "textured-comma", formality: ["smart-casual", "casual"] },
] as const satisfies ReadonlyArray<{ id: string; formality: readonly Formality[] }>;

export type TryOnStyleId = (typeof TRY_ON_STYLES)[number]["id"];

/** Styles that suit the posting's dress formality, in catalog order. Never based on the photo (R6.4). */
export function suggestedStyleIds(formality: Formality): TryOnStyleId[] {
  return TRY_ON_STYLES.filter((style) => (style.formality as readonly Formality[]).includes(formality)).map((style) => style.id);
}

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
