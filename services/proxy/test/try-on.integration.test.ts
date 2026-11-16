// @vitest-environment node
// Task 8.1 — try-on endpoints: R6.1 (one curated style), R6.2 (result available for
// comparison; reset via DELETE), R6.3 (no persistence beyond the temporary job), plus
// cancellation, provider failure mapping, and provider-detail hiding.
import { afterEach, describe, expect, it } from "vitest";
import { parseAnalysisJob, parseApiErrorBody, parseTryOnJob, type TryOnJob } from "../../../packages/contracts/src/index.ts";
import { createSimulatorTryOnProvider } from "../src/providers/simulator.ts";
import { ProviderError, type TryOnProvider } from "../src/providers/types.ts";
import {
  DESKTOP_ORIGIN,
  NEUTRAL_OBSERVATIONS,
  neverResolves,
  postAnalysis,
  providerReturning,
  startProxy,
  syntheticJpeg,
  waitFor,
  type TestProxy,
} from "./helpers.ts";

let proxy: TestProxy | undefined;

afterEach(async () => {
  await proxy?.close();
  proxy = undefined;
});

function tryOnReturning(behavior: TryOnProvider["tryOn"]): TryOnProvider & { calls: number; signals: AbortSignal[] } {
  const provider = {
    calls: 0,
    signals: [] as AbortSignal[],
    tryOn: async (...args: Parameters<TryOnProvider["tryOn"]>) => {
      provider.calls += 1;
      provider.signals.push(args[2]);
      return behavior(...args);
    },
  };
  return provider;
}

const RESULT = { bytes: syntheticJpeg(640, 480, 64), mimeType: "image/jpeg" as const };

async function analysisJobId(target: TestProxy): Promise<string> {
  const created = parseAnalysisJob(await (await postAnalysis(target)).json());
  await waitFor(async () => {
    const job = parseAnalysisJob(await (await fetch(`${target.baseUrl}/v1/analysis-jobs/${created.id}`)).json());
    return job.state === "succeeded" ? true : undefined;
  });
  return created.id;
}

