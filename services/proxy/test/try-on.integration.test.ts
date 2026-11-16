// @vitest-environment node
// Task 8.1 — try-on endpoints: R6.1 (one curated style), R6.2 (result available for
// comparison; reset via DELETE), R6.3 (no persistence beyond the temporary job), plus
// cancellation, provider failure mapping, and provider-detail hiding.
import { connect, type Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { parseAnalysisJob, parseApiErrorBody, parseTryOnJob, type TryOnJob } from "../../../packages/contracts/src/index.ts";
import { stripImageMetadata } from "../src/imageInspect.ts";
import { createSimulatorTryOnProvider } from "../src/providers/simulator.ts";
import { ProviderError, type TryOnProvider, type TryOnResult } from "../src/providers/types.ts";
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

function tryOnReturning(behavior: TryOnProvider["tryOn"]): TryOnProvider & { calls: number; signals: AbortSignal[] } {
  const provider = {
    calls: 0,
    signals: [] as AbortSignal[],
    tryOn: async (...args: Parameters<TryOnProvider["tryOn"]>) => {
      provider.calls += 1;
      provider.signals.push(args[2]);
      return behavior(...args);
    },
    thumbnail: createSimulatorTryOnProvider({ delayMs: 0 }).thumbnail,
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

    const response = await postTryOn(proxy, { analysisJobId: analysisId, styleId: "neat-updo" });
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

    const response = await postTryOn(proxy, { analysisJobId: analysisId, styleId: "neat-updo", ...override });

    expect(response.status).toBe(status);
    expect(parseApiErrorBody(await response.json()).error.code).toBe(code);
  });

  it("refuses to run after the analysis image was discarded", async () => {
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS), {}, tryOnReturning(async () => RESULT));
    const analysisId = await analysisJobId(proxy);
    await fetch(`${proxy.baseUrl}/v1/analysis-jobs/${analysisId}`, { method: "DELETE" });

    const response = await postTryOn(proxy, { analysisJobId: analysisId, styleId: "neat-updo" });

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
    const job = parseTryOnJob(await (await postTryOn(proxy, { analysisJobId: await analysisJobId(proxy), styleId: "neat-updo" })).json());
    await waitFor(async () => (tryOn.calls ? true : undefined));

    const response = await fetch(`${proxy.baseUrl}/v1/try-on-jobs/${job.id}`, { method: "DELETE" });

    expect(parseTryOnJob(await response.json()).state).toBe("cancelled");
    expect(tryOn.signals[0].aborted).toBe(true);
  });

  it("deletes the stored result on reset so it cannot be fetched again (R6.2, R6.3)", async () => {
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS), {}, tryOnReturning(async () => RESULT));
    const created = parseTryOnJob(await (await postTryOn(proxy, { analysisJobId: await analysisJobId(proxy), styleId: "neat-updo" })).json());
    await untilTerminal(proxy, created.id);

    await fetch(`${proxy.baseUrl}/v1/try-on-jobs/${created.id}`, { method: "DELETE" });
    const result = await fetch(`${proxy.baseUrl}/v1/try-on-jobs/${created.id}/result`);

    expect(result.status).toBe(404);
  });

  it("purges results with the retention window", async () => {
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS), { jobTtlMs: 60_000 }, tryOnReturning(async () => RESULT));
    const created = parseTryOnJob(await (await postTryOn(proxy, { analysisJobId: await analysisJobId(proxy), styleId: "neat-updo" })).json());
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
    const created = parseTryOnJob(await (await postTryOn(proxy, { analysisJobId: await analysisJobId(proxy), styleId: "neat-updo" })).json());

    const job = await untilTerminal(proxy, created.id);
    const raw = await (await fetch(`${proxy.baseUrl}/v1/try-on-jobs/${created.id}`)).text();

    expect(job.error?.code).toBe(code);
    expect(raw).not.toMatch(/cloth-v4|yc-task|provider\.invalid/);
  });
});

