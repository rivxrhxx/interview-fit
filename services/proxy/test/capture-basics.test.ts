// @vitest-environment node
// Photos arrive capped at 1024 px on the long side (R3.3), so the clarity check must not
// flag every capped photo as low resolution; "business casual" must not read as a casual
// workplace.
import { describe, expect, it } from "vitest";
import { analyzeJobRules } from "../src/guidance/jobAnalysis.ts";
import { extractJobCues } from "../src/guidance/jobCues.ts";
import { captureBasics } from "../src/providers/captureBasics.ts";

describe("clarity against the 1024 px cap", () => {
  it.each([
    [1024, 768, "ok"],
    [1024, 576, "ok"],
    [576, 1024, "ok"],
    [800, 600, "adjustable"],
    [1024, 400, "adjustable"],
  ] as const)("%i×%i is %s", (width, height, assessment) => {
    expect(captureBasics({ width, height })[0]).toMatchObject({ id: "obs_clarity", assessment });
  });
});

describe("dress codes are not workplace cues", () => {
  it.each(["Dress code: business casual.", "Smart-casual attire.", "복장은 비즈니스 캐주얼입니다.", "스마트 캐주얼 복장"])("%s", (text) => {
    expect(extractJobCues(text, "ko").map((cue) => cue.id)).not.toContain("casual-workplace");
    expect(analyzeJobRules(text, "ko").points.find((point) => point.id === "atmosphere")?.value).toBeNull();
  });

  it("still reads a casual workplace", () => {
    expect(extractJobCues("Casual startup culture.").map((cue) => cue.id)).toContain("casual-workplace");
    expect(extractJobCues("캐주얼한 분위기의 회사").map((cue) => cue.id)).toContain("casual-workplace");
  });
});
