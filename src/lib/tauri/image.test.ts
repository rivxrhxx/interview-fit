// Task 12.4 — the browser development fallback uses the same 1024 px long-side cap as
// the native command (R3.3), without upscaling smaller photos.
import { describe, expect, it } from "vitest";
import { MAX_OUTPUT_LONG_SIDE, fitWithin } from "./image";

describe("fitWithin", () => {
  it.each([
    [[2048, 1536], [1024, 768]],
    [[1080, 1920], [576, 1024]],
    [[1024, 576], [1024, 576]],
    [[640, 480], [640, 480]],
  ])("fits %j into %j", ([width, height], expected) => {
    expect(fitWithin(width, height)).toEqual({ width: expected[0], height: expected[1] });
  });

  it("matches the native cap", () => {
    expect(MAX_OUTPUT_LONG_SIDE).toBe(1024);
  });
});
