// Flow transition guards: impossible transitions are ignored (react-ui steering), and
// analysis can start only with current-version consent (task 5.1, R3.1).
import { describe, expect, it } from "vitest";
import type { PreparedImage } from "../features/capture";
import { createConsentRecord } from "../features/consent";
import { validateJobDescription, type JobDescription } from "../features/job-posting";
import { flowReducer, initialFlowState, type FlowState } from "./flowReducer";

function job(): JobDescription {
  const result = validateJobDescription("Product manager");
  if (!result.ok) throw new Error("fixture must be valid");
  return result.value;
}

const image: PreparedImage = { blob: new Blob(["x"]), source: "upload" };

describe("flowReducer", () => {
  it("ignores image events before a job description is saved", () => {
    expect(flowReducer(initialFlowState, { type: "IMAGE_PREPARED", image })).toBe(initialFlowState);
  });

  it("ignores consent events outside the consent step", () => {
    const state: FlowState = { step: "image-ready", job: job(), image };
    expect(flowReducer(state, { type: "CONSENT_GIVEN", consent: createConsentRecord() })).toBe(state);
  });

  it("rejects consent recorded for a different version", () => {
    const state: FlowState = { step: "consenting", job: job(), image };
    const stale = { ...createConsentRecord(), version: "2025-01-01.v0" };

    expect(flowReducer(state, { type: "CONSENT_GIVEN", consent: stale })).toBe(state);
  });

  it("drops the image when consent is declined", () => {
    const state: FlowState = { step: "consenting", job: job(), image };

    const next = flowReducer(state, { type: "CONSENT_DECLINED" });

    expect(next.step).toBe("draft");
    expect(next).not.toHaveProperty("image");
    expect(next).toMatchObject({ notice: "consent-declined" });
  });
});
