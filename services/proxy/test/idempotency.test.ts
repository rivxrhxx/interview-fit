// @vitest-environment node
// Review follow-up: cancel-by-key tombstones are bounded, so random keys cannot grow memory (R4.5).
import { describe, expect, it } from "vitest";
import { MAX_TOMBSTONES, createIdempotencyRegistry } from "../src/http/idempotency.ts";

describe("idempotency registry", () => {
  it("keeps at most MAX_TOMBSTONES cancels and forgets the oldest first", () => {
    const registry = createIdempotencyRegistry(() => 0);

    for (let index = 0; index <= MAX_TOMBSTONES; index++) registry.tombstone(`key-${index}`);

    expect(registry.takeTombstone("key-0")).toBe(false);
    expect(registry.takeTombstone(`key-${MAX_TOMBSTONES}`)).toBe(true);
    expect(registry.takeTombstone(`key-${MAX_TOMBSTONES}`)).toBe(false);
  });

  it("expires tombstones after 60 seconds", () => {
    const clock = { now: 0 };
    const registry = createIdempotencyRegistry(() => clock.now);
    registry.tombstone("key");

    clock.now += 60_001;

    expect(registry.takeTombstone("key")).toBe(false);
  });
});
