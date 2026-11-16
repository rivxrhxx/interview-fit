// @vitest-environment node
// Korean analysis output: localized observations and guidance, Korean job cues, same policy.
import { afterEach, describe, expect, it } from "vitest";
import { parseAnalysisJob, passesContentPolicy } from "../../../packages/contracts/src/index.ts";
import { filterRecommendations, suggestRules } from "../src/guidance/engine.ts";
import { analyzeJobRules } from "../src/guidance/jobAnalysis.ts";
import { extractJobCues } from "../src/guidance/jobCues.ts";
import { createSimulatorProvider } from "../src/providers/simulator.ts";
import { analysisForm, postAnalysis, startProxy, waitFor, type TestProxy } from "./helpers.ts";

let proxy: TestProxy | undefined;

afterEach(async () => {
  await proxy?.close();
  proxy = undefined;
});

const HANGUL = /[가-힣]/;
const KO_JD = "금융권 컨설턴트 채용. 고객사에 분석 결과를 발표합니다. 1차 면접은 화상 면접(Zoom)으로 진행됩니다. 2차는 대면 면접입니다.";

describe("Korean job cues", () => {
  it("recognizes Korean postings and labels cues in Korean", () => {
    const cues = extractJobCues(KO_JD, "ko");
    const ids = cues.map((cue) => cue.id);

    expect(ids).toEqual(expect.arrayContaining(["video-interview", "client-facing", "presenting", "formal-industry", "in-person"]));
    for (const cue of cues) {
      expect(KO_JD).toContain(cue.evidence);
      expect(cue.label).toMatch(HANGUL);
    }
  });

  it("does not read 비대면 (remote) as in-person", () => {
    expect(extractJobCues("비대면 면접으로 진행합니다.", "ko").map((cue) => cue.id)).not.toContain("in-person");
  });

  it("finds English cues and labels them in Korean", () => {
    const cues = extractJobCues("Client-facing consultant. Interviews are held over video.", "ko");
    expect(cues.map((cue) => cue.label)).toEqual(expect.arrayContaining(["화상 면접", "고객 응대 업무"]));
  });
});

describe("Korean guidance", () => {
  it("produces Korean, policy-compliant suggestions that cite their cues", () => {
    const observations = [
      { id: "obs_lighting", category: "lighting" as const, assessment: "adjustable" as const, text: "조명" },
    ];

    const jobContext = analyzeJobRules(KO_JD, "ko");
    const output = { jobContext, recommendations: filterRecommendations(suggestRules(jobContext, observations, "ko"), jobContext, observations) };

    expect(output.jobContext.summary).toMatch(HANGUL);
    expect(output.recommendations.length).toBeGreaterThan(1);
    for (const rec of output.recommendations) {
      expect(rec.adjustment).toMatch(HANGUL);
      expect(rec.rationale).toMatch(HANGUL);
      expect(passesContentPolicy(rec.adjustment) && passesContentPolicy(rec.rationale)).toBe(true);
    }
  });
});

describe("locale over HTTP", () => {
  it("returns Korean observations and guidance when the request asks for ko", async () => {
    proxy = await startProxy(createSimulatorProvider({ delayMs: 5, scenario: "success" }));
    const form = analysisForm({ jobDescription: KO_JD });
    form.set("locale", "ko");

    const created = parseAnalysisJob(await (await postAnalysis(proxy, form)).json());
    const done = await waitFor(async () => {
      const job = parseAnalysisJob(await (await fetch(`${proxy!.baseUrl}/v1/analysis-jobs/${created.id}`)).json());
      return job.state === "succeeded" ? job : undefined;
    });

    expect(done.result?.locale).toBe("ko");
    for (const observation of done.result!.observations) expect(observation.text).toMatch(HANGUL);
    expect(done.result!.jobContext.summary).toMatch(HANGUL);
  });

  it("defaults to English when no locale is sent", async () => {
    proxy = await startProxy(createSimulatorProvider({ delayMs: 5, scenario: "success" }));

    const created = parseAnalysisJob(await (await postAnalysis(proxy)).json());
    const done = await waitFor(async () => {
      const job = parseAnalysisJob(await (await fetch(`${proxy!.baseUrl}/v1/analysis-jobs/${created.id}`)).json());
      return job.state === "succeeded" ? job : undefined;
    });

    expect(done.result?.locale).toBe("en");
    expect(done.result!.observations[0].text).not.toMatch(HANGUL);
  });
});
