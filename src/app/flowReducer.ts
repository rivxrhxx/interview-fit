import type { AnalysisJobId, AnalysisResult, ErrorCode, Recovery, TryOnJobId } from "../lib/api/contracts";
import type { AnalysisStage } from "../features/analysis";
import type { PreparedImage } from "../features/capture";
import type { TryOnReportStatus } from "../features/report";
import type { TryOnPhase } from "../features/try-on";
import { isConsentCurrent, type ConsentRecord } from "../features/consent";
import type { JobDescription } from "../features/job-posting";

export type JobDraft = { status: "editing"; text: string } | { status: "saved"; value: JobDescription };

export type DraftNotice = "consent-declined";

export interface ReviewedAnalysis {
  jobId: AnalysisJobId;
  result: AnalysisResult;
}

export interface AnalysisContext {
  job: JobDescription;
  image: PreparedImage;
  consent: ConsentRecord;
}

export type FlowState =
  | { step: "draft"; job: JobDraft; notice?: DraftNotice }
  | { step: "image-ready"; job: JobDescription; image: PreparedImage }
  | { step: "consenting"; job: JobDescription; image: PreparedImage }
  | ({ step: "analyzing"; stage: AnalysisStage; attempt: number } & AnalysisContext)
  | { step: "reviewed"; job: JobDescription; image: PreparedImage; analysis: ReviewedAnalysis }
  | {
      step: "trying-on";
      job: JobDescription;
      image: PreparedImage;
      analysis: ReviewedAnalysis;
      tryOn: TryOnPhase;
      attempt: number;
    }
  | {
      step: "report-ready";
      job: JobDescription;
      image: PreparedImage;
      analysis: ReviewedAnalysis;
      tryOn: TryOnReportStatus;
      generatedAt: string;
    }
  | { step: "error"; code: ErrorCode; context: AnalysisContext; attempt: number };

export type FlowEvent =
  | { type: "JOB_SAVED"; job: JobDescription }
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
  | { type: "TRY_ON_STARTED" }
  | { type: "TRY_ON_SUCCEEDED"; preview: Blob; jobId: TryOnJobId }
  | { type: "TRY_ON_FAILED"; code: ErrorCode }
  | { type: "TRY_ON_CANCELLED" }
  | { type: "TRY_ON_RESET" }
  | { type: "TRY_ON_CLOSED" }
  | { type: "REPORT_REQUESTED"; generatedAt: string }
  | { type: "REPORT_CLOSED" };

export const initialFlowState: FlowState = { step: "draft", job: { status: "editing", text: "" } };

const savedDraft = (job: JobDescription): FlowState => ({ step: "draft", job: { status: "saved", value: job } });

function recover(state: Extract<FlowState, { step: "error" }>, recovery: Recovery): FlowState {
  const { job, image, consent } = state.context;
  switch (recovery) {
    case "retry":
    case "retry-later":
      return isConsentCurrent(consent)
        ? { step: "analyzing", job, image, consent, stage: "uploading", attempt: state.attempt + 1 }
        : { step: "consenting", job, image };
    case "review-consent":
      return { step: "consenting", job, image };
    case "edit-job-description":
      return { step: "draft", job: { status: "editing", text: job.text } };
    case "choose-another-image":
    case "start-over":
      return savedDraft(job);
  }
}

function reportFrom(
  state: { job: JobDescription; image: PreparedImage; analysis: ReviewedAnalysis },
  tryOn: TryOnReportStatus,
): Omit<Extract<FlowState, { step: "report-ready" }>, "generatedAt"> {
  // The try-on preview itself is dropped here; only its status goes into the report (R7.1, R6.3).
  return { step: "report-ready", job: state.job, image: state.image, analysis: state.analysis, tryOn };
}

function tryOnTransition(state: Extract<FlowState, { step: "trying-on" }>, event: FlowEvent): FlowState {
  const { tryOn } = state;
  switch (event.type) {
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
      return tryOn.status === "running"
        ? state
        : { step: "reviewed", job: state.job, image: state.image, analysis: state.analysis };
    default:
      return state;
  }
}

/** Pure transition function. Events that are not valid for the current step are ignored. */
export function flowReducer(state: FlowState, event: FlowEvent): FlowState {
  switch (state.step) {
    case "draft":
      switch (event.type) {
        case "JOB_SAVED":
          return savedDraft(event.job);
        case "JOB_EDIT_REQUESTED":
          return state.job.status === "saved"
            ? { step: "draft", job: { status: "editing", text: state.job.value.text } }
            : state;
        case "IMAGE_PREPARED":
          return state.job.status === "saved" ? { step: "image-ready", job: state.job.value, image: event.image } : state;
        default:
          return state;
      }
    case "image-ready":
      switch (event.type) {
        case "IMAGE_DISCARDED":
          return savedDraft(state.job);
        case "PHOTO_CONFIRMED":
          return { step: "consenting", job: state.job, image: state.image };
        default:
          return state;
      }
    case "consenting":
      switch (event.type) {
        case "CONSENT_GIVEN":
          // Analysis may start only with agreement to the current consent text (R3.1).
          return isConsentCurrent(event.consent)
            ? { step: "analyzing", job: state.job, image: state.image, consent: event.consent, stage: "uploading", attempt: 1 }
            : state;
        case "CONSENT_DECLINED":
          // Declining discards the image without sending anything (R3.2).
          return { step: "draft", job: { status: "saved", value: state.job }, notice: "consent-declined" };
        default:
          return state;
      }
    case "analyzing":
      switch (event.type) {
        case "ANALYSIS_PROGRESS":
          return { ...state, stage: event.stage };
        case "ANALYSIS_SUCCEEDED":
          return {
            step: "reviewed",
            job: state.job,
            image: state.image,
            analysis: { jobId: event.jobId, result: event.result },
          };
        case "ANALYSIS_FAILED":
          return {
            step: "error",
            code: event.code,
            context: { job: state.job, image: state.image, consent: state.consent },
            attempt: state.attempt,
          };
        case "ANALYSIS_CANCELLED":
          // Return to the last safe state; consent must be given again before another upload.
          return { step: "image-ready", job: state.job, image: state.image };
        default:
          return state;
      }
    case "reviewed":
      switch (event.type) {
        case "START_OVER":
          return savedDraft(state.job);
        case "TRY_ON_OPENED":
          return { step: "trying-on", job: state.job, image: state.image, analysis: state.analysis, tryOn: { status: "idle" }, attempt: 0 };
        case "REPORT_REQUESTED":
          return { ...reportFrom(state, "not-created"), generatedAt: event.generatedAt };
        default:
          return state;
      }
    case "trying-on":
      if (event.type === "REPORT_REQUESTED" && state.tryOn.status !== "running") {
        const status = state.tryOn.status === "ready" ? "created" : state.tryOn.status === "failed" ? "unavailable" : "not-created";
        return { ...reportFrom(state, status), generatedAt: event.generatedAt };
      }
      return tryOnTransition(state, event);
    case "report-ready":
      switch (event.type) {
        case "REPORT_CLOSED":
          return { step: "reviewed", job: state.job, image: state.image, analysis: state.analysis };
        case "START_OVER":
          return savedDraft(state.job);
        default:
          return state;
      }
    case "error":
      return event.type === "RECOVERY_SELECTED" ? recover(state, event.recovery) : state;
  }
}
