import type { JobDescription } from "../features/job-posting";

export type JobDraft = { status: "editing"; text: string } | { status: "saved"; value: JobDescription };

export type FlowState = { step: "draft"; job: JobDraft };

export type FlowEvent = { type: "JOB_SAVED"; job: JobDescription } | { type: "JOB_EDIT_REQUESTED" };

export const initialFlowState: FlowState = { step: "draft", job: { status: "editing", text: "" } };

export function flowReducer(state: FlowState, event: FlowEvent): FlowState {
  switch (event.type) {
    case "JOB_SAVED":
      return { ...state, job: { status: "saved", value: event.job } };
    case "JOB_EDIT_REQUESTED":
      if (state.job.status !== "saved") return state;
      return { ...state, job: { status: "editing", text: state.job.value.text } };
  }
}
