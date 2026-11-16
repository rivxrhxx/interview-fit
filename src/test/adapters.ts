import { vi } from "vitest";
import queuedFixture from "../../packages/contracts/fixtures/analysis-job.queued.json";
import succeededFixture from "../../packages/contracts/fixtures/analysis-job.succeeded.json";
import type { Adapters } from "../lib/adapters";
import type { ApiClient } from "../lib/api/client";
import { parseAnalysisJob } from "../lib/api/contracts";
import { fakeStream } from "./media";

export function mockApi(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    createAnalysisJob: vi.fn(async () => parseAnalysisJob(queuedFixture)),
    getAnalysisJob: vi.fn(async () => parseAnalysisJob(succeededFixture)),
    cancelAnalysisJob: vi.fn(async () => {}),
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
    ...overrides,
  };
}
