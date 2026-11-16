import { vi } from "vitest";
import queuedFixture from "../../packages/contracts/fixtures/analysis-job.queued.json";
import succeededFixture from "../../packages/contracts/fixtures/analysis-job.succeeded.json";
import tryOnSucceededFixture from "../../packages/contracts/fixtures/try-on-job.succeeded.json";
import type { Adapters } from "../lib/adapters";
import type { ApiClient } from "../lib/api/client";
import { parseAnalysisJob, parseTryOnJob, type TryOnJob } from "../lib/api/contracts";
import { fakeStream } from "./media";

export function queuedTryOn(): TryOnJob {
  return { ...parseTryOnJob(tryOnSucceededFixture), state: "queued" };
}

export function mockApi(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    createAnalysisJob: vi.fn(async () => parseAnalysisJob(queuedFixture)),
    getAnalysisJob: vi.fn(async () => parseAnalysisJob(succeededFixture)),
    cancelAnalysisJob: vi.fn(async () => {}),
    createTryOnJob: vi.fn(async () => queuedTryOn()),
    getTryOnJob: vi.fn(async () => parseTryOnJob(tryOnSucceededFixture)),
    getTryOnResult: vi.fn(async () => new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" })),
    cancelTryOnJob: vi.fn(async () => {}),
    ...overrides,
  };
}

/** Mock implementations of every typed adapter. Tests override what they exercise. */
export function createMockAdapters(overrides: Partial<Adapters> = {}): Adapters {
  return {
    image: { prepare: vi.fn(async () => new Blob(["normalized"], { type: "image/jpeg" })) },
    camera: {
      open: vi.fn(async () => fakeStream().stream),
      captureFrame: vi.fn(async () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: "image/jpeg" })),
    },
    api: mockApi(),
    report: { save: vi.fn(async () => "saved" as const) },
    ...overrides,
  };
}
