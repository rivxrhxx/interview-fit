// @vitest-environment node
// Task 12.4 — YouCam skin-prep tips: R5.4 (four camera-visible concerns, no scores, skin
// age, skin type, or condition names leave the backend), R5.5 (framing errors keep the
// other observations), R5.3 (English and Korean text passes the content policy).
import { describe, expect, it } from "vitest";
import { parseObservations, passesContentPolicy, type Locale } from "../../../packages/contracts/src/index.ts";
import { filterRecommendations, suggestRules } from "../src/guidance/engine.ts";
import { analyzeJobRules } from "../src/guidance/jobAnalysis.ts";
import { createYouCamAnalysisProvider } from "../src/providers/youcam/analysisProvider.ts";
import { loadYouCamConfig } from "../src/providers/youcam/config.ts";
import { SKIN_CONCERNS, prepRetakeObservation, skinPrepObservations } from "../src/providers/youcam/skinPrep.ts";
import { FAKE_API_KEY, FAKE_BASE_URL, SKIN_SUCCESS, engineError, fakeYouCam, type FakeYouCamOptions } from "./fakeYouCam.ts";
import { memoryLogger, syntheticJpeg } from "./helpers.ts";

const image = { bytes: syntheticJpeg(1024, 768), mimeType: "image/jpeg" as const, width: 1024, height: 768 };

function setup(options: FakeYouCamOptions = {}, skinGraceMs?: number) {
  const youcam = fakeYouCam(options);
  const logger = memoryLogger();
  const config = loadYouCamConfig({ YOUCAM_API_KEY: FAKE_API_KEY, YOUCAM_API_BASE_URL: FAKE_BASE_URL, YOUCAM_POLL_INTERVAL_MS: "1" });
  return { youcam, logger, provider: createYouCamAnalysisProvider({ config, fetch: youcam.fetch, logger, skinGraceMs }) };
}

const prepOf = (observations: Awaited<ReturnType<ReturnType<typeof setup>["provider"]["analyze"]>>) =>
  observations.filter((observation) => observation.category === "skin-prep");

describe("skin-analysis request (R5.4)", () => {
  it("asks for exactly the four camera-visible concerns, as JSON, on its own upload", async () => {
    const { youcam, provider } = setup();

    await provider.analyze(image, new AbortController().signal);

    const create = youcam.requests.find((request) => request.method === "POST" && request.url.endsWith("/task/skin-analysis"))!;
    expect(create.body).toEqual({ src_file_id: expect.any(String), dst_actions: ["oiliness", "moisture", "redness", "texture"], format: "json" });
    expect(SKIN_CONCERNS).toHaveLength(4);
  });
});

describe("translation (R5.4)", () => {
  it("turns scores into optional prep observations and drops every score and mask", async () => {
    const { provider } = setup();

    const observations = await provider.analyze(image, new AbortController().signal);
    const prep = prepOf(observations);

    expect(prep.map((observation) => [observation.id, observation.assessment])).toEqual([
      ["obs_prep_oiliness", "adjustable"],
      ["obs_prep_moisture", "ok"],
      ["obs_prep_redness", "ok"],
      ["obs_prep_texture", "adjustable"],
    ]);
    expect(parseObservations(observations)).toHaveLength(observations.length);
    const serialized = JSON.stringify(observations);
    expect(serialized).not.toMatch(/48\.25|72\.5|77\.75|57\.5|ui_score|raw_score|mask|signature|youcam/i);
  });

  it.each(["en", "ko"] as Locale[])("never names a condition and passes the content policy (%s)", (locale) => {
    const all = SKIN_CONCERNS.flatMap((concern) => [
      skinPrepObservations({ output: [{ type: concern, raw_score: 10 }] }, locale)!,
      skinPrepObservations({ output: [{ type: concern, raw_score: 90 }] }, locale)!,
    ]).flat();
    const retakes = ["error_src_face_too_small", "error_lighting_dark"].map((code) => prepRetakeObservation(code, locale)!);

    for (const observation of [...all, ...retakes]) {
      expect(passesContentPolicy(observation.text)).toBe(true);
      expect(observation.text).not.toMatch(/skin|acne|wrinkle|pore|피부|여드름|주름|모공|score|점수|age|나이/i);
    }
  });

  it("ignores missing or out-of-range scores and unknown concerns", () => {
    expect(skinPrepObservations({ output: [{ type: "skin_age", raw_score: 30 }, { type: "oiliness", raw_score: 140 }] })).toBeNull();
    expect(skinPrepObservations({ output: "nope" })).toBeNull();
    expect(skinPrepObservations(null)).toBeNull();
  });
});

