// Flow transition guards: impossible transitions are ignored (react-ui steering), and
// analysis can start only with current-version consent (task 5.1, R3.1).
import { describe, expect, it } from "vitest";
import type { PreparedImage } from "../features/capture";
import { createConsentRecord } from "../features/consent";
import { validateJobDescription, type JobDescription } from "../features/job-posting";
import jobAnalysisFixture from "../../packages/contracts/fixtures/job-analysis.succeeded.json";
import { parseJobAnalysis } from "../lib/api/contracts";
import { flowReducer, initialFlowState, type FlowState } from "./flowReducer";

const jobContext = parseJobAnalysis(jobAnalysisFixture).jobContext;

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

  it("offers a photo only after the posting has been analyzed (R1.4)", () => {
    const saved = flowReducer(initialFlowState, { type: "JOB_SAVED", job: job() });
    expect(saved).toMatchObject({ step: "job-reviewed", insight: { status: "loading", attempt: 1 } });
    expect(flowReducer(saved, { type: "IMAGE_PREPARED", image })).toBe(saved);

    const ready = flowReducer(saved, { type: "JOB_ANALYZED", jobContext });
    expect(flowReducer(ready, { type: "IMAGE_PREPARED", image })).toMatchObject({ step: "image-ready", jobContext });
  });

  it("retries a failed job analysis and lets the user edit the posting", () => {
    const saved = flowReducer(initialFlowState, { type: "JOB_SAVED", job: job() });
    const failed = flowReducer(saved, { type: "JOB_ANALYSIS_FAILED", code: "PROCESSING_UNAVAILABLE" });

    expect(failed).toMatchObject({ insight: { status: "failed", code: "PROCESSING_UNAVAILABLE" } });
    expect(flowReducer(failed, { type: "JOB_ANALYSIS_RETRIED" })).toMatchObject({ insight: { status: "loading", attempt: 2 } });
    expect(flowReducer(failed, { type: "JOB_EDIT_REQUESTED" })).toEqual({ step: "draft", text: "Product manager" });
  });

  it("ignores a late analysis result once the analysis is no longer loading", () => {
    const ready = flowReducer(flowReducer(initialFlowState, { type: "JOB_SAVED", job: job() }), { type: "JOB_ANALYZED", jobContext });
    expect(flowReducer(ready, { type: "JOB_ANALYSIS_FAILED", code: "INTERNAL_ERROR" })).toBe(ready);
  });

  it("ignores consent events outside the consent step", () => {
    const state: FlowState = { step: "image-ready", job: job(), jobContext, image };
    expect(flowReducer(state, { type: "CONSENT_GIVEN", consent: createConsentRecord() })).toBe(state);
  });

  it("rejects consent recorded for a different version", () => {
    const state: FlowState = { step: "consenting", job: job(), jobContext, image };
    const stale = { ...createConsentRecord(), version: "2025-01-01.v0" };

    expect(flowReducer(state, { type: "CONSENT_GIVEN", consent: stale })).toBe(state);
  });

  it("drops the image when consent is declined", () => {
    const state: FlowState = { step: "consenting", job: job(), jobContext, image };

    const next = flowReducer(state, { type: "CONSENT_DECLINED" });

    expect(next.step).toBe("job-reviewed");
    expect(next).not.toHaveProperty("image");
    expect(next).toMatchObject({ notice: "consent-declined" });
  });
});
