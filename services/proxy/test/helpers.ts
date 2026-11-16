import type { AddressInfo } from "node:net";
import { deflateSync } from "node:zlib";
import { CURRENT_CONSENT_VERSION, type Observation } from "../../../packages/contracts/src/index.ts";
import { loadConfig, type ProxyConfig } from "../src/config.ts";
import type { LogEntry, Logger } from "../src/logger.ts";
import type { AnalysisProvider, ProviderImage } from "../src/providers/types.ts";
import { createProxy, type Proxy } from "../src/server.ts";

export const DESKTOP_ORIGIN = "tauri://localhost";

/**
 * Structurally complete baseline JPEG: SOI, APP0 (JFIF), SOF0 declaring
 * width x height, SOS, `padding` bytes of scan data, and EOI. Pixels are not decodable,
 * which is fine because the proxy never decodes pixel data.
 */
export function syntheticJpeg(width = 640, height = 480, padding = 256): Uint8Array {
  const header = [
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
    0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, (height >> 8) & 0xff, height & 0xff, (width >> 8) & 0xff, width & 0xff, 0x03,
    0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xda, 0x00, 0x0c, 0x03, 0x01, 0x00, 0x02, 0x11, 0x03,
    0x11, 0x00, 0x3f, 0x00,
  ];
  const bytes = new Uint8Array(header.length + padding + 2);
  bytes.set(header);
  bytes.set([0xff, 0xd9], bytes.length - 2);
  return bytes;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** PNG whose IHDR declares `width` x `height` (pixel data is not checked by the proxy). */
export function syntheticPng(width: number, height: number): Uint8Array {
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(new Uint8Array([0, 0, 0, 0]))),
    chunk("IEND", new Uint8Array()),
  ];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export const NEUTRAL_OBSERVATIONS: Observation[] = [
  { id: "obs_lighting", category: "lighting", assessment: "adjustable", text: "The light source appears to be behind you." },
];

export interface ControlledProvider extends AnalysisProvider {
  calls: Array<{ image: ProviderImage; signal: AbortSignal }>;
}

export function providerReturning(
  behavior: (image: ProviderImage, signal: AbortSignal) => Promise<Observation[]>,
): ControlledProvider {
  const calls: ControlledProvider["calls"] = [];
  return {
    calls,
    async analyze(image, signal) {
      calls.push({ image, signal });
      return behavior(image, signal);
    },
  };
}

export const neverResolves = (_image: ProviderImage, signal: AbortSignal) =>
  new Promise<Observation[]>((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });

export function memoryLogger(): Logger & { entries: LogEntry[] } {
  const entries: LogEntry[] = [];
  return { entries, log: (entry) => entries.push(entry) };
}

export interface TestProxy extends Proxy {
  baseUrl: string;
  logger: ReturnType<typeof memoryLogger>;
  clock: { now: number };
  close(): Promise<void>;
}

export async function startProxy(
  provider: AnalysisProvider,
  overrides: Partial<ProxyConfig> = {},
): Promise<TestProxy> {
  const logger = memoryLogger();
  const clock = { now: Date.parse("2026-11-16T09:00:00.000Z") };
  const config = { ...loadConfig({}), providerTimeoutMs: 200, sweepIntervalMs: 0, ...overrides };
  const proxy = createProxy({ config, provider, logger, now: () => clock.now });
  await new Promise<void>((resolve) => proxy.server.listen(0, "127.0.0.1", resolve));
  const { port } = proxy.server.address() as AddressInfo;
  return {
    ...proxy,
    baseUrl: `http://127.0.0.1:${port}`,
    logger,
    clock,
    close: () =>
      new Promise<void>((resolve) => {
        proxy.shutdown();
        proxy.server.close(() => resolve());
      }),
  };
}

export function analysisForm(
  overrides: { consentVersion?: string | null; jobDescription?: string; image?: Uint8Array | null; imageType?: string } = {},
): FormData {
  const form = new FormData();
  const consentVersion = overrides.consentVersion === undefined ? CURRENT_CONSENT_VERSION : overrides.consentVersion;
  if (consentVersion !== null) form.set("consentVersion", consentVersion);
  form.set("jobDescription", overrides.jobDescription ?? "Client-facing consultant. Interviews are held over video.");
  const image = overrides.image === undefined ? syntheticJpeg() : overrides.image;
  if (image !== null) {
    form.set("image", new Blob([image as Uint8Array<ArrayBuffer>], { type: overrides.imageType ?? "image/jpeg" }), "photo.jpg");
  }
  return form;
}

export async function postAnalysis(proxy: TestProxy, form: FormData = analysisForm(), headers: Record<string, string> = {}) {
  return fetch(`${proxy.baseUrl}/v1/analysis-jobs`, {
    method: "POST",
    body: form,
    headers: { Origin: DESKTOP_ORIGIN, ...headers },
  });
}

export async function waitFor<T>(probe: () => Promise<T | undefined>, timeoutMs = 2_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await probe();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("condition not met in time");
}
