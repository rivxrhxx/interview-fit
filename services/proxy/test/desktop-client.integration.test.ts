// @vitest-environment node
// Task 6.2 — the real desktop API client and polling runner against the real proxy
// (simulator provider): end-to-end R4.1, R4.3, and R4.4 over HTTP.
import { afterEach, describe, expect, it } from "vitest";
import { createHttpApiClient } from "../../../src/lib/api/client.ts";
import { createConsentRecord } from "../../../src/features/consent/consent.ts";
import { runAnalysis } from "../../../src/features/analysis/runAnalysis.ts";
import { runTryOn } from "../../../src/features/try-on/runTryOn.ts";
import { createSimulatorProvider, createSimulatorTryOnProvider } from "../src/providers/simulator.ts";
import { neverResolves, providerReturning, startProxy, syntheticJpeg, waitFor, type TestProxy } from "./helpers.ts";

let proxy: TestProxy | undefined;

afterEach(async () => {
  await proxy?.close();
  proxy = undefined;
});

function run(target: TestProxy, options: { timeoutMs?: number; signal?: AbortSignal } = {}) {
  return runAnalysis({
    api: createHttpApiClient({ baseUrl: target.baseUrl }),
    jobDescription: "Account manager. Client meetings happen over video.",
    image: new Blob([syntheticJpeg(1280, 720) as Uint8Array<ArrayBuffer>], { type: "image/jpeg" }),
    consent: createConsentRecord(),
    signal: options.signal ?? new AbortController().signal,
    pollIntervalMs: 10,
    timeoutMs: options.timeoutMs ?? 2_000,
  });
}

describe("desktop client ↔ proxy", () => {
  it("completes an analysis with the deterministic simulator", async () => {
    proxy = await startProxy(createSimulatorProvider({ delayMs: 20, scenario: "success" }));

    const outcome = await run(proxy);

    expect(outcome.status).toBe("succeeded");
    if (outcome.status !== "succeeded") return;
    expect(outcome.result.observations.map((observation) => observation.category)).toEqual([
      "image-clarity",
      "framing",
      "lighting",
      "skin-prep",
      "skin-prep",
      "skin-prep",
      "skin-prep",
    ]);
    expect(outcome.result.observations[0].text).toContain("1280×720");
  });

  it("times out on the client, stops polling, and the backend discards the image (R4.3)", async () => {
    proxy = await startProxy(providerReturning(neverResolves), { providerTimeoutMs: 10_000 });

    const outcome = await run(proxy, { timeoutMs: 100 });

    expect(outcome).toEqual({ status: "failed", code: "PROCESSING_TIMEOUT" });
    const [record] = proxy.store.list();
    expect(record.state).toBe("cancelled");
    expect(record.image).toBeNull();
    expect(record.jobDescription).toBeNull();
  });

  it("cancels on the backend when the desktop aborts (R4.4)", async () => {
    proxy = await startProxy(providerReturning(neverResolves), { providerTimeoutMs: 10_000 });
    const controller = new AbortController();

    const pending = run(proxy, { signal: controller.signal });
    await waitFor(async () => (proxy!.store.size() === 1 ? true : undefined));
    setTimeout(() => controller.abort(), 30);

    expect(await pending).toEqual({ status: "cancelled" });
    const [record] = proxy.store.list();
    expect(record.state).toBe("cancelled");
    expect(record.image).toBeNull();
  });

  it("surfaces simulator outages as a stable code", async () => {
    proxy = await startProxy(createSimulatorProvider({ delayMs: 5, scenario: "unavailable" }));

    expect(await run(proxy)).toEqual({ status: "failed", code: "PROCESSING_UNAVAILABLE" });
  });
});

describe("desktop try-on ↔ proxy (simulator)", () => {
  it("previews the curated style from the consented analysis and deletes the result on reset", async () => {
    proxy = await startProxy(
      createSimulatorProvider({ delayMs: 5, scenario: "success" }),
      {},
      createSimulatorTryOnProvider({ delayMs: 5 }),
    );
    const analysis = await run(proxy);
    if (analysis.status !== "succeeded") throw new Error("analysis should succeed");
    const api = createHttpApiClient({ baseUrl: proxy.baseUrl });
    let tryOnId = "";

    const outcome = await runTryOn({
      api,
      analysisJobId: analysis.jobId,
      styleId: "neat-updo",
      signal: new AbortController().signal,
      pollIntervalMs: 10,
      timeoutMs: 2_000,
      onJobCreated: (id) => (tryOnId = id),
    });

    expect(outcome.status).toBe("succeeded");
    if (outcome.status !== "succeeded") return;
    expect(outcome.preview.type).toBe("image/png");
    expect(outcome.preview.size).toBeGreaterThan(100);

    await api.cancelTryOnJob(tryOnId as never);
    expect((await fetch(`${proxy.baseUrl}/v1/try-on-jobs/${tryOnId}/result`)).status).toBe(404);
  });
});
