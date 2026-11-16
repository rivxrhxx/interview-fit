// @vitest-environment node
// Task 6.2 — proxy integration suite for R4.1, R4.3 (timeout + cleanup), R4.4 (cancel),
// plus rate limiting, malformed provider responses, validation, and log redaction.
import { afterEach, describe, expect, it } from "vitest";
import { parseAnalysisJob, parseApiErrorBody, type AnalysisJob } from "../../../packages/contracts/src/index.ts";
import { ProviderError } from "../src/providers/types.ts";
import {
  DESKTOP_ORIGIN,
  NEUTRAL_OBSERVATIONS,
  analysisForm,
  neverResolves,
  postAnalysis,
  providerReturning,
  startProxy,
  syntheticJpeg,
  syntheticPng,
  waitFor,
  type TestProxy,
} from "./helpers.ts";

let proxy: TestProxy | undefined;

afterEach(async () => {
  await proxy?.close();
  proxy = undefined;
});

async function getJob(id: string): Promise<AnalysisJob> {
  const response = await fetch(`${proxy!.baseUrl}/v1/analysis-jobs/${id}`, { headers: { Origin: DESKTOP_ORIGIN } });
  expect(response.status).toBe(200);
  return parseAnalysisJob(await response.json());
}

async function untilTerminal(id: string): Promise<AnalysisJob> {
  return waitFor(async () => {
    const job = await getJob(id);
    return ["succeeded", "failed", "cancelled"].includes(job.state) ? job : undefined;
  });
}

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  const body = await response.json();
  expect(parseApiErrorBody(body).error.code).toBe(code);
  expect(JSON.stringify(body)).not.toMatch(/stack|at \/|node:|youcam|https?:\/\//i);
}

describe("POST /v1/analysis-jobs", () => {
  it("accepts a consented upload and completes with a normalized result (R4.1)", async () => {
    const provider = providerReturning(async () => NEUTRAL_OBSERVATIONS);
    proxy = await startProxy(provider);

    const response = await postAnalysis(proxy);

    expect(response.status).toBe(202);
    expect(response.headers.get("access-control-allow-origin")).toBe(DESKTOP_ORIGIN);
    expect(response.headers.get("x-powered-by")).toBeNull();
    const created = parseAnalysisJob(await response.json());
    expect(created.state).toMatch(/queued|processing/);

    const done = await untilTerminal(created.id);
    expect(done.state).toBe("succeeded");
    expect(done.result?.observations).toEqual(NEUTRAL_OBSERVATIONS);
    expect(provider.calls[0].image.mimeType).toBe("image/jpeg");
  });

  it.each([
    ["missing", null],
    ["stale", "2025-01-01.v0"],
  ])("rejects a %s consent version before storing anything (R3.1)", async (_label, consentVersion) => {
    const provider = providerReturning(async () => NEUTRAL_OBSERVATIONS);
    proxy = await startProxy(provider);

    await expectError(await postAnalysis(proxy, analysisForm({ consentVersion })), 403, "CONSENT_REQUIRED");
    expect(provider.calls).toHaveLength(0);
    expect(proxy.store.size()).toBe(0);
  });

  it.each([
    ["a GIF", new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0]), 422, "IMAGE_INVALID"],
    ["a missing image", null, 422, "IMAGE_INVALID"],
    ["a truncated JPEG", new Uint8Array([0xff, 0xd8, 0xff]), 422, "IMAGE_INVALID"],
    ["a 20 MP PNG", syntheticPng(5000, 4000), 413, "IMAGE_TOO_LARGE"],
  ])("re-validates images: rejects %s", async (_label, image, status, code) => {
    const provider = providerReturning(async () => NEUTRAL_OBSERVATIONS);
    proxy = await startProxy(provider);

    await expectError(await postAnalysis(proxy, analysisForm({ image })), status, code);
    expect(provider.calls).toHaveLength(0);
  });

  it("rejects bodies over the upload limit without buffering them", async () => {
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS));
    const big = syntheticJpeg(640, 480, 10 * 1024 * 1024 + 1);

    await expectError(await postAnalysis(proxy, analysisForm({ image: big })), 413, "IMAGE_TOO_LARGE");
  });

  it.each([
    ["empty", "   "],
    ["too long", "a".repeat(12_001)],
  ])("rejects a job description that is %s (R1.1, R1.2)", async (_label, jobDescription) => {
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS));

    await expectError(await postAnalysis(proxy, analysisForm({ jobDescription })), 422, "JOB_DESCRIPTION_INVALID");
  });

  it("rate limits job creation per client with a retry hint", async () => {
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS), { rateLimitPerMinute: 2 });

    expect((await postAnalysis(proxy)).status).toBe(202);
    expect((await postAnalysis(proxy)).status).toBe(202);
    const limited = await postAnalysis(proxy);

    expect(limited.headers.get("retry-after")).toMatch(/^\d+$/);
    await expectError(limited, 429, "RATE_LIMITED");
  });
});

