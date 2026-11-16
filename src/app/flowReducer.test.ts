// Flow transition guards: impossible transitions are ignored (react-ui steering), and
// analysis can start only with current-version consent (task 5.1, R3.1).
import { describe, expect, it } from "vitest";
import type { PreparedImage } from "../features/capture";
import { createConsentRecord } from "../features/consent";
import { validateJobDescription, type JobDescription } from "../features/job-posting";
import jobAnalysisFixture from "../../packages/contracts/fixtures/job-analysis.succeeded.json";
import analysisJobFixture from "../../packages/contracts/fixtures/analysis-job.succeeded.json";
import { parseAnalysisJob, parseJobAnalysis, type TryOnJobId } from "../lib/api/contracts";
import { flowReducer, initialFlowState, type FlowEvent, type FlowState } from "./flowReducer";

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

describe("try-on status in the report (R7.3)", () => {
  const analysisJob = parseAnalysisJob(analysisJobFixture);
  const tryOnId = "to_000000000000000000000000" as TryOnJobId;
  const GENERATED = "2026-11-17T09:00:00.000Z";

  const run = (state: FlowState, ...events: FlowEvent[]) => events.reduce(flowReducer, state);

  function reviewed(): FlowState {
    const consenting: FlowState = { step: "consenting", job: job(), jobContext, image };
    return run(
      consenting,
      { type: "CONSENT_GIVEN", consent: createConsentRecord() },
      { type: "ANALYSIS_SUCCEEDED", jobId: analysisJob.id, result: analysisJob.result! },
    );
  }

  const preview = (styleId: "short-bob" | "neat-updo"): FlowEvent[] => [
    { type: "TRY_ON_STYLE_SELECTED", styleId },
    { type: "TRY_ON_STARTED" },
    { type: "TRY_ON_SUCCEEDED", preview: new Blob(["p"]), jobId: tryOnId },
  ];
  const failedAttempt: FlowEvent[] = [{ type: "TRY_ON_STARTED" }, { type: "TRY_ON_FAILED", code: "PROCESSING_UNAVAILABLE" }];
  const report: FlowEvent = { type: "REPORT_REQUESTED", generatedAt: GENERATED };

  it("keeps a created preview after the try-on screen is closed", () => {
    const state = run(reviewed(), { type: "TRY_ON_OPENED" }, ...preview("short-bob"), { type: "TRY_ON_CLOSED" }, report);

    expect(state).toMatchObject({ step: "report-ready", tryOn: "created", tryOnStyleId: "short-bob" });
  });

  it("keeps it after a reset and after a later attempt failed", () => {
    const state = run(
      reviewed(),
      { type: "TRY_ON_OPENED" },
      ...preview("neat-updo"),
      { type: "TRY_ON_RESET" },
      { type: "TRY_ON_STYLE_SELECTED", styleId: "short-bob" },
      ...failedAttempt,
      report,
    );

    expect(state).toMatchObject({ step: "report-ready", tryOn: "created", tryOnStyleId: "neat-updo" });
  });

  it("names the latest created style", () => {
    const state = run(reviewed(), { type: "TRY_ON_OPENED" }, ...preview("neat-updo"), { type: "TRY_ON_RESET" }, ...preview("short-bob"), report);

    expect(state).toMatchObject({ tryOn: "created", tryOnStyleId: "short-bob" });
  });

  it("keeps it when the report is closed and opened again", () => {
    const first = run(reviewed(), { type: "TRY_ON_OPENED" }, ...preview("short-bob"), report);
    const again = run(first, { type: "REPORT_CLOSED" }, report);

    expect(again).toMatchObject({ step: "report-ready", tryOn: "created", tryOnStyleId: "short-bob" });
  });

  it("reports a failed try-on as unavailable even after the screen is closed", () => {
    const state = run(reviewed(), { type: "TRY_ON_OPENED" }, ...failedAttempt, { type: "TRY_ON_CLOSED" }, report);

    expect(state).toMatchObject({ tryOn: "unavailable", tryOnStyleId: null });
  });

  it("reports no preview when none was made, and forgets it when starting over with a new photo", () => {
    expect(run(reviewed(), report)).toMatchObject({ tryOn: "not-created", tryOnStyleId: null });

    const startedOver = run(reviewed(), { type: "TRY_ON_OPENED" }, ...preview("short-bob"), { type: "TRY_ON_CLOSED" }, { type: "START_OVER" });
    const nextPhoto = run(
      startedOver,
      { type: "IMAGE_PREPARED", image },
      { type: "PHOTO_CONFIRMED" },
      { type: "CONSENT_GIVEN", consent: createConsentRecord() },
      { type: "ANALYSIS_SUCCEEDED", jobId: analysisJob.id, result: analysisJob.result! },
      report,
    );
    expect(nextPhoto).toMatchObject({ step: "report-ready", tryOn: "not-created", tryOnStyleId: null });
  });
});
