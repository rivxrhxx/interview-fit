// Task 6.2 — desktop API client: first-party base URL only (R4.1), no vendor data (R4.2),
// stable error codes for rate limit, outage, and malformed responses (R8.3).
import { describe, expect, it, vi } from "vitest";
import leakedJob from "../../../packages/contracts/fixtures/leaks/analysis-job.with-provider-fields.json";
import queued from "../../../packages/contracts/fixtures/analysis-job.queued.json";
import rateLimited from "../../../packages/contracts/fixtures/error.rate-limited.json";
import tryOnSucceeded from "../../../packages/contracts/fixtures/try-on-job.succeeded.json";
import jobAnalysis from "../../../packages/contracts/fixtures/job-analysis.succeeded.json";
import { ApiRequestError, createHttpApiClient } from "./client";
import { resolveApiBaseUrl } from "./config";
import { CURRENT_CONSENT_VERSION, type AnalysisJobId, type TryOnJobId } from "./contracts";

const BASE = "http://localhost:8080";
const JOB_ID = queued.id as AnalysisJobId;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function clientWith(fetchImpl: typeof fetch) {
  return createHttpApiClient({ baseUrl: BASE, fetch: fetchImpl });
}

describe("createHttpApiClient", () => {
  it("sends only the posting text and language as JSON for the job analysis (R1.5)", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(jobAnalysis));

    const result = await clientWith(fetchMock).analyzeJob({ jobDescription: "Analyst", locale: "ko" });

    expect(result.jobContext.points).toHaveLength(5);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/v1/job-analyses`);
    expect(init).toMatchObject({ method: "POST", credentials: "omit", redirect: "error" });
    expect(JSON.parse(init.body as string)).toEqual({ jobDescription: "Analyst", locale: "ko" });
  });

  it("maps a malformed job analysis to a stable error", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ...jobAnalysis, jobContext: { summary: "x" } }));

    await expect(clientWith(fetchMock).analyzeJob({ jobDescription: "Analyst" })).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  });

  it("posts consent version, job text, and the normalized image to the first-party backend only (R4.1)", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(queued, 202));
    const image = new Blob(["jpeg-bytes"], { type: "image/jpeg" });

    const job = await clientWith(fetchMock).createAnalysisJob({
      consentVersion: CURRENT_CONSENT_VERSION,
      jobDescription: "Analyst",
      image,
    });

    expect(job.id).toBe(queued.id);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/v1/analysis-jobs`);
    expect(init).toMatchObject({ method: "POST", credentials: "omit", redirect: "error", cache: "no-store" });
    const form = init.body as FormData;
    expect(form.get("consentVersion")).toBe(CURRENT_CONSENT_VERSION);
    expect(form.get("jobDescription")).toBe("Analyst");
    expect(form.get("image")).toBeInstanceOf(Blob);
  });

  it("sends an idempotency key and retries once with the same key after a network failure", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(jsonResponse(queued, 202));

    await clientWith(fetchMock).createAnalysisJob({ consentVersion: "v", jobDescription: "Analyst", image: new Blob(["x"]) });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const keys = fetchMock.mock.calls.map(([, init]) => new Headers((init as RequestInit).headers).get("Idempotency-Key"));
    expect(keys[0]).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
    expect(keys[1]).toBe(keys[0]);
  });

  it("cancels by idempotency key when the upload is aborted before the job ID arrives", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        controller.abort();
        throw new DOMException("aborted", "AbortError");
      }
      return new Response(null, { status: 204 });
    });

    await expect(
      clientWith(fetchMock as unknown as typeof fetch).createAnalysisJob(
        { consentVersion: "v", jobDescription: "Analyst", image: new Blob(["x"]) },
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });

    const [postUrl, postInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const [deleteUrl, deleteInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(postUrl).toBe(`${BASE}/v1/analysis-jobs`);
    expect(deleteUrl).toBe(`${BASE}/v1/analysis-jobs`);
    expect(deleteInit.method).toBe("DELETE");
    expect(new Headers(deleteInit.headers).get("Idempotency-Key")).toBe(new Headers(postInit.headers).get("Idempotency-Key"));
  });

  it("does not retry job creation after an HTTP error response", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(rateLimited, 429));

    await expect(
      clientWith(fetchMock).createAnalysisJob({ consentVersion: "v", jobDescription: "Analyst", image: new Blob(["x"]) }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("drops provider fields that a misbehaving backend might leak (R4.2)", async () => {
    const job = await clientWith(vi.fn(async () => jsonResponse(leakedJob))).getAnalysisJob(JOB_ID);

    expect(JSON.stringify(job)).not.toMatch(/youcam|perfectcorp|provider|https?:\/\/|Bearer/i);
  });

  it("maps error bodies to stable codes and ignores server-provided text", async () => {
    const body = { error: { ...rateLimited.error, message: "upstream YouCam quota exceeded" } };
    const error = await clientWith(vi.fn(async () => jsonResponse(body, 429)))
      .getAnalysisJob(JOB_ID)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).code).toBe("RATE_LIMITED");
    expect((error as ApiRequestError).message).not.toMatch(/YouCam/);
  });

  it("maps an unreachable backend to PROCESSING_UNAVAILABLE", async () => {
    const error = await clientWith(vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))))
      .getAnalysisJob(JOB_ID)
      .catch((caught: unknown) => caught);

    expect((error as ApiRequestError).code).toBe("PROCESSING_UNAVAILABLE");
  });

  it.each([
    ["non-JSON success", new Response("<html>proxy error</html>", { status: 200 })],
    ["contract-violating JSON", jsonResponse({ id: "https://elsewhere.example/1", state: "queued" })],
    ["non-JSON error", new Response("Bad gateway", { status: 502 })],
  ])("maps a %s response to INTERNAL_ERROR", async (_label, response) => {
    const error = await clientWith(vi.fn(async () => response))
      .getAnalysisJob(JOB_ID)
      .catch((caught: unknown) => caught);

    expect((error as ApiRequestError).code).toBe("INTERNAL_ERROR");
  });

  it("propagates cancellation instead of converting it into an error code", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn(async () => Promise.reject(new DOMException("aborted", "AbortError")));

    await expect(clientWith(fetchMock).getAnalysisJob(JOB_ID, controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("sends DELETE to cancel and tolerates an already-removed job", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: { code: "JOB_NOT_FOUND", message: "x", retryable: false, correlationId: "req_12345678" } }, 404));

    await expect(clientWith(fetchMock).cancelAnalysisJob(JOB_ID)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/v1/analysis-jobs/${JOB_ID}`, expect.objectContaining({ method: "DELETE" }));
  });
});

describe("try-on endpoints", () => {
  const TRY_ON_ID = tryOnSucceeded.id as TryOnJobId;
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

  it("posts the curated style for a consented analysis job as JSON", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ...tryOnSucceeded, state: "queued" }, 202));

    const job = await clientWith(fetchMock).createTryOnJob({ analysisJobId: JOB_ID, styleId: "neat-updo" });

    expect(job.styleId).toBe("neat-updo");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/v1/try-on-jobs`);
    expect(JSON.parse(init.body as string)).toEqual({ analysisJobId: JOB_ID, styleId: "neat-updo" });
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
  });

  it("returns the result as an in-memory image blob after checking its type and signature", async () => {
    const fetchMock = vi.fn(async () => new Response(PNG, { status: 200, headers: { "Content-Type": "image/png" } }));

    const blob = await clientWith(fetchMock).getTryOnResult(TRY_ON_ID);

    expect(blob.type).toBe("image/png");
    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/v1/try-on-jobs/${TRY_ON_ID}/result`, expect.objectContaining({ method: "GET" }));
  });

  it.each([
    ["an SVG", new Response("<svg/>", { status: 200, headers: { "Content-Type": "image/svg+xml" } })],
    ["mislabeled bytes", new Response("<html>", { status: 200, headers: { "Content-Type": "image/png" } })],
  ])("rejects %s as the result", async (_label, response) => {
    await expect(clientWith(vi.fn(async () => response)).getTryOnResult(TRY_ON_ID)).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
    });
  });
});

describe("resolveApiBaseUrl", () => {
  it("defaults to the local first-party backend", () => {
    expect(resolveApiBaseUrl(undefined)).toBe("http://localhost:8080");
  });

  it("normalizes a configured HTTPS origin", () => {
    expect(resolveApiBaseUrl("https://api.interview-fit.example/")).toBe("https://api.interview-fit.example");
  });

  it.each(["http://127.0.0.1:8080", "http://localhost:8080", "http://[::1]:8080"])("allows plain http for loopback %s", (value) => {
    expect(resolveApiBaseUrl(value)).toBe(new URL(value).origin);
  });

  it.each(["javascript:alert(1)", "file:///etc/passwd", "not a url", "https://user:pass@api.example", "http://api.example.com"])(
    "rejects %s",
    (value) => {
      expect(() => resolveApiBaseUrl(value)).toThrow();
    },
  );
});