describe("provider failures", () => {
  it("times out a stalled provider, aborts it, and wipes the image (R4.3)", async () => {
    const provider = providerReturning(neverResolves);
    proxy = await startProxy(provider, { providerTimeoutMs: 50 });

    const created = parseAnalysisJob(await (await postAnalysis(proxy)).json());
    const done = await untilTerminal(created.id);

    expect(done.state).toBe("failed");
    expect(done.error).toMatchObject({ code: "PROCESSING_TIMEOUT", retryable: true });
    expect(provider.calls[0].signal.aborted).toBe(true);
    expect(proxy.store.peek(created.id)?.image).toBeNull();
  });

  it.each([
    ["rate-limited", "RATE_LIMITED"],
    ["unavailable", "PROCESSING_UNAVAILABLE"],
    ["invalid-image", "IMAGE_INVALID"],
    ["malformed-response", "INTERNAL_ERROR"],
  ] as const)("maps provider %s to %s without leaking details", async (kind, code) => {
    proxy = await startProxy(
      providerReturning(async () => {
        throw new ProviderError(kind, "upstream said: task_id=abc123 at https://provider.invalid");
      }),
    );

    const created = parseAnalysisJob(await (await postAnalysis(proxy)).json());
    const response = await fetch(`${proxy.baseUrl}/v1/analysis-jobs/${created.id}`);
    const done = await untilTerminal(created.id);

    expect(done.error?.code).toBe(code);
    expect(JSON.stringify(await response.json())).not.toMatch(/task_id|provider\.invalid|upstream/);
    expect(proxy.store.peek(created.id)?.image).toBeNull();
  });

  it("treats a provider payload that is not a valid observation list as malformed", async () => {
    proxy = await startProxy(
      providerReturning(async () => [{ id: "x", category: "attractiveness", text: "score 7/10" }] as never),
    );

    const created = parseAnalysisJob(await (await postAnalysis(proxy)).json());
    const done = await untilTerminal(created.id);

    expect(done.state).toBe("failed");
    expect(done.error?.code).toBe("INTERNAL_ERROR");
  });
});

describe("DELETE /v1/analysis-jobs/:id", () => {
  it("cancels an in-flight job, aborts the provider, and discards the image (R4.4)", async () => {
    const provider = providerReturning(neverResolves);
    proxy = await startProxy(provider, { providerTimeoutMs: 10_000 });
    const created = parseAnalysisJob(await (await postAnalysis(proxy)).json());
    await waitFor(async () => (provider.calls.length ? true : undefined));

    const response = await fetch(`${proxy.baseUrl}/v1/analysis-jobs/${created.id}`, { method: "DELETE" });

    expect(response.status).toBe(200);
    expect(parseAnalysisJob(await response.json()).state).toBe("cancelled");
    expect(provider.calls[0].signal.aborted).toBe(true);
    expect(proxy.store.peek(created.id)?.image).toBeNull();
    expect((await getJob(created.id)).state).toBe("cancelled");
  });

  it("returns JOB_NOT_FOUND for unknown or malformed IDs", async () => {
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS));

    await expectError(
      await fetch(`${proxy.baseUrl}/v1/analysis-jobs/an_000000000000000000000000`, { method: "DELETE" }),
      404,
      "JOB_NOT_FOUND",
    );
    await expectError(await fetch(`${proxy.baseUrl}/v1/analysis-jobs/..%2F..%2Fetc`), 404, "JOB_NOT_FOUND");
  });
});

describe("cleanup", () => {
  it("purges jobs and image bytes after the retention window", async () => {
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS), { jobTtlMs: 60_000 });
    const created = parseAnalysisJob(await (await postAnalysis(proxy)).json());
    await untilTerminal(created.id);
    const record = proxy.store.peek(created.id)!;
    const imageBuffer = record.image!;

    proxy.clock.now += 60_001;
    proxy.store.sweep();

    expect(proxy.store.peek(created.id)).toBeUndefined();
    expect(imageBuffer.every((byte) => byte === 0)).toBe(true);
    await expectError(await fetch(`${proxy.baseUrl}/v1/analysis-jobs/${created.id}`), 404, "JOB_NOT_FOUND");
  });
});

describe("transport hygiene", () => {
  it("never logs job descriptions, image bytes, job IDs, or headers", async () => {
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS));
    const secretPhrase = "UNIQUE-JOB-TEXT-7731";
    const created = parseAnalysisJob(
      await (await postAnalysis(proxy, analysisForm({ jobDescription: `Role ${secretPhrase}` }))).json(),
    );
    await untilTerminal(created.id);

    const logged = JSON.stringify(proxy.logger.entries);
    expect(proxy.logger.entries.length).toBeGreaterThan(0);
    expect(logged).not.toContain(secretPhrase);
    expect(logged).not.toContain(created.id);
    expect(logged).not.toMatch(/tauri:\/\/|origin|content-type|multipart/i);
  });

  it("answers CORS preflight only for allowed desktop origins", async () => {
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS));

    const allowed = await fetch(`${proxy.baseUrl}/v1/analysis-jobs`, {
      method: "OPTIONS",
      headers: { Origin: DESKTOP_ORIGIN, "Access-Control-Request-Method": "POST" },
    });
    const denied = await fetch(`${proxy.baseUrl}/v1/analysis-jobs`, {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "POST" },
    });

    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe(DESKTOP_ORIGIN);
    expect(denied.status).toBe(403);
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("returns neutral errors for unknown routes and methods", async () => {
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS));

    await expectError(await fetch(`${proxy.baseUrl}/v1/unknown`), 404, "JOB_NOT_FOUND");
    const wrongMethod = await fetch(`${proxy.baseUrl}/v1/analysis-jobs`, { method: "PUT" });
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get("allow")).toBe("POST, OPTIONS");
  });
});
