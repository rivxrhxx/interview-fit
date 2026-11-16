import {
  TRY_ON_STYLES,
  suggestedStyleIds,
  type AnalysisJobId,
  type AnalysisResult,
  type ErrorCode,
  type JobContext,
  type Recovery,
  type TryOnJobId,
  type TryOnStyleId,
} from "../lib/api/contracts";
import type { AnalysisStage } from "../features/analysis";
import type { PreparedImage } from "../features/capture";
import type { TryOnReportStatus } from "../features/report";
import type { TryOnPhase } from "../features/try-on";
import { isConsentCurrent, type ConsentRecord } from "../features/consent";
import type { JobDescription } from "../features/job-posting";

export type DraftNotice = "consent-declined";

/** The job and company-atmosphere analysis shown after the posting is saved (R1.4). */
export type JobInsight =
  | { status: "loading"; attempt: number }
  | { status: "ready"; jobContext: JobContext }
  | { status: "failed"; code: ErrorCode; attempt: number };

/** A saved posting together with its finished analysis; carried through the photo steps. */
export interface AnalyzedJob {
  job: JobDescription;
  jobContext: JobContext;
}

export interface ReviewedAnalysis {
  jobId: AnalysisJobId;
  result: AnalysisResult;
}

export interface AnalysisContext extends AnalyzedJob {
  image: PreparedImage;
  consent: ConsentRecord;
}

type WithPhoto = AnalyzedJob & { image: PreparedImage };

export type FlowState =
  | { step: "draft"; text: string }
  | { step: "job-reviewed"; job: JobDescription; insight: JobInsight; notice?: DraftNotice }
  | ({ step: "image-ready" } & WithPhoto)
  | ({ step: "consenting" } & WithPhoto)
  | ({ step: "analyzing"; stage: AnalysisStage; attempt: number } & AnalysisContext)
  | ({ step: "reviewed"; analysis: ReviewedAnalysis } & WithPhoto)
  | ({ step: "trying-on"; analysis: ReviewedAnalysis; styleId: TryOnStyleId; tryOn: TryOnPhase; attempt: number } & WithPhoto)
  | ({
      step: "report-ready";
      analysis: ReviewedAnalysis;
      tryOn: TryOnReportStatus;
      /** The style whose preview was created; null when none was. */
      tryOnStyleId: TryOnStyleId | null;
      generatedAt: string;
    } & WithPhoto)
  | { step: "error"; code: ErrorCode; context: AnalysisContext; attempt: number };

export type FlowEvent =
  | { type: "JOB_SAVED"; job: JobDescription }
  | { type: "JOB_ANALYZED"; jobContext: JobContext }
  | { type: "JOB_ANALYSIS_FAILED"; code: ErrorCode }
  | { type: "JOB_ANALYSIS_RETRIED" }
  | { type: "JOB_EDIT_REQUESTED" }
  | { type: "IMAGE_PREPARED"; image: PreparedImage }
  | { type: "IMAGE_DISCARDED" }
  | { type: "PHOTO_CONFIRMED" }
  | { type: "CONSENT_GIVEN"; consent: ConsentRecord }
  | { type: "CONSENT_DECLINED" }
  | { type: "ANALYSIS_PROGRESS"; stage: AnalysisStage }
  | { type: "ANALYSIS_SUCCEEDED"; jobId: AnalysisJobId; result: AnalysisResult }
  | { type: "ANALYSIS_FAILED"; code: ErrorCode }
  | { type: "ANALYSIS_CANCELLED" }
  | { type: "RECOVERY_SELECTED"; recovery: Recovery }
  | { type: "START_OVER" }
  | { type: "TRY_ON_OPENED" }
  | { type: "TRY_ON_STYLE_SELECTED"; styleId: TryOnStyleId }
  | { type: "TRY_ON_STARTED" }
  | { type: "TRY_ON_SUCCEEDED"; preview: Blob; jobId: TryOnJobId }
  | { type: "TRY_ON_FAILED"; code: ErrorCode }
  | { type: "TRY_ON_CANCELLED" }
  | { type: "TRY_ON_RESET" }
  | { type: "TRY_ON_CLOSED" }
  | { type: "REPORT_REQUESTED"; generatedAt: string }
  | { type: "REPORT_CLOSED" };

