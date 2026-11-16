// Task 6.2 — bounded polling: timeout stops polling and requests cleanup (R4.3);
// cancellation stops polling and discards the job reference (R4.4); failures map to codes.
import { describe, expect, it, vi } from "vitest";
import queuedFixture from "../../../packages/contracts/fixtures/analysis-job.queued.json";
import succeededFixture from "../../../packages/contracts/fixtures/analysis-job.succeeded.json";
import { ApiRequestError, type ApiClient } from "../../lib/api/client";
import { parseAnalysisJob, type AnalysisJob } from "../../lib/api/contracts";
import { createConsentRecord } from "../consent";
import { runAnalysis, type RunAnalysisOptions } from "./runAnalysis";

const queued = parseAnalysisJob(queuedFixture);
const processing: AnalysisJob = { ...queued, state: "processing" };
const succeeded = parseAnalysisJob(succeededFixture);

function fakeClock() {
  const clock = { now: 0 };
  return {
    clock,
    now: () => clock.now,
    sleep: vi.fn(async (ms: number, signal: AbortSignal) => {
      if (signal.aborted) throw signal.reason;
      clock.now += ms;
    }),
  };
}

function apiWith(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    createAnalysisJob: vi.fn(async () => queued),
    getAnalysisJob: vi.fn(async () => succeeded),
    cancelAnalysisJob: vi.fn(async () => {}),
    ...overrides,
  } as ApiClient;
}

function options(api: ApiClient, extra: Partial<RunAnalysisOptions> = {}): RunAnalysisOptions {
  const time = fakeClock();
  return {
    api,
    jobDescription: "Consultant",
    image: new Blob(["jpeg"], { type: "image/jpeg" }),
    consent: createConsentRecord(),
    signal: new AbortController().signal,
    pollIntervalMs: 1_000,
    timeoutMs: 10_000,
    now: time.now,
    sleep: time.sleep,
    ...extra,
  };
}

describe("runAnalysis", () => {
  it("uploads once, polls until success, and returns the normalized result", async () => {
    const api = apiWith({ getAnalysisJob: vi.fn().mockResolvedValueOnce(processing).mockResolvedValueOnce(succeeded) });
    const onProgress = vi.fn();

    const outcome = await runAnalysis(options(api, { onProgress }));

    expect(outcome).toEqual({ status: "succeeded", jobId: succeeded.id, result: succeeded.result });
    expect(api.createAnalysisJob).toHaveBeenCalledTimes(1);
    expect(api.getAnalysisJob).toHaveBeenCalledTimes(2);
    expect(onProgress.mock.calls.map(([stage]) => stage)).toEqual(["uploading", "processing"]);
  });

  it("refuses to upload without current-version consent", async () => {
    const api = apiWith();
    const stale = { ...createConsentRecord(), version: "2025-01-01.v0" };

    const outcome = await runAnalysis(options(api, { consent: stale }));

    expect(outcome).toEqual({ status: "failed", code: "CONSENT_REQUIRED" });
    expect(api.createAnalysisJob).not.toHaveBeenCalled();
  });

  it("stops polling at the deadline, requests cleanup, and returns a retryable timeout (R4.3)", async () => {
    const api = apiWith({ getAnalysisJob: vi.fn(async () => processing) });

    const outcome = await runAnalysis(options(api, { pollIntervalMs: 1_000, timeoutMs: 5_000 }));

    expect(outcome).toEqual({ status: "failed", code: "PROCESSING_TIMEOUT" });
    expect(vi.mocked(api.getAnalysisJob).mock.calls.length).toBeLessThanOrEqual(5);
    expect(api.cancelAnalysisJob).toHaveBeenCalledWith(queued.id);
  });

  it("stops polling and cancels the backend job when the user cancels (R4.4)", async () => {
    const controller = new AbortController();
    const api = apiWith({
      getAnalysisJob: vi.fn(async () => {
        controller.abort();
        return processing;
      }),
    });

    const outcome = await runAnalysis(options(api, { signal: controller.signal }));

    expect(outcome).toEqual({ status: "cancelled" });
    expect(api.getAnalysisJob).toHaveBeenCalledTimes(1);
    expect(api.cancelAnalysisJob).toHaveBeenCalledWith(queued.id);
  });

  it("does not create a job if cancelled before upload", async () => {
    const controller = new AbortController();
    controller.abort();
    const api = apiWith();

    expect(await runAnalysis(options(api, { signal: controller.signal }))).toEqual({ status: "cancelled" });
    expect(api.createAnalysisJob).not.toHaveBeenCalled();
  });

  it.each(["RATE_LIMITED", "PROCESSING_UNAVAILABLE", "IMAGE_INVALID", "CONSENT_REQUIRED"] as const)(
    "returns %s when job creation is rejected",
    async (code) => {
      const api = apiWith({ createAnalysisJob: vi.fn(async () => Promise.reject(new ApiRequestError(code))) });

      expect(await runAnalysis(options(api))).toEqual({ status: "failed", code });
      expect(api.getAnalysisJob).not.toHaveBeenCalled();
    },
  );

  it("returns the backend's failure code for a failed job", async () => {
    const failed: AnalysisJob = {
      ...queued,
      state: "failed",
      error: { code: "PROCESSING_UNAVAILABLE", message: "x", retryable: true, correlationId: "req_12345678" },
    };
    const api = apiWith({ getAnalysisJob: vi.fn(async () => failed) });

    expect(await runAnalysis(options(api))).toEqual({ status: "failed", code: "PROCESSING_UNAVAILABLE" });
  });

  it("tolerates one transient polling error but fails and cleans up after repeated errors", async () => {
    const flaky = apiWith({
      getAnalysisJob: vi
        .fn()
        .mockRejectedValueOnce(new ApiRequestError("PROCESSING_UNAVAILABLE"))
        .mockResolvedValueOnce(succeeded),
    });
    expect((await runAnalysis(options(flaky))).status).toBe("succeeded");

    const broken = apiWith({ getAnalysisJob: vi.fn(async () => Promise.reject(new ApiRequestError("INTERNAL_ERROR"))) });
    expect(await runAnalysis(options(broken))).toEqual({ status: "failed", code: "INTERNAL_ERROR" });
    expect(broken.cancelAnalysisJob).toHaveBeenCalledWith(queued.id);
  });
});
