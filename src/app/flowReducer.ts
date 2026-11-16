import type { PreparedImage } from "../features/capture";
import type { JobDescription } from "../features/job-posting";

export type JobDraft = { status: "editing"; text: string } | { status: "saved"; value: JobDescription };

export type FlowState =
  | { step: "draft"; job: JobDraft }
  | { step: "image-ready"; job: JobDescription; image: PreparedImage };

export type FlowEvent =
  | { type: "JOB_SAVED"; job: JobDescription }
  | { type: "JOB_EDIT_REQUESTED" }
  | { type: "IMAGE_PREPARED"; image: PreparedImage }
  | { type: "IMAGE_DISCARDED" };

export const initialFlowState: FlowState = { step: "draft", job: { status: "editing", text: "" } };

/** Pure transition function. Events that are not valid for the current step are ignored. */
export function flowReducer(state: FlowState, event: FlowEvent): FlowState {
  switch (state.step) {
    case "draft":
      switch (event.type) {
        case "JOB_SAVED":
          return { step: "draft", job: { status: "saved", value: event.job } };
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
          return { step: "draft", job: { status: "saved", value: state.job } };
        default:
          return state;
      }
  }
}