describe("memory limit for try-ons (R4.6, review: 500-byte limit held 666 bytes)", () => {
  /** Size of the analysis image the backend keeps (the default test photo after metadata removal). */
  const PHOTO = stripImageMetadata(syntheticJpeg(), "image/jpeg")!.length;
  /** A try-on reserves its private copy of the photo plus a result of about the same size. */
  const RESERVATION = 2 * PHOTO;

  function sampleRetained(target: TestProxy) {
    const samples: number[] = [];
    const timer = setInterval(() => samples.push(target.retainedBytes()), 1);
    return { samples, stop: () => clearInterval(timer) };
  }

  it("refuses to start when the reservation would exceed the limit, before any provider call", async () => {
    const tryOn = tryOnReturning(async () => RESULT);
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS), { maxRetainedBytes: PHOTO + RESERVATION - 1 }, tryOn);
    const analysisId = await analysisJobId(proxy);

    const response = await postTryOn(proxy, { analysisJobId: analysisId, styleId: "neat-updo" });

    expect(response.status).toBe(503);
    expect(parseApiErrorBody(await response.json()).error.code).toBe("PROCESSING_UNAVAILABLE");
    expect(tryOn.calls).toBe(0);
    expect(proxy.retainedBytes()).toBe(PHOTO);
  });

  it("rechecks the actual result size and discards a result that does not fit", async () => {
    const limit = PHOTO + RESERVATION;
    const oversized = { bytes: syntheticJpeg(640, 480, RESERVATION), mimeType: "image/jpeg" as const };
    const tryOn = tryOnReturning(async () => oversized);
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS), { maxRetainedBytes: limit }, tryOn);
    const analysisId = await analysisJobId(proxy);
    const retained = sampleRetained(proxy);

    const created = parseTryOnJob(await (await postTryOn(proxy, { analysisJobId: analysisId, styleId: "neat-updo" })).json());
    const job = await untilTerminal(proxy, created.id);
    retained.stop();

    expect(job.state).toBe("failed");
    expect(job.error?.code).toBe("PROCESSING_UNAVAILABLE");
    expect(oversized.bytes.every((byte) => byte === 0)).toBe(true);
    expect((await fetch(`${proxy.baseUrl}/v1/try-on-jobs/${created.id}/result`)).status).toBe(404);
    expect(Math.max(...retained.samples, proxy.retainedBytes())).toBeLessThanOrEqual(limit);
    expect(proxy.logger.entries).toContainEqual(expect.objectContaining({ event: "try_on_result_over_budget" }));
  });

  it("never holds more than the limit across repeated try-ons", async () => {
    const limit = 500;
    const tryOn = tryOnReturning(async () => ({ bytes: syntheticJpeg(640, 480, 300), mimeType: "image/jpeg" as const }));
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS), { maxRetainedBytes: limit }, tryOn);
    const analysisId = await analysisJobId(proxy);
    const retained = sampleRetained(proxy);

    for (const styleId of ["neat-updo", "short-bob", "side-swept-cut"]) {
      const response = await postTryOn(proxy, { analysisJobId: analysisId, styleId });
      if (response.status === 202) await untilTerminal(proxy, parseTryOnJob(await response.json()).id);
    }
    retained.stop();

    expect(Math.max(...retained.samples, proxy.retainedBytes())).toBeLessThanOrEqual(limit);
  });

  it("frees the reservation when a try-on finishes, fails, or is cancelled", async () => {
    const tryOn = tryOnReturning(async () => {
      throw new ProviderError("unavailable");
    });
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS), {}, tryOn);
    const analysisId = await analysisJobId(proxy);

    const created = parseTryOnJob(await (await postTryOn(proxy, { analysisJobId: analysisId, styleId: "neat-updo" })).json());
    await untilTerminal(proxy, created.id);

    expect(proxy.retainedBytes()).toBe(PHOTO);
  });

  it("keeps one try-on in progress per analysis: a new style replaces the one still running", async () => {
    const tryOn = tryOnReturning((_image, _style, signal) => neverResolves(_image, signal) as never);
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS), { providerTimeoutMs: 10_000 }, tryOn);
    const analysisId = await analysisJobId(proxy);

    const first = parseTryOnJob(await (await postTryOn(proxy, { analysisJobId: analysisId, styleId: "neat-updo" })).json());
    await waitFor(async () => (tryOn.calls === 1 ? true : undefined));
    const second = await postTryOn(proxy, { analysisJobId: analysisId, styleId: "short-bob" });

    expect(second.status).toBe(202);
    expect(parseTryOnJob(await (await fetch(`${proxy.baseUrl}/v1/try-on-jobs/${first.id}`)).json()).state).toBe("cancelled");
    expect(tryOn.signals[0].aborted).toBe(true);
    expect(proxy.retainedBytes()).toBe(PHOTO + RESERVATION);
  });

  it("caps try-ons in progress across analyses", async () => {
    const tryOn = tryOnReturning((_image, _style, signal) => neverResolves(_image, signal) as never);
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS), { providerTimeoutMs: 10_000, maxActiveTryOns: 1 }, tryOn);
    const [firstAnalysis, secondAnalysis] = [await analysisJobId(proxy), await analysisJobId(proxy)];

    expect((await postTryOn(proxy, { analysisJobId: firstAnalysis, styleId: "neat-updo" })).status).toBe(202);
    const refused = await postTryOn(proxy, { analysisJobId: secondAnalysis, styleId: "neat-updo" });

    expect(refused.status).toBe(503);
    expect(parseApiErrorBody(await refused.json()).error.code).toBe("PROCESSING_UNAVAILABLE");
    expect(tryOn.calls).toBe(1);
  });
});

