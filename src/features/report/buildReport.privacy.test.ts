// Task 9.1 — report content: R7.1 (required sections) and R7.2 (no source photo by default),
// plus Markdown escaping of untrusted text and the shared content policy.
import { describe, expect, it } from "vitest";
import succeededFixture from "../../../packages/contracts/fixtures/analysis-job.succeeded.json";
import { parseAnalysisJob, type AnalysisResult } from "../../lib/api/contracts";
import { buildReport, reportFileName } from "./buildReport";

const result = parseAnalysisJob(succeededFixture).result as AnalysisResult;
const generatedAt = new Date("2026-11-16T09:30:00.000Z");

function report(overrides: Partial<Parameters<typeof buildReport>[0]> = {}) {
  return buildReport({ result, tryOn: "created", tryOnStyleId: "neat-updo", generatedAt, ...overrides });
}

describe("buildReport", () => {
  it("includes job context, neutral guidance, try-on status, generation time, and a privacy notice (R7.1)", () => {
    const text = report();

    expect(text).toMatch(/^# Interview Fit report/);
    expect(text).toContain("Generated: 2026-11-16 09:30 UTC");
    expect(text).toContain("## Job context");
    expect(text).toContain(result.jobContext.summary.replace(/-/g, "\\-"));
    expect(text).toContain("## Presentation guidance");
    expect(text).toContain("- What we noticed: ");
    expect(text).toContain("- Optional adjustment: ");
    expect(text).toContain("- Why: ");
    expect(text).toContain("- Industry: Consulting");
    expect(text).toContain("- Dress code: Not stated in the posting");
    expect(text).toContain("- Suggested dress formality: Business casual");
    expect(text).toContain("## What the photo shows");
    expect(text).toContain("- Lighting: The light source appears to be behind you. (Could be adjusted)");
    expect(text).toContain("## Hairstyle try\\-on");
    expect(text).toContain("Status: A neat updo hairstyle preview was created during this session. It is not included in this report.");
    expect(text).toContain("## Privacy");
    expect(text).toContain("This report contains text only. It does not include your photo, the try\\-on preview, or any image data.");
  });

  it.each([
    ["not-created", "Status: No hairstyle preview was created."],
    ["unavailable", "Status: A hairstyle preview could not be created."],
  ] as const)("reports try-on status %s", (tryOn, line) => {
    expect(report({ tryOn })).toContain(line);
  });

  it("never embeds the source photo, the preview, or any image data by default (R7.2)", () => {
    const text = report();

    expect(text).not.toMatch(/!\[|<img|data:image|base64|blob:/i);
  });

  it("escapes untrusted text so it cannot become an image, link, or HTML", () => {
    const tampered: AnalysisResult = {
      ...result,
      jobContext: {
        ...result.jobContext,
        summary: "Summary",
        cues: [{ id: "client-facing", label: "Client-facing work", evidence: "![pixel](https://track.example/p.png) <b>x</b>\n# Heading" }],
      },
    };

    const text = report({ result: tampered });

    expect(text).not.toContain("![");
    expect(text).not.toContain("<b>");
    expect(text).not.toMatch(/^# Heading/m);
    expect(text).toContain("\\!\\[pixel\\]\\(https://track.example/p.png\\) \\<b\\>x\\</b\\> \\# Heading");
  });

  it("omits anything that fails the content policy", () => {
    const tampered: AnalysisResult = {
      ...result,
      recommendations: [
        ...result.recommendations,
        { id: "rec_bad", category: "attire", observationId: null, adjustment: "Consider hiding your acne.", rationale: "You will be hired.", cueIds: [] },
      ],
    };

    expect(report({ result: tampered })).not.toMatch(/acne|hired/);
  });

  it("names the file after the generation date", () => {
    expect(reportFileName(generatedAt)).toBe("interview-fit-report-2026-11-16.md");
  });
});
