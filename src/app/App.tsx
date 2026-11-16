import { useEffect, useReducer, useRef } from "react";
import "./App.css";
import { AppShell } from "./AppShell";
import { ErrorPanel } from "./ErrorPanel";
import { flowReducer, initialFlowState, type DraftNotice, type FlowEvent, type FlowState } from "./flowReducer";
import { ERROR_MESSAGES } from "../lib/api/contracts";
import {
  AnalysisProgress,
  AnalysisReview,
  DEFAULT_ANALYSIS_TIMING,
  type AnalysisStage,
  type AnalysisTiming,
} from "../features/analysis";
import { PhotoPicker, PhotoPreview } from "../features/capture";
import { ConsentGate } from "../features/consent";
import { RecommendationList } from "../features/recommendation";
import { ReportStep } from "../features/report";
import { TryOnStep, tryOnNotice } from "../features/try-on";
import { useAdapters } from "../lib/adapters";
import { JobDescriptionForm, JobDescriptionSummary } from "../features/job-posting";

export type { AnalysisTiming } from "../features/analysis";

type Dispatch = (event: FlowEvent) => void;

const DRAFT_NOTICES: Record<DraftNotice, string> = {
  "consent-declined":
    "Your photo was discarded and nothing was uploaded. You can keep editing the job description or choose another photo.",
};

const STAGE_NOTICES: Record<AnalysisStage, string> = {
  uploading: "Uploading your photo securely…",
  processing: "Analyzing presentation cues…",
};

function noticeFor(state: FlowState): string | undefined {
  switch (state.step) {
    case "draft":
      return state.notice ? DRAFT_NOTICES[state.notice] : undefined;
    case "analyzing":
      return STAGE_NOTICES[state.stage];
    case "error":
      return ERROR_MESSAGES[state.code];
    case "trying-on":
      return tryOnNotice(state.tryOn);
    default:
      return undefined;
  }
}

function DraftStep({ state, dispatch }: { state: Extract<FlowState, { step: "draft" }>; dispatch: Dispatch }) {
  if (state.job.status === "editing") {
    return (
      <JobDescriptionForm initialText={state.job.text} onSubmit={(job) => dispatch({ type: "JOB_SAVED", job })} />
    );
  }
  return (
    <div className="step-stack">
      <JobDescriptionSummary job={state.job.value} onEdit={() => dispatch({ type: "JOB_EDIT_REQUESTED" })} />
      <PhotoPicker onImageReady={(image) => dispatch({ type: "IMAGE_PREPARED", image })} />
    </div>
  );
}

function StepContent({ state, dispatch, timing }: { state: FlowState; dispatch: Dispatch; timing: AnalysisTiming }) {
  switch (state.step) {
    case "draft":
      return <DraftStep state={state} dispatch={dispatch} />;
    case "image-ready":
      return (
        <PhotoPreview image={state.image} onRemove={() => dispatch({ type: "IMAGE_DISCARDED" })}>
          <button type="button" className="button button-primary" onClick={() => dispatch({ type: "PHOTO_CONFIRMED" })}>
            Use this photo
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
          <div className="photo-actions">
            <button type="button" className="button button-primary" onClick={() => dispatch({ type: "TRY_ON_OPENED" })}>
              Preview interview attire
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => dispatch({ type: "REPORT_REQUESTED", generatedAt: new Date().toISOString() })}
            >
              Create report
            </button>
            <button type="button" className="button button-secondary" onClick={() => dispatch({ type: "START_OVER" })}>
              Start over
            </button>
          </div>
        </div>
      );
    case "trying-on":
      return (
        <TryOnStep
          phase={state.tryOn}
          attempt={state.attempt}
          original={state.image.blob}
          analysisJobId={state.analysis.jobId}
          timing={timing}
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
  useAnalysisCleanup(state);

  return (
    <AppShell step={state.step} notice={noticeFor(state)}>
      <StepContent state={state} dispatch={dispatch} timing={analysisTiming} />
    </AppShell>
  );
}

export default App;
