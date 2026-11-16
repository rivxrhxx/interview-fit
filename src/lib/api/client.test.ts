// Task 6.2 — desktop API client: first-party base URL only (R4.1), no vendor data (R4.2),
// stable error codes for rate limit, outage, and malformed responses (R8.3).
import { describe, expect, it, vi } from "vitest";
import leakedJob from "../../../packages/contracts/fixtures/leaks/analysis-job.with-provider-fields.json";
import queued from "../../../packages/contracts/fixtures/analysis-job.queued.json";
import rateLimited from "../../../packages/contracts/fixtures/error.rate-limited.json";
import { ApiRequestError, createHttpApiClient } from "./client";
import { resolveApiBaseUrl } from "./config";
import type { AnalysisJobId } from "./contracts";

const BASE = "http://localhost:8080";
const JOB_ID = queued.id as AnalysisJobId;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function clientWith(fetchImpl: typeof fetch) {
  return createHttpApiClient({ baseUrl: BASE, fetch: fetchImpl });
}

describe("createHttpApiClient", () => {
  it("posts consent version, job text, and the normalized image to the first-party backend only (R4.1)", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(queued, 202));
    const image = new Blob(["jpeg-bytes"], { type: "image/jpeg" });

    const job = await clientWith(fetchMock).createAnalysisJob({
      consentVersion: "2026-11-16.v1",
      jobDescription: "Analyst",
      image,
    });

    expect(job.id).toBe(queued.id);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/v1/analysis-jobs`);
    expect(init).toMatchObject({ method: "POST", credentials: "omit", redirect: "error", cache: "no-store" });
    const form = init.body as FormData;
    expect(form.get("consentVersion")).toBe("2026-11-16.v1");
    expect(form.get("jobDescription")).toBe("Analyst");
    expect(form.get("image")).toBeInstanceOf(Blob);
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

describe("resolveApiBaseUrl", () => {
  it("defaults to the local first-party backend", () => {
    expect(resolveApiBaseUrl(undefined)).toBe("http://localhost:8080");
  });

  it("normalizes a configured HTTPS origin", () => {
    expect(resolveApiBaseUrl("https://api.interview-fit.example/")).toBe("https://api.interview-fit.example");
  });

  it.each(["javascript:alert(1)", "file:///etc/passwd", "not a url", "https://user:pass@api.example"])(
    "rejects %s",
    (value) => {
      expect(() => resolveApiBaseUrl(value)).toThrow();
    },
  );
});
