import { useReducer } from "react";
import "./App.css";
import { AppShell } from "./AppShell";
import { flowReducer, initialFlowState } from "./flowReducer";
import { JobDescriptionForm, JobDescriptionSummary } from "../features/job-posting";

function App() {
  const [state, dispatch] = useReducer(flowReducer, initialFlowState);

  return (
    <AppShell step={state.step}>
      {state.job.status === "editing" ? (
        <JobDescriptionForm
          initialText={state.job.text}
          onSubmit={(job) => dispatch({ type: "JOB_SAVED", job })}
        />
      ) : (
        <JobDescriptionSummary job={state.job.value} onEdit={() => dispatch({ type: "JOB_EDIT_REQUESTED" })} />
      )}
    </AppShell>
  );
}

export default App;
