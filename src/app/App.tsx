import { useReducer } from "react";
import "./App.css";
import { AppShell } from "./AppShell";
import { flowReducer, initialFlowState, type FlowEvent, type FlowState } from "./flowReducer";
import { PhotoPicker, PhotoPreview } from "../features/capture";
import { JobDescriptionForm, JobDescriptionSummary } from "../features/job-posting";

type Dispatch = (event: FlowEvent) => void;

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

function App() {
  const [state, dispatch] = useReducer(flowReducer, initialFlowState);

  return (
    <AppShell step={state.step}>
      {state.step === "draft" && <DraftStep state={state} dispatch={dispatch} />}
      {state.step === "image-ready" && (
        <PhotoPreview image={state.image} onRemove={() => dispatch({ type: "IMAGE_DISCARDED" })} />
      )}
    </AppShell>
  );
}

export default App;