describe("cancelling a try-on before its ID is known (R4.5)", () => {
  const KEY = "idem_tryon_0123456789abcdef";
  const hanging = () => tryOnReturning((_image, _style, signal) => neverResolves(_image, signal) as never);

  function postTryOnWithKey(target: TestProxy, body: unknown, key = KEY) {
    return fetch(`${target.baseUrl}/v1/try-on-jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: DESKTOP_ORIGIN, "Idempotency-Key": key },
      body: JSON.stringify(body),
    });
  }

  function cancelByKey(target: TestProxy, key = KEY) {
    return fetch(`${target.baseUrl}/v1/try-on-jobs`, { method: "DELETE", headers: { "Idempotency-Key": key } });
  }

  /**
   * Opens a raw connection, sends the headers and `sent` bytes of the JSON body, then
   * closes it without reading the response (the desktop aborting mid-request).
   */
  function rawPostThenDisconnect(target: TestProxy, body: unknown, sent = Number.POSITIVE_INFINITY) {
    const payload = Buffer.from(JSON.stringify(body));
    const { port } = new URL(target.baseUrl);
    return new Promise<void>((resolve) => {
      const socket = connect(Number(port), "127.0.0.1", () => {
        socket.write(
          `POST /v1/try-on-jobs HTTP/1.1\r\nHost: 127.0.0.1\r\nIdempotency-Key: ${KEY}\r\nContent-Type: application/json\r\nContent-Length: ${payload.length}\r\n\r\n`,
        );
        socket.write(payload.subarray(0, Math.min(sent, payload.length)), () => {
          socket.destroy();
          resolve();
        });
      });
    });
  }

  /** Sends a request's headers now and its body only when `finish` is called; resolves with the response body. */
  function heldPost(target: TestProxy, path: string, contentType: string, body: Uint8Array) {
    const { port } = new URL(target.baseUrl);
    const chunks: Buffer[] = [];
    let socket: Socket;
    const opened = new Promise<void>((resolve) => {
      socket = connect(Number(port), "127.0.0.1", () => {
        socket.write(
          `POST ${path} HTTP/1.1\r\nHost: 127.0.0.1\r\nIdempotency-Key: ${KEY}\r\nContent-Type: ${contentType}\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n`,
        );
        resolve();
      });
      socket.on("data", (chunk: Buffer) => chunks.push(chunk));
    });
    return {
      opened,
      async finish(): Promise<unknown> {
        const ended = new Promise((resolve) => socket.once("end", resolve));
        socket.write(body);
        await ended;
        const raw = Buffer.concat(chunks).toString("utf8");
        return JSON.parse(raw.slice(raw.indexOf("\r\n\r\n") + 4));
      },
    };
  }

  it("returns the same job for a repeated key without a second provider call", async () => {
    const tryOn = hanging();
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS), { providerTimeoutMs: 10_000 }, tryOn);
    const body = { analysisJobId: await analysisJobId(proxy), styleId: "neat-updo" };

    const first = parseTryOnJob(await (await postTryOnWithKey(proxy, body)).json());
    const repeat = parseTryOnJob(await (await postTryOnWithKey(proxy, body)).json());

    expect(repeat.id).toBe(first.id);
    await waitFor(async () => (tryOn.calls === 1 ? true : undefined));
    expect(tryOn.signals[0].aborted).toBe(false);
  });

  it("cancels a created try-on by its key and aborts the provider", async () => {
    const tryOn = hanging();
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS), { providerTimeoutMs: 10_000 }, tryOn);
    const created = parseTryOnJob(
      await (await postTryOnWithKey(proxy, { analysisJobId: await analysisJobId(proxy), styleId: "neat-updo" })).json(),
    );
    await waitFor(async () => (tryOn.calls === 1 ? true : undefined));

    expect((await cancelByKey(proxy)).status).toBe(204);

    expect(parseTryOnJob(await (await fetch(`${proxy.baseUrl}/v1/try-on-jobs/${created.id}`)).json()).state).toBe("cancelled");
    expect(tryOn.signals[0].aborted).toBe(true);
  });

  it("creates nothing for a request cancelled by key before it arrived, and keeps the previous result", async () => {
    const tryOn = tryOnReturning(async () => ({ bytes: syntheticJpeg(640, 480, 64), mimeType: "image/jpeg" as const }));
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS), {}, tryOn);
    const analysisId = await analysisJobId(proxy);
    const previous = await untilTerminal(proxy, parseTryOnJob(await (await postTryOn(proxy, { analysisJobId: analysisId, styleId: "short-bob" })).json()).id);

    expect((await cancelByKey(proxy)).status).toBe(204);
    const late = await postTryOnWithKey(proxy, { analysisJobId: analysisId, styleId: "neat-updo" });

    expect(late.status).toBe(404);
    expect(parseApiErrorBody(await late.json()).error.code).toBe("JOB_NOT_FOUND");
    expect(tryOn.calls).toBe(1);
    expect((await fetch(`${proxy.baseUrl}/v1/try-on-jobs/${previous.id}/result`)).status).toBe(200);
  });

  it("returns the first job to a retry that raced it with the same key (review follow-up)", async () => {
    const tryOn = hanging();
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS), { providerTimeoutMs: 10_000 }, tryOn);
    const body = Buffer.from(JSON.stringify({ analysisJobId: await analysisJobId(proxy), styleId: "neat-updo" }));

    // Request A sends its headers and holds the body; its retry B completes first.
    const held = heldPost(proxy, "/v1/try-on-jobs", "application/json", body);
    await held.opened;
    await new Promise((resolve) => setTimeout(resolve, 20));
    const retry = parseTryOnJob(await (await postTryOnWithKey(proxy, JSON.parse(body.toString()))).json());
    const first = parseTryOnJob(await held.finish());

    expect(first.id).toBe(retry.id);
    expect(parseTryOnJob(await (await fetch(`${proxy.baseUrl}/v1/try-on-jobs/${retry.id}`)).json()).state).not.toBe("cancelled");
    await waitFor(async () => (tryOn.calls === 1 ? true : undefined));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(tryOn.calls).toBe(1);
  });

  it("creates nothing when the connection closes before the request body arrives", async () => {
    const tryOn = hanging();
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS), { providerTimeoutMs: 10_000 }, tryOn);
    const analysisId = await analysisJobId(proxy);
    const photoOnly = proxy.retainedBytes();

    await rawPostThenDisconnect(proxy, { analysisJobId: analysisId, styleId: "neat-updo" }, 10);
    // The cut-off body is rejected as an invalid request.
    const posts = () => proxy!.logger.entries.filter((entry) => entry.event === "http_request" && entry.method === "POST");
    await waitFor(async () => (posts().length === 2 ? true : undefined));

    expect(posts()[1].status).toBe(422);

    expect(tryOn.calls).toBe(0);
    expect(proxy.retainedBytes()).toBe(photoOnly);
  });

  it("stops a try-on whose response the closed connection never received, through the client's cancel by key", async () => {
    const tryOn = hanging();
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS), { providerTimeoutMs: 10_000 }, tryOn);
    const analysisId = await analysisJobId(proxy);
    const photoOnly = proxy.retainedBytes();

    await rawPostThenDisconnect(proxy, { analysisJobId: analysisId, styleId: "neat-updo" });
    await waitFor(async () => (proxy!.logger.entries.some((entry) => entry.route === "/v1/try-on-jobs") ? true : undefined));
    expect((await cancelByKey(proxy)).status).toBe(204);

    await waitFor(async () => (tryOn.signals.every((signal) => signal.aborted) ? true : undefined));
    expect(proxy.retainedBytes()).toBe(photoOnly);
  });

  it("never creates anything when cancelling by an unknown or malformed key", async () => {
    const tryOn = hanging();
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS), {}, tryOn);
    const photoOnly = proxy.retainedBytes();

    expect((await cancelByKey(proxy, "idem_unknown_0123456789abcdef")).status).toBe(204);
    expect((await cancelByKey(proxy, "x")).status).toBe(204);
    expect(tryOn.calls).toBe(0);
    expect(proxy.retainedBytes()).toBe(photoOnly);
  });
});

describe("review follow-ups: requests without side effects", () => {
  const KEY = "idem_followup_0123456789abcdef";

  it("returns the first analysis to an upload retry that raced it with the same key", async () => {
    const provider = providerReturning(neverResolves);
    proxy = await startProxy(provider, { providerTimeoutMs: 10_000 });
    const request = new Request(`${proxy.baseUrl}/v1/analysis-jobs`, { method: "POST", body: analysisForm() });
    const contentType = request.headers.get("content-type")!;
    const body = new Uint8Array(await request.arrayBuffer());
    const { port } = new URL(proxy.baseUrl);
    const chunks: Buffer[] = [];
    const socket = await new Promise<Socket>((resolve) => {
      const opened = connect(Number(port), "127.0.0.1", () => {
        opened.write(
          `POST /v1/analysis-jobs HTTP/1.1\r\nHost: 127.0.0.1\r\nIdempotency-Key: ${KEY}\r\nContent-Type: ${contentType}\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n`,
        );
        resolve(opened);
      });
      opened.on("data", (chunk: Buffer) => chunks.push(chunk));
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    const retry = parseAnalysisJob(await (await postAnalysis(proxy, analysisForm(), { "Idempotency-Key": KEY })).json());
    const ended = new Promise((resolve) => socket.once("end", resolve));
    socket.write(body);
    await ended;
    const raw = Buffer.concat(chunks).toString("utf8");
    const first = parseAnalysisJob(JSON.parse(raw.slice(raw.indexOf("\r\n\r\n") + 4)));

    expect(first.id).toBe(retry.id);
    expect(proxy.store.size()).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(provider.calls).toHaveLength(1);
  });

  it("a try-on refused for capacity leaves the analysis's previous result in place", async () => {
    let call = 0;
    const tryOn = tryOnReturning((image, _style, signal) =>
      ++call === 1 ? Promise.resolve({ bytes: syntheticJpeg(640, 480, 64), mimeType: "image/jpeg" as const }) : (neverResolves(image, signal) as never),
    );
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS), { providerTimeoutMs: 10_000, maxActiveTryOns: 1 }, tryOn);
    const [first, second] = [await analysisJobId(proxy), await analysisJobId(proxy)];
    const done = await untilTerminal(proxy, parseTryOnJob(await (await postTryOn(proxy, { analysisJobId: first, styleId: "neat-updo" })).json()).id);
    expect(done.state).toBe("succeeded");
    expect((await postTryOn(proxy, { analysisJobId: second, styleId: "neat-updo" })).status).toBe(202);

    const refused = await postTryOn(proxy, { analysisJobId: first, styleId: "short-bob" });

    expect(refused.status).toBe(503);
    expect((await fetch(`${proxy.baseUrl}/v1/try-on-jobs/${done.id}/result`)).status).toBe(200);
  });

  it("counts the previous try-on of the same analysis as freed when checking memory", async () => {
    const photo = stripImageMetadata(syntheticJpeg(), "image/jpeg")!.length;
    const tryOn = tryOnReturning((image, _style, signal) => neverResolves(image, signal) as never);
    // Room for the photo and exactly one reservation.
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS), { providerTimeoutMs: 10_000, maxRetainedBytes: 3 * photo }, tryOn);
    const analysisId = await analysisJobId(proxy);

    expect((await postTryOn(proxy, { analysisJobId: analysisId, styleId: "neat-updo" })).status).toBe(202);
    expect((await postTryOn(proxy, { analysisJobId: analysisId, styleId: "short-bob" })).status).toBe(202);
    expect(proxy.retainedBytes()).toBe(3 * photo);
  });

  it("zeroes a provider result that arrives after its try-on was removed", async () => {
    let release: (result: TryOnResult) => void = () => undefined;
    const late = { bytes: syntheticJpeg(640, 480, 64), mimeType: "image/jpeg" as const };
    // A provider that ignores cancellation.
    const tryOn = tryOnReturning(() => new Promise<TryOnResult>((resolve) => (release = resolve)));
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS), { providerTimeoutMs: 10_000 }, tryOn);
    const analysisId = await analysisJobId(proxy);
    expect((await postTryOn(proxy, { analysisJobId: analysisId, styleId: "neat-updo" })).status).toBe(202);
    await waitFor(async () => (tryOn.calls === 1 ? true : undefined));

    await fetch(`${proxy.baseUrl}/v1/analysis-jobs/${analysisId}`, { method: "DELETE" });
    release(late);

    await waitFor(async () => (late.bytes.every((byte) => byte === 0) ? true : undefined));
    expect(proxy.retainedBytes()).toBe(0);
  });
});

describe("simulator try-on", () => {
  it("returns a deterministic synthetic PNG without network access (R9.2)", async () => {
    const provider = createSimulatorTryOnProvider({ delayMs: 0 });
    const image = { bytes: syntheticJpeg(1280, 720), mimeType: "image/jpeg" as const, width: 1280, height: 720 };

    const first = await provider.tryOn(image, "neat-updo", new AbortController().signal);
    const second = await provider.tryOn(image, "neat-updo", new AbortController().signal);

    expect(first.mimeType).toBe("image/png");
    expect(Array.from(first.bytes.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(first.bytes).toEqual(second.bytes);
  });
});

describe("GET /v1/try-on-styles/:id/thumbnail (task 12.5)", () => {
  const thumbnail = (styleId: string) =>
    fetch(`${proxy!.baseUrl}/v1/try-on-styles/${styleId}/thumbnail`, { headers: { Origin: DESKTOP_ORIGIN } });

  it("serves a curated style preview as an image with no user data", async () => {
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS), {}, createSimulatorTryOnProvider({ delayMs: 0 }));

    const response = await thumbnail("neat-updo");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("private, max-age=3600");
    expect(response.headers.get("access-control-allow-origin")).toBe(DESKTOP_ORIGIN);
    expect(new Uint8Array(await response.arrayBuffer()).subarray(0, 4)).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
  });

  it.each(["navy-blazer", "female_casual_updo", "..%2F..%2Fetc"])("rejects an unknown style %s without calling the provider", async (styleId) => {
    let calls = 0;
    const provider = createSimulatorTryOnProvider({ delayMs: 0 });
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS), {}, {
      ...provider,
      thumbnail: (...args) => {
        calls += 1;
        return provider.thumbnail(...args);
      },
    });

    const response = await thumbnail(styleId);

    expect(response.status).toBe(404);
    expect(calls).toBe(0);
  });

  it("maps a provider failure to a stable error", async () => {
    proxy = await startProxy(providerReturning(async () => NEUTRAL_OBSERVATIONS), {}, {
      ...createSimulatorTryOnProvider({ delayMs: 0 }),
      thumbnail: async () => {
        throw new ProviderError("unavailable");
      },
    });

    const response = await thumbnail("short-bob");

    expect(response.status).toBe(503);
    expect(parseApiErrorBody(await response.json()).error.code).toBe("PROCESSING_UNAVAILABLE");
  });
});