describe("skin prep never blocks the analysis (R5.5)", () => {
  it.each(["error_src_face_too_small", "error_src_face_out_of_bound"])(
    "keeps the photo-quality observations and adds a retake hint for %s",
    async (code) => {
      const { provider } = setup({ skinPollReplies: [engineError(code)] });

      const observations = await provider.analyze(image, new AbortController().signal);

      expect(observations.some((observation) => observation.id === "obs_lighting")).toBe(true);
      expect(prepOf(observations)).toEqual([]);
      expect(observations).toContainEqual(expect.objectContaining({ id: "obs_prep_framing", category: "framing", assessment: "adjustable" }));
    },
  );

  it.each([
    ["a failed task creation", { skinCreateReply: { status: 502, body: {} } }],
    ["an unexpected engine error", { skinPollReplies: [engineError("error_unexpected")] }],
    ["a malformed result", { skinPollReplies: [{ ...SKIN_SUCCESS, data: { ...SKIN_SUCCESS.data, results: { output: 7 } } }] }],
  ] as const)("continues without prep tips after %s", async (_label, options) => {
    const { provider, logger } = setup(options as FakeYouCamOptions);

    const observations = await provider.analyze(image, new AbortController().signal);

    expect(observations.some((observation) => observation.id === "obs_lighting")).toBe(true);
    expect(observations.some((observation) => observation.id.startsWith("obs_prep_"))).toBe(false);
    expect(logger.entries).toContainEqual(expect.objectContaining({ event: "skin_prep_skipped" }));
  });

  it("does not wait for a slow skin task once photo quality is in (review finding 4)", async () => {
    const { provider, logger, youcam } = setup({ skinPollReplies: [{ status: 200, data: { task_status: "running" } } as never] }, 30);

    const observations = await provider.analyze(image, new AbortController().signal);

    expect(observations.some((observation) => observation.id === "obs_lighting")).toBe(true);
    expect(observations.some((observation) => observation.category === "skin-prep")).toBe(false);
    expect(logger.entries).toContainEqual(expect.objectContaining({ event: "skin_prep_skipped", reason: "slow" }));
    // The skin task stops polling after it is skipped.
    const polls = () => youcam.requests.filter((request) => request.url.includes("/task/skin-analysis/")).length;
    const before = polls();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(polls()).toBeLessThanOrEqual(before + 1);
  });

  it("still fails when the required photo-quality task fails", async () => {
    const { provider } = setup({ createReply: { status: 502, body: {} } });

    await expect(provider.analyze(image, new AbortController().signal)).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("stops both tasks when the user cancels", async () => {
    const { provider } = setup({ pollReplies: [{ status: 200, data: { task_status: "running" } } as never] });
    const controller = new AbortController();

    const pending = provider.analyze(image, controller.signal);
    setTimeout(() => controller.abort(new Error("cancelled")), 5);

    await expect(pending).rejects.toThrow("cancelled");
  });
});

describe("prep suggestions", () => {
  it("only answers skin-prep observations marked adjustable, whoever wrote the tip", () => {
    const observations = [
      ...skinPrepObservations({ output: [{ type: "oiliness", raw_score: 90 }] }, "en")!,
    ];
    const jobContext = analyzeJobRules("Interviews are held over video.", "en");
    const written = [
      { id: "rec_x", category: "skin-prep" as const, observationId: "obs_prep_oiliness", adjustment: "Consider blotting paper.", rationale: "Video.", cueIds: ["video-interview"] },
      { id: "rec_y", category: "skin-prep" as const, observationId: null, adjustment: "Consider blotting paper.", rationale: "Video.", cueIds: ["video-interview"] },
    ];

    expect(filterRecommendations(written, jobContext, observations)).toEqual([]);
  });

  it.each(["en", "ko"] as Locale[])("gives one optional, policy-compliant tip per adjustable concern (%s)", (locale) => {
    const observations = SKIN_CONCERNS.flatMap((concern) => skinPrepObservations({ output: [{ type: concern, raw_score: 30 }] }, locale)!);
    const jobContext = analyzeJobRules(locale === "ko" ? "1차 면접은 화상 면접으로 진행됩니다." : "Interviews are held over video.", locale);

    const recs = filterRecommendations(suggestRules(jobContext, observations, locale), jobContext, observations);
    const prep = recs.filter((rec) => rec.category === "skin-prep");

    expect(prep.map((rec) => rec.observationId)).toEqual(observations.map((observation) => observation.id));
    for (const rec of prep) {
      expect(passesContentPolicy(rec.adjustment) && passesContentPolicy(rec.rationale)).toBe(true);
      expect(rec.cueIds).toEqual(["video-interview"]);
    }
  });
});
