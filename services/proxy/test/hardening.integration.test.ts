// @vitest-environment node
// Regression tests for the independent privacy/security review (2026-11-16):
// cascade deletion, cancel-during-upload, global retention caps, post-SOS metadata,
// bounded provider downloads.
import { connect } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { withDeadline } from "../src/jobs/analysisJobs.ts";
import { parseAnalysisJob, parseApiErrorBody, parseTryOnJob } from "../../../packages/contracts/src/index.ts";
import { loadConfig } from "../src/config.ts";
import { stripImageMetadata } from "../src/imageInspect.ts";
import type { TryOnProvider } from "../src/providers/types.ts";
import {
  DESKTOP_ORIGIN,
  NEUTRAL_OBSERVATIONS,
  analysisForm,
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

const tryOnProvider: TryOnProvider = {
  tryOn: async () => ({ bytes: syntheticJpeg(320, 240, 32), mimeType: "image/jpeg" }),
  thumbnail: async () => ({ bytes: syntheticJpeg(160, 160, 32), mimeType: "image/jpeg" }),
};

async function succeededAnalysis(target: TestProxy): Promise<string> {
  const created = parseAnalysisJob(await (await postAnalysis(target)).json());
  await waitFor(async () => {
    const job = parseAnalysisJob(await (await fetch(`${target.baseUrl}/v1/analysis-jobs/${created.id}`)).json());
    return job.state === "succeeded" ? true : undefined;
  });
  return created.id;
}

async function finishedTryOn(target: TestProxy, analysisJobId: string): Promise<string> {
  const response = await fetch(`${target.baseUrl}/v1/try-on-jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: DESKTOP_ORIGIN },
    body: JSON.stringify({ analysisJobId, styleId: "neat-updo" }),
  });
  const id = parseTryOnJob(await response.json()).id;
  await waitFor(async () => {
    const job = parseTryOnJob(await (await fetch(`${target.baseUrl}/v1/try-on-jobs/${id}`)).json());
    return job.state === "succeeded" ? true : undefined;
  });
  return id;
}

describe("try-on results never outlive their analysis job (review finding 1)", () => {
  it("deletes try-on results when the analysis job is deleted", async () => {
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS), {}, tryOnProvider);
    const analysisId = await succeededAnalysis(proxy);
    const tryOnId = await finishedTryOn(proxy, analysisId);

    await fetch(`${proxy.baseUrl}/v1/analysis-jobs/${analysisId}`, { method: "DELETE" });

    expect((await fetch(`${proxy.baseUrl}/v1/try-on-jobs/${tryOnId}/result`)).status).toBe(404);
  });

  it("deletes try-on results when the analysis job expires", async () => {
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS), { jobTtlMs: 60_000 }, tryOnProvider);
    const analysisId = await succeededAnalysis(proxy);
    const tryOnId = await finishedTryOn(proxy, analysisId);

    proxy.clock.now += 60_001;
    proxy.store.sweep();

    expect((await fetch(`${proxy.baseUrl}/v1/try-on-jobs/${tryOnId}/result`)).status).toBe(404);
  });
});

describe("cancel during upload (review finding 2)", () => {
  const KEY = "idem_cancel_0123456789abcdef";

  async function rawPostThenDisconnect(target: TestProxy, headers: Record<string, string> = {}) {
    const request = new Request(`${target.baseUrl}/v1/analysis-jobs`, { method: "POST", body: analysisForm() });
    const body = new Uint8Array(await request.arrayBuffer());
    const { port } = new URL(target.baseUrl);
    const extra = Object.entries(headers).map(([name, value]) => `${name}: ${value}\r\n`).join("");
    await new Promise<void>((resolve) => {
      const socket = connect(Number(port), "127.0.0.1", () => {
        socket.write(
          `POST /v1/analysis-jobs HTTP/1.1\r\nHost: 127.0.0.1\r\n${extra}Content-Type: ${request.headers.get("content-type")}\r\nContent-Length: ${body.length}\r\n\r\n`,
        );
        socket.write(body, () => {
          socket.destroy();
          resolve();
        });
      });
    });
  }

  function cancelByKey(target: TestProxy, key: string) {
    return fetch(`${target.baseUrl}/v1/analysis-jobs`, { method: "DELETE", headers: { "Idempotency-Key": key } });
  }

  it("lets a client that never saw the job ID cancel it with its idempotency key", async () => {
    const provider = providerReturning(neverResolves);
    proxy = await startProxy(provider, { providerTimeoutMs: 10_000 });
    await rawPostThenDisconnect(proxy, { "Idempotency-Key": KEY });
    await waitFor(async () => (proxy!.store.size() === 1 ? true : undefined));

    expect((await cancelByKey(proxy, KEY)).status).toBe(204);

    const [record] = proxy.store.list();
    expect(record.state).toBe("cancelled");
    expect(record.image).toBeNull();
  });

  it("cancels a job whose upload finishes after the cancel arrived, before any provider call", async () => {
    const provider = providerReturning(neverResolves);
    proxy = await startProxy(provider, { providerTimeoutMs: 10_000 });

    expect((await cancelByKey(proxy, KEY)).status).toBe(204);
    await rawPostThenDisconnect(proxy, { "Idempotency-Key": KEY });

    const record = await waitFor(async () => proxy!.store.list()[0]);
    expect(record.state).toBe("cancelled");
    expect(record.image).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(provider.calls).toHaveLength(0);
  });

  it("never creates anything when cancelling by an unknown or malformed key", async () => {
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS));

    expect((await cancelByKey(proxy, "idem_unknown_0123456789abcdef")).status).toBe(204);
    expect((await cancelByKey(proxy, "x")).status).toBe(204);
    expect(proxy.store.size()).toBe(0);
  });
});

describe("global retention caps (review finding 3)", () => {
  it("refuses new jobs when the live-job cap is reached instead of growing memory", async () => {
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS), { maxLiveJobs: 1 });

    expect((await postAnalysis(proxy)).status).toBe(202);
    const refused = await postAnalysis(proxy);

    expect(refused.status).toBe(503);
    expect(parseApiErrorBody(await refused.json()).error.code).toBe("PROCESSING_UNAVAILABLE");
  });

  it("refuses new jobs when retained image bytes would exceed the cap", async () => {
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS), { maxRetainedBytes: 400 });

    expect((await postAnalysis(proxy)).status).toBe(202);
    expect((await postAnalysis(proxy)).status).toBe(503);
  });

  it("bounds request time", async () => {
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS));

    expect(proxy.server.requestTimeout).toBeLessThanOrEqual(30_000);
    expect(proxy.server.headersTimeout).toBeLessThanOrEqual(10_000);
  });
});

describe("metadata after the first scan (review finding 4)", () => {
  const encoder = new TextEncoder();
  const contains = (haystack: Uint8Array, text: string) => new TextDecoder("latin1").decode(haystack).includes(text);

  it("drops APPn segments between scans and any trailer after EOI", () => {
    const jpeg = syntheticJpeg(320, 240, 16);
    const marker = encoder.encode("GPS 48.8584N");
    const app1 = new Uint8Array([0xff, 0xe1, 0, marker.length + 2, ...marker]);
    const secondScan = [0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56];
    const withoutEoi = jpeg.subarray(0, jpeg.length - 2);
    const trailer = encoder.encode("MPF trailer GPS 1.2345E");
    const source = new Uint8Array([...withoutEoi, ...app1, ...secondScan, 0xff, 0xd9, ...trailer]);

    const stripped = stripImageMetadata(source, "image/jpeg");
    if (!stripped) throw new Error("expected a valid JPEG");

    expect(contains(stripped, "GPS")).toBe(false);
    expect(Array.from(stripped.subarray(-2))).toEqual([0xff, 0xd9]);
    expect(contains(stripped, "ÿÚ")).toBe(true);
  });
});

describe("configuration guards (review finding 7)", () => {
  it("does not allow the expiry sweeper to be disabled", () => {
    expect(() => loadConfig({ SWEEP_INTERVAL_MS: "0" })).toThrow();
    expect(loadConfig({}).sweepIntervalMs).toBeGreaterThanOrEqual(1_000);
  });
});

describe("sibling work stops on failure (review finding 3)", () => {
  it("aborts the shared controller when the work fails, so parallel tasks stop", async () => {
    const controller = new AbortController();
    let sibling: AbortSignal | undefined;

    const failing = withDeadline(
      async (signal) => {
        sibling = signal;
        throw new Error("advisor failed");
      },
      controller,
      1_000,
    );

    await expect(failing).rejects.toThrow("advisor failed");
    expect(sibling?.aborted).toBe(true);
  });
});