export const initialFlowState: FlowState = { step: "draft", text: "" };

/** Back to the analyzed posting, ready for a (new) photo; the image is dropped. */
const reviewedJob = ({ job, jobContext }: AnalyzedJob, notice?: DraftNotice): FlowState =>
  notice
    ? { step: "job-reviewed", job, insight: { status: "ready", jobContext }, notice }
    : { step: "job-reviewed", job, insight: { status: "ready", jobContext } };

const withPhoto = ({ job, jobContext, image }: WithPhoto): WithPhoto => ({ job, jobContext, image });

function recover(state: Extract<FlowState, { step: "error" }>, recovery: Recovery): FlowState {
  const { consent } = state.context;
  const base = withPhoto(state.context);
  switch (recovery) {
    case "retry":
    case "retry-later":
      return isConsentCurrent(consent)
        ? { step: "analyzing", ...base, consent, stage: "uploading", attempt: state.attempt + 1 }
        : { step: "consenting", ...base };
    case "review-consent":
      return { step: "consenting", ...base };
    case "edit-job-description":
      return { step: "draft", text: base.job.text };
    case "choose-another-image":
    case "start-over":
      return reviewedJob(base);
  }
}

function reportFrom(
  state: WithPhoto & { analysis: ReviewedAnalysis },
  tryOn: TryOnReportStatus,
  tryOnStyleId: TryOnStyleId | null = null,
): Omit<Extract<FlowState, { step: "report-ready" }>, "generatedAt"> {
  // The try-on preview itself is dropped here; only its status goes into the report (R7.1, R6.3).
  return { step: "report-ready", ...withPhoto(state), analysis: state.analysis, tryOn, tryOnStyleId };
}

/** Preselects the first style that suits the posting's formality; never based on the photo (R6.4). */
function defaultStyle(jobContext: JobContext): TryOnStyleId {
  return suggestedStyleIds(jobContext.formality)[0] ?? TRY_ON_STYLES[0].id;
}

function jobTransition(state: Extract<FlowState, { step: "job-reviewed" }>, event: FlowEvent): FlowState {
  const { insight } = state;
  switch (event.type) {
    case "JOB_ANALYZED":
      return insight.status === "loading" ? { step: "job-reviewed", job: state.job, insight: { status: "ready", jobContext: event.jobContext } } : state;
    case "JOB_ANALYSIS_FAILED":
      return insight.status === "loading"
        ? { step: "job-reviewed", job: state.job, insight: { status: "failed", code: event.code, attempt: insight.attempt } }
        : state;
    case "JOB_ANALYSIS_RETRIED":
      return insight.status === "failed"
        ? { step: "job-reviewed", job: state.job, insight: { status: "loading", attempt: insight.attempt + 1 } }
        : state;
    case "JOB_EDIT_REQUESTED":
      return { step: "draft", text: state.job.text };
    case "IMAGE_PREPARED":
      // A photo can be chosen only once the posting has been analyzed.
      return insight.status === "ready"
        ? { step: "image-ready", job: state.job, jobContext: insight.jobContext, image: event.image }
        : state;
    default:
      return state;
  }
}

