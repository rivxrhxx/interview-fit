import { useReducer } from "react";
import "./App.css";
import { AppShell } from "./AppShell";
import { flowReducer, initialFlowState, type DraftNotice, type FlowEvent, type FlowState } from "./flowReducer";
import { PhotoPicker, PhotoPreview } from "../features/capture";
import { ConsentGate } from "../features/consent";
import { JobDescriptionForm, JobDescriptionSummary } from "../features/job-posting";

type Dispatch = (event: FlowEvent) => void;

const DRAFT_NOTICES: Record<DraftNotice, string> = {
  "consent-declined":
    "Your photo was discarded and nothing was uploaded. You can keep editing the job description or choose another photo.",
};

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

function StepContent({ state, dispatch }: { state: FlowState; dispatch: Dispatch }) {
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
        <div className="photo-actions">
          <button type="button" className="button button-secondary" onClick={() => dispatch({ type: "ANALYSIS_CANCELLED" })}>
            Cancel analysis
          </button>
        </div>
      );
  }
}

function App() {
  const [state, dispatch] = useReducer(flowReducer, initialFlowState);
  const notice = state.step === "draft" && state.notice ? DRAFT_NOTICES[state.notice] : undefined;

  return (
    <AppShell step={state.step} notice={notice}>
      <StepContent state={state} dispatch={dispatch} />
    </AppShell>
  );
}

export default App;
