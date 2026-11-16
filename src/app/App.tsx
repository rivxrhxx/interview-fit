import { useEffect, useReducer, useRef } from "react";
import "./App.css";
import { AppShell } from "./AppShell";
import { ErrorPanel } from "./ErrorPanel";
import { flowReducer, initialFlowState, type FlowEvent, type FlowState } from "./flowReducer";
import {
  AnalysisProgress,
  AnalysisReview,
  DEFAULT_ANALYSIS_TIMING,
  type AnalysisTiming,
} from "../features/analysis";
import { PhotoPicker, PhotoPreview } from "../features/capture";
import { ConsentGate } from "../features/consent";
import { RecommendationList } from "../features/recommendation";
import { ReportStep } from "../features/report";
import { TryOnStep, tryOnNotice } from "../features/try-on";
import { useAdapters } from "../lib/adapters";
import { suggestedStyleIds } from "../lib/api/contracts";
import { useI18n, type Messages } from "../lib/i18n";
import {
  JobDescriptionForm,
  JobDescriptionSummary,
  JobInsightError,
  JobInsightLoader,
  JobInsightView,
} from "../features/job-posting";

export type { AnalysisTiming } from "../features/analysis";

type Dispatch = (event: FlowEvent) => void;

function noticeFor(state: FlowState, m: Messages): string | undefined {
  switch (state.step) {
    case "job-reviewed":
      return state.notice === "consent-declined" ? m.notices.consentDeclined : undefined;
    case "analyzing":
      return state.stage === "uploading" ? m.notices.uploading : m.notices.processing;
    case "error":
      return m.errors[state.code];
    case "trying-on":
      return tryOnNotice(state.tryOn, m);
    default:
      return undefined;
  }
}

function JobReviewedStep({ state, dispatch }: { state: Extract<FlowState, { step: "job-reviewed" }>; dispatch: Dispatch }) {
  const { insight } = state;
  return (
    <div className="step-stack">
      {insight.status === "loading" && (
        <JobInsightLoader
          key={insight.attempt}
          jobDescription={state.job.text}
          onReady={(jobContext) => dispatch({ type: "JOB_ANALYZED", jobContext })}
          onFailed={(code) => dispatch({ type: "JOB_ANALYSIS_FAILED", code })}
        />
      )}
      {insight.status === "failed" && (
        <JobInsightError
          code={insight.code}
          onRetry={() => dispatch({ type: "JOB_ANALYSIS_RETRIED" })}
          onEdit={() => dispatch({ type: "JOB_EDIT_REQUESTED" })}
        />
      )}
      {insight.status === "ready" && (
        <>
          <JobInsightView jobContext={insight.jobContext} />
          <PhotoPicker onImageReady={(image) => dispatch({ type: "IMAGE_PREPARED", image })} />
        </>
      )}
      <JobDescriptionSummary job={state.job} onEdit={() => dispatch({ type: "JOB_EDIT_REQUESTED" })} />
    </div>
  );
}

