import { vi } from "vitest";
import type { Adapters } from "../lib/adapters";
import { fakeStream } from "./media";

/** Mock implementations of every typed adapter. Tests override what they exercise. */
export function createMockAdapters(overrides: Partial<Adapters> = {}): Adapters {
  return {
    image: { prepare: vi.fn(async () => new Blob(["normalized"], { type: "image/jpeg" })) },
    camera: {
      open: vi.fn(async () => fakeStream().stream),
      captureFrame: vi.fn(async () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: "image/jpeg" })),
    },
    ...overrides,
  };
}