function postTryOn(target: TestProxy, body: unknown) {
  return fetch(`${target.baseUrl}/v1/try-on-jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: DESKTOP_ORIGIN },
    body: JSON.stringify(body),
  });
}

async function untilTerminal(target: TestProxy, id: string): Promise<TryOnJob> {
  return waitFor(async () => {
    const job = parseTryOnJob(await (await fetch(`${target.baseUrl}/v1/try-on-jobs/${id}`)).json());
    return ["succeeded", "failed", "cancelled"].includes(job.state) ? job : undefined;
  });
}

describe("POST /v1/try-on-jobs", () => {
  it("runs the curated style on the consented analysis image and serves the result (R6.1, R6.2)", async () => {
    const tryOn = tryOnReturning(async () => RESULT);
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS), {}, tryOn);
    const analysisId = await analysisJobId(proxy);

    const response = await postTryOn(proxy, { analysisJobId: analysisId, styleId: "navy-blazer" });
    expect(response.status).toBe(202);
    const job = await untilTerminal(proxy, parseTryOnJob(await response.json()).id);
    const result = await fetch(`${proxy.baseUrl}/v1/try-on-jobs/${job.id}/result`, { headers: { Origin: DESKTOP_ORIGIN } });

    expect(job.state).toBe("succeeded");
    expect(result.status).toBe(200);
    expect(result.headers.get("content-type")).toBe("image/jpeg");
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(new Uint8Array(await result.arrayBuffer())).toEqual(RESULT.bytes);
    expect(tryOn.calls).toBe(1);
  });

  it.each([
    ["an unknown style", { styleId: "red-dress" }, 422, "REQUEST_INVALID"],
    ["a missing analysis job", { analysisJobId: "an_000000000000000000000000" }, 404, "JOB_NOT_FOUND"],
    ["a malformed analysis job id", { analysisJobId: "https://elsewhere.example/1" }, 404, "JOB_NOT_FOUND"],
  ])("rejects %s", async (_label, override, status, code) => {
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS), {}, tryOnReturning(async () => RESULT));
    const analysisId = await analysisJobId(proxy);

    const response = await postTryOn(proxy, { analysisJobId: analysisId, styleId: "navy-blazer", ...override });

    expect(response.status).toBe(status);
    expect(parseApiErrorBody(await response.json()).error.code).toBe(code);
  });

  it("refuses to run after the analysis image was discarded", async () => {
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS), {}, tryOnReturning(async () => RESULT));
    const analysisId = await analysisJobId(proxy);
    await fetch(`${proxy.baseUrl}/v1/analysis-jobs/${analysisId}`, { method: "DELETE" });

    const response = await postTryOn(proxy, { analysisJobId: analysisId, styleId: "navy-blazer" });

    expect(parseApiErrorBody(await response.json()).error.code).toBe("JOB_NOT_FOUND");
  });

  it("rejects non-JSON bodies", async () => {
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS), {}, tryOnReturning(async () => RESULT));

    const response = await fetch(`${proxy.baseUrl}/v1/try-on-jobs`, { method: "POST", body: "styleId=navy-blazer" });

    expect(parseApiErrorBody(await response.json()).error.code).toBe("REQUEST_INVALID");
  });
});

describe("try-on lifecycle", () => {
  it("cancels an in-flight try-on and aborts the provider", async () => {
    const tryOn = tryOnReturning((_image, _style, signal) => neverResolves(_image, signal) as never);
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS), { providerTimeoutMs: 10_000 }, tryOn);
    const job = parseTryOnJob(await (await postTryOn(proxy, { analysisJobId: await analysisJobId(proxy), styleId: "navy-blazer" })).json());
    await waitFor(async () => (tryOn.calls ? true : undefined));

    const response = await fetch(`${proxy.baseUrl}/v1/try-on-jobs/${job.id}`, { method: "DELETE" });

    expect(parseTryOnJob(await response.json()).state).toBe("cancelled");
    expect(tryOn.signals[0].aborted).toBe(true);
  });

  it("deletes the stored result on reset so it cannot be fetched again (R6.2, R6.3)", async () => {
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS), {}, tryOnReturning(async () => RESULT));
    const created = parseTryOnJob(await (await postTryOn(proxy, { analysisJobId: await analysisJobId(proxy), styleId: "navy-blazer" })).json());
    await untilTerminal(proxy, created.id);

    await fetch(`${proxy.baseUrl}/v1/try-on-jobs/${created.id}`, { method: "DELETE" });
    const result = await fetch(`${proxy.baseUrl}/v1/try-on-jobs/${created.id}/result`);

    expect(result.status).toBe(404);
  });

  it("purges results with the retention window", async () => {
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS), { jobTtlMs: 60_000 }, tryOnReturning(async () => RESULT));
    const created = parseTryOnJob(await (await postTryOn(proxy, { analysisJobId: await analysisJobId(proxy), styleId: "navy-blazer" })).json());
    await untilTerminal(proxy, created.id);

    proxy.clock.now += 60_001;
    const result = await fetch(`${proxy.baseUrl}/v1/try-on-jobs/${created.id}/result`);

    expect(result.status).toBe(404);
  });

  it.each([
    ["unsuitable-image", "IMAGE_UNSUITABLE"],
    ["rate-limited", "RATE_LIMITED"],
    ["unavailable", "PROCESSING_UNAVAILABLE"],
    ["timeout", "PROCESSING_TIMEOUT"],
  ] as const)("maps provider %s to %s without leaking details", async (kind, code) => {
    const tryOn = tryOnReturning(async () => {
      throw new ProviderError(kind, "cloth-v4 task yc-task-1 at https://provider.invalid/out.jpg");
    });
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS), {}, tryOn);
    const created = parseTryOnJob(await (await postTryOn(proxy, { analysisJobId: await analysisJobId(proxy), styleId: "navy-blazer" })).json());

    const job = await untilTerminal(proxy, created.id);
    const raw = await (await fetch(`${proxy.baseUrl}/v1/try-on-jobs/${created.id}`)).text();

    expect(job.error?.code).toBe(code);
    expect(raw).not.toMatch(/cloth-v4|yc-task|provider\.invalid/);
  });
});

describe("simulator try-on", () => {
  it("returns a deterministic synthetic PNG without network access (R9.2)", async () => {
    const provider = createSimulatorTryOnProvider({ delayMs: 0 });
    const image = { bytes: syntheticJpeg(1280, 720), mimeType: "image/jpeg" as const, width: 1280, height: 720 };

    const first = await provider.tryOn(image, "navy-blazer", new AbortController().signal);
    const second = await provider.tryOn(image, "navy-blazer", new AbortController().signal);

    expect(first.mimeType).toBe("image/png");
    expect(Array.from(first.bytes.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(first.bytes).toEqual(second.bytes);
  });
});