function StepContent({ state, dispatch, timing }: { state: FlowState; dispatch: Dispatch; timing: AnalysisTiming }) {
  const { m } = useI18n();
  switch (state.step) {
    case "draft":
      return <JobDescriptionForm initialText={state.text} onSubmit={(job) => dispatch({ type: "JOB_SAVED", job })} />;
    case "job-reviewed":
      return <JobReviewedStep state={state} dispatch={dispatch} />;
    case "image-ready":
      return (
        <PhotoPreview image={state.image} onRemove={() => dispatch({ type: "IMAGE_DISCARDED" })}>
          <button type="button" className="button button-primary" onClick={() => dispatch({ type: "PHOTO_CONFIRMED" })}>
            {m.photo.useThis}
          </button>
        </PhotoPreview>
      );
    case "consenting":
      return (
        <ConsentGate
          onAccept={(consent) => dispatch({ type: "CONSENT_GIVEN", consent })}
          onDecline={() => dispatch({ type: "CONSENT_DECLINED" })}
        />
      );
    case "analyzing":
      return (
        <AnalysisProgress
          key={state.attempt}
          jobDescription={state.job.text}
          image={state.image.blob}
          consent={state.consent}
          timing={timing}
          onProgress={(stage) => dispatch({ type: "ANALYSIS_PROGRESS", stage })}
          onFinished={(outcome) =>
            dispatch(
              outcome.status === "succeeded"
                ? { type: "ANALYSIS_SUCCEEDED", jobId: outcome.jobId, result: outcome.result }
                : { type: "ANALYSIS_FAILED", code: outcome.code },
            )
          }
          onCancel={() => dispatch({ type: "ANALYSIS_CANCELLED" })}
        />
      );
    case "reviewed":
      return (
        <div className="step-stack">
          <AnalysisReview result={state.analysis.result} />
          <RecommendationList result={state.analysis.result} />
          <div className="actions">
            <button type="button" className="button button-primary" onClick={() => dispatch({ type: "TRY_ON_OPENED" })}>
              {m.reviewed.tryOn}
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => dispatch({ type: "REPORT_REQUESTED", generatedAt: new Date().toISOString() })}
            >
              {m.reviewed.report}
            </button>
            <button type="button" className="button button-text" onClick={() => dispatch({ type: "START_OVER" })}>
              {m.reviewed.startOver}
            </button>
          </div>
        </div>
      );
    case "trying-on":
      return (
        <TryOnStep
          phase={state.tryOn}
          attempt={state.attempt}
          styleId={state.styleId}
          suggested={suggestedStyleIds(state.jobContext.formality)}
          original={state.image.blob}
          analysisJobId={state.analysis.jobId}
          timing={timing}
          onSelect={(styleId) => dispatch({ type: "TRY_ON_STYLE_SELECTED", styleId })}
          onStart={() => dispatch({ type: "TRY_ON_STARTED" })}
          onFinished={(outcome, jobId) =>
            dispatch(
              outcome.status === "succeeded" && jobId
                ? { type: "TRY_ON_SUCCEEDED", preview: outcome.preview, jobId }
                : { type: "TRY_ON_FAILED", code: outcome.status === "failed" ? outcome.code : "INTERNAL_ERROR" },
            )
          }
          onCancel={() => dispatch({ type: "TRY_ON_CANCELLED" })}
          onReset={() => dispatch({ type: "TRY_ON_RESET" })}
          onClose={() => dispatch({ type: "TRY_ON_CLOSED" })}
          onContinue={() => dispatch({ type: "REPORT_REQUESTED", generatedAt: new Date().toISOString() })}
        />
      );
    case "report-ready":
      return (
        <ReportStep
          result={state.analysis.result}
          tryOn={state.tryOn}
          tryOnStyleId={state.tryOnStyleId}
          generatedAt={state.generatedAt}
          onBack={() => dispatch({ type: "REPORT_CLOSED" })}
          onStartOver={() => dispatch({ type: "START_OVER" })}
        />
      );
    case "error":
      return <ErrorPanel code={state.code} onRecover={(recovery) => dispatch({ type: "RECOVERY_SELECTED", recovery })} />;
  }
}

interface AppProps {
  analysisTiming?: AnalysisTiming;
}

function analysisJobIdOf(state: FlowState) {
  return state.step === "reviewed" || state.step === "trying-on" || state.step === "report-ready"
    ? state.analysis.jobId
    : null;
}

/**
 * When the flow leaves the consented analysis (start over, new photo), ask the
 * backend to delete its temporary copy right away instead of waiting for expiry.
 */
function useAnalysisCleanup(state: FlowState) {
  const { api } = useAdapters();
  const jobId = analysisJobIdOf(state);
  const latest = useRef(api);
  latest.current = api;
  useEffect(() => {
    if (!jobId) return;
    return () => {
      void latest.current.cancelAnalysisJob(jobId).catch(() => undefined);
    };
  }, [jobId]);
}

function App({ analysisTiming = DEFAULT_ANALYSIS_TIMING }: AppProps) {
  const [state, dispatch] = useReducer(flowReducer, initialFlowState);
  const { m } = useI18n();
  useAnalysisCleanup(state);

  return (
    <AppShell step={state.step} notice={noticeFor(state, m)}>
      <StepContent state={state} dispatch={dispatch} timing={analysisTiming} />
    </AppShell>
  );
}

export default App;
