// @vitest-environment node
// Task 7.1 — content policy for R5.3: no medical, attractiveness, protected-trait,
// personality, emotion, employability, or hiring-outcome claims.
import { describe, expect, it } from "vitest";
import { findPolicyViolation, passesContentPolicy } from "./policy.ts";

describe("content policy", () => {
  it.each([
    ["medical", "Your acne is visible; consider a dermatologist."],
    ["medical", "This could be a skin condition."],
    ["medical", "You look tired and unwell."],
    ["attractiveness", "You are very attractive."],
    ["attractiveness", "Beauty score: 8/10"],
    ["attractiveness", "Your facial symmetry is above average."],
    ["attractiveness", "Your face shape is oval."],
    ["protected-trait", "As a woman in her 30s, you should wear…"],
    ["protected-trait", "Your ethnicity suggests a warm palette."],
    ["protected-trait", "Your skin tone suits navy."],
    ["protected-trait", "You look 34 years old."],
    ["personality", "You come across as trustworthy and intelligent."],
    ["emotion", "You look nervous in this photo."],
    ["hiring", "You will likely be hired."],
    ["hiring", "This increases your chances of success in the interview."],
    ["hiring", "You are a top candidate."],
    ["hiring", "Recruiters will rank you higher."],
  ])("flags a %s claim: %s", (category, text) => {
    expect(findPolicyViolation(text)).toBe(category);
    expect(passesContentPolicy(text)).toBe(false);
  });

  it.each([
    "Consider facing a window or adding a soft lamp in front of you for clearer video.",
    "Consider neat, comfortable smart-casual clothing; full business attire is often optional.",
    "The photo resolution (1280×720) is enough for a clear video preview.",
    "Your head appears tilted.",
    "The posting mentions client meetings, a setting where business attire is common.",
    "Consider a tidy, uncluttered background or a plain wall behind you.",
    "Consider an outfit that feels polished and true to your personal style.",
    "The image is in landscape orientation, like a typical video call frame.",
    "Hold the camera steady and frame your head and shoulders.",
  ])("allows neutral guidance: %s", (text) => {
    expect(findPolicyViolation(text)).toBeNull();
  });

  // Review finding 5: grooming and gendered wording an AI writer could produce.
  it.each([
    ["medical", "Consider hiding redness and dark spots."],
    ["medical", "Cover pimples or breakouts before the call."],
    ["medical", "Blackheads and scars may show on camera."],
    ["medical", "홍조나 트러블을 컨실러로 가려 보세요."],
    ["medical", "각질이 보일 수 있어요."],
    ["protected-trait", "A feminine updo, a popular choice for ladies."],
    ["protected-trait", "A masculine look; gentlemen often choose it."],
    ["protected-trait", "숙녀다운 스타일을 고려해 보세요."],
  ] as const)("flags %s wording: %s", (category, text) => {
    expect(findPolicyViolation(text)).toBe(category);
  });

  it("does not flag troubleshooting in a posting", () => {
    expect(passesContentPolicy("서버 트러블슈팅 경험")).toBe(true);
  });
});
