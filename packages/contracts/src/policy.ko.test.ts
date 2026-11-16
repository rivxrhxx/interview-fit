// @vitest-environment node
// Korean output must be held to the same content policy as English (R5.3).
import { describe, expect, it } from "vitest";
import { findPolicyViolation } from "./policy.ts";
import { SUPPORTED_LOCALES, parseAnalysisResult } from "./index.ts";

describe("content policy (Korean)", () => {
  it.each([
    ["medical", "여드름이 보여요. 피부과 진료를 고려해 보세요."],
    ["medical", "피곤해 보여요."],
    ["attractiveness", "매력적인 인상이에요."],
    ["attractiveness", "외모 점수 8점이에요."],
    ["attractiveness", "얼굴형이 갸름해요."],
    ["protected-trait", "30대 여성에게 어울리는 색이에요."],
    ["protected-trait", "피부 톤에 맞춰 네이비를 추천해요."],
    ["personality", "신뢰감 있고 자신감 있어 보여요."],
    ["emotion", "긴장한 표정이에요."],
    ["hiring", "합격 가능성이 높아요."],
    ["hiring", "채용 담당자가 좋아할 거예요."],
  ])("flags a %s claim: %s", (category, text) => {
    expect(findPolicyViolation(text)).toBe(category);
  });

  it.each([
    "창문을 마주 보거나, 눈높이보다 조금 위에 부드러운 조명을 앞쪽에 두는 것을 고려해 보세요.",
    "공고에서 화상 면접(“화상 면접”) 내용을 확인했어요. 단순한 배경은 대화에 집중하게 해 줘요.",
    "머리가 기울어져 보여요.",
    "얼굴에 빛이 고르게 비쳐요.",
    "사진 해상도(1280×720)는 화상 미리보기에 충분히 선명해요.",
    "비대면 면접과 대면 미팅이 모두 있어요.",
  ])("allows neutral Korean guidance: %s", (text) => {
    expect(findPolicyViolation(text)).toBeNull();
  });
});

describe("locale in the contract", () => {
  it("supports English and Korean", () => {
    expect(SUPPORTED_LOCALES).toEqual(["en", "ko"]);
  });

  it("defaults a result without a locale to English and rejects unknown locales", () => {
    const base = {
      generatedAt: "2026-11-16T09:00:00.000Z",
      jobContext: {
        summary: "s",
        source: "rules",
        formality: "unknown",
        points: ["role", "industry", "atmosphere", "interview-format", "dress-code"].map((id) => ({ id, value: null, evidence: null })),
        cues: [],
      },
      observations: [],
      recommendations: [],
    };
    expect(parseAnalysisResult(base).locale).toBe("en");
    expect(parseAnalysisResult({ ...base, locale: "ko" }).locale).toBe("ko");
    expect(() => parseAnalysisResult({ ...base, locale: "fr" })).toThrow();
  });
});