function tryOnTransition(state: Extract<FlowState, { step: "trying-on" }>, event: FlowEvent): FlowState {
  const { tryOn } = state;
  switch (event.type) {
    case "TRY_ON_STYLE_SELECTED":
      // Choosing another style discards any preview; never while one is being created.
      return tryOn.status === "running" ? state : { ...state, styleId: event.styleId, tryOn: { status: "idle" } };
    case "TRY_ON_STARTED":
      return tryOn.status === "idle" || tryOn.status === "failed"
        ? { ...state, tryOn: { status: "running" }, attempt: state.attempt + 1 }
        : state;
    case "TRY_ON_SUCCEEDED":
      return tryOn.status === "running" ? { ...state, tryOn: { status: "ready", preview: event.preview, jobId: event.jobId } } : state;
    case "TRY_ON_FAILED":
      return tryOn.status === "running" ? { ...state, tryOn: { status: "failed", code: event.code } } : state;
    case "TRY_ON_CANCELLED":
      return tryOn.status === "running" ? { ...state, tryOn: { status: "idle" } } : state;
    case "TRY_ON_RESET":
      // Reset discards the preview; nothing was persisted (R6.2, R6.3).
      return tryOn.status === "ready" ? { ...state, tryOn: { status: "idle" } } : state;
    case "TRY_ON_CLOSED":
      return tryOn.status === "running" ? state : { step: "reviewed", ...withPhoto(state), analysis: state.analysis };
    default:
      return state;
  }
}

/** Pure transition function. Events that are not valid for the current step are ignored. */
export function flowReducer(state: FlowState, event: FlowEvent): FlowState {
  switch (state.step) {
    case "draft":
      return event.type === "JOB_SAVED"
        ? { step: "job-reviewed", job: event.job, insight: { status: "loading", attempt: 1 } }
        : state;
    case "job-reviewed":
      return jobTransition(state, event);
    case "image-ready":
      switch (event.type) {
        case "IMAGE_DISCARDED":
          return reviewedJob(state);
        case "PHOTO_CONFIRMED":
          return { step: "consenting", ...withPhoto(state) };
        default:
          return state;
      }
    case "consenting":
      switch (event.type) {
        case "CONSENT_GIVEN":
          // Analysis may start only with agreement to the current consent text (R3.1).
          return isConsentCurrent(event.consent)
            ? { step: "analyzing", ...withPhoto(state), consent: event.consent, stage: "uploading", attempt: 1 }
            : state;
        case "CONSENT_DECLINED":
          // Declining discards the image without sending anything (R3.2).
          return reviewedJob(state, "consent-declined");
        default:
          return state;
      }
    case "analyzing":
      switch (event.type) {
        case "ANALYSIS_PROGRESS":
          return { ...state, stage: event.stage };
        case "ANALYSIS_SUCCEEDED":
          return { step: "reviewed", ...withPhoto(state), analysis: { jobId: event.jobId, result: event.result } };
        case "ANALYSIS_FAILED":
          return {
            step: "error",
            code: event.code,
            context: { ...withPhoto(state), consent: state.consent },
            attempt: state.attempt,
          };
        case "ANALYSIS_CANCELLED":
          // Return to the last safe state; consent must be given again before another upload.
          return { step: "image-ready", ...withPhoto(state) };
        default:
          return state;
      }
    case "reviewed":
      switch (event.type) {
        case "START_OVER":
          return reviewedJob(state);
        case "TRY_ON_OPENED":
          return {
            step: "trying-on",
            ...withPhoto(state),
            analysis: state.analysis,
            styleId: defaultStyle(state.jobContext),
            tryOn: { status: "idle" },
            attempt: 0,
          };
        case "REPORT_REQUESTED":
          return { ...reportFrom(state, "not-created"), generatedAt: event.generatedAt };
        default:
          return state;
      }
    case "trying-on":
      if (event.type === "REPORT_REQUESTED" && state.tryOn.status !== "running") {
        const status = state.tryOn.status === "ready" ? "created" : state.tryOn.status === "failed" ? "unavailable" : "not-created";
        return { ...reportFrom(state, status, status === "created" ? state.styleId : null), generatedAt: event.generatedAt };
      }
      return tryOnTransition(state, event);
    case "report-ready":
      switch (event.type) {
        case "REPORT_CLOSED":
          return { step: "reviewed", ...withPhoto(state), analysis: state.analysis };
        case "START_OVER":
          return reviewedJob(state);
        default:
          return state;
      }
    case "error":
      return event.type === "RECOVERY_SELECTED" ? recover(state, event.recovery) : state;
  }
}
