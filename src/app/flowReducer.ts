import type { PreparedImage } from "../features/capture";
import { isConsentCurrent, type ConsentRecord } from "../features/consent";
import type { JobDescription } from "../features/job-posting";

export type JobDraft = { status: "editing"; text: string } | { status: "saved"; value: JobDescription };

export type DraftNotice = "consent-declined";

export type FlowState =
  | { step: "draft"; job: JobDraft; notice?: DraftNotice }
  | { step: "image-ready"; job: JobDescription; image: PreparedImage }
  | { step: "consenting"; job: JobDescription; image: PreparedImage }
  | { step: "analyzing"; job: JobDescription; image: PreparedImage; consent: ConsentRecord };

export type FlowEvent =
  | { type: "JOB_SAVED"; job: JobDescription }
  | { type: "JOB_EDIT_REQUESTED" }
  | { type: "IMAGE_PREPARED"; image: PreparedImage }
  | { type: "IMAGE_DISCARDED" }
  | { type: "PHOTO_CONFIRMED" }
  | { type: "CONSENT_GIVEN"; consent: ConsentRecord }
  | { type: "CONSENT_DECLINED" }
  | { type: "ANALYSIS_CANCELLED" };

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
            ? { step: "analyzing", job: state.job, image: state.image, consent: event.consent }
            : state;
        case "CONSENT_DECLINED":
          // Declining discards the image without sending anything (R3.2).
          return { step: "draft", job: { status: "saved", value: state.job }, notice: "consent-declined" };
        default:
          return state;
      }
    case "analyzing":
      switch (event.type) {
        case "ANALYSIS_CANCELLED":
          // Return to the last safe state; consent must be given again before another upload.
          return { step: "image-ready", job: state.job, image: state.image };
        default:
          return state;
      }
  }
}
