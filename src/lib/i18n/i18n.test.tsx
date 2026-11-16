// Korean/English language setting: dictionary parity, switching, persistence, document
// language, localized analysis requests and reports, and accessibility in Korean.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import succeededFixture from "../../../packages/contracts/fixtures/analysis-job.succeeded.json";
import { buildReport } from "../../features/report/buildReport";
import { axeViolations } from "../../test/axe";
import { createMockAdapters } from "../../test/adapters";
import { JPEG_SIGNATURE, syntheticFile } from "../../test/images";
import { renderApp } from "../../test/renderApp";
import { parseAnalysisJob, type AnalysisResult } from "../api/contracts";
import { detectLocale } from ".";
import { en } from "./messages/en";
import { ko } from "./messages/ko";

const HANGUL = /[가-힣]/;

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.lang = "";
});

function shape(value: unknown): unknown {
  if (typeof value === "function") return "function";
  if (Array.isArray(value)) return value.map(shape);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, shape(entry)]));
  }
  return typeof value;
}

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

describe("dictionaries", () => {
  it("Korean has exactly the same keys, lists, and functions as English", () => {
    expect(shape(ko)).toEqual(shape(en));
  });

  it("has no empty Korean strings", () => {
    for (const text of strings(ko)) expect(text.trim().length).toBeGreaterThan(0);
  });
});

describe("language detection", () => {
  it("prefers a saved choice, then the system language", () => {
    const languages = vi.spyOn(navigator, "languages", "get").mockReturnValue(["ko-KR"]);
    expect(detectLocale()).toBe("ko");
    languages.mockReturnValue(["en-US"]);
    expect(detectLocale()).toBe("en");
    window.localStorage.setItem("interview-fit.locale", "ko");
    expect(detectLocale()).toBe("ko");
  });
});

describe("switching language", () => {
  it("renders Korean, sets the document language, and switches back to English", async () => {
    const user = userEvent.setup();
    renderApp(createMockAdapters(), undefined, "ko");

    expect(screen.getByRole("heading", { level: 1, name: "지원할 공고를 알려주세요" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("ko");
    expect(screen.getByRole("button", { name: "한국어" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "English" }));

    expect(screen.getByRole("heading", { level: 1, name: "Tell us about the role" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en");
    expect(window.localStorage.getItem("interview-fit.locale")).toBe("en");
  });

  it("keeps what the user typed when the language changes", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByLabelText("Job description"), "Backend engineer");
    await user.click(screen.getByRole("button", { name: "한국어" }));

    expect(screen.getByLabelText("채용 공고")).toHaveValue("Backend engineer");
  });
});

describe("Korean flow", () => {
  it("shows Korean consent and asks the backend for Korean guidance", async () => {
    const adapters = createMockAdapters();
    const user = userEvent.setup();
    renderApp(adapters, undefined, "ko");

    await user.type(screen.getByLabelText("채용 공고"), "금융권 컨설턴트, 화상 면접");
    await user.click(screen.getByRole("button", { name: "공고 분석하기" }));
    await user.upload(await screen.findByLabelText("사진 파일"), syntheticFile(JPEG_SIGNATURE, "me.jpg", "image/jpeg"));
    await user.click(await screen.findByRole("button", { name: "이 사진 쓰기" }));

    const checkbox = screen.getByRole("checkbox", { name: /사진과 채용 공고를 Interview Fit과 제공자에게 보내는 데 동의해요/ });
    expect(checkbox).not.toBeChecked();
    expect(await axeViolations()).toEqual([]);
    await user.click(checkbox);
    await user.click(screen.getByRole("button", { name: "동의하고 분석하기" }));

    await vi.waitFor(() => expect(adapters.api.createAnalysisJob).toHaveBeenCalled());
    expect(vi.mocked(adapters.api.createAnalysisJob).mock.calls[0][0].locale).toBe("ko");
    expect(await screen.findByRole("heading", { level: 1, name: "면접 준비 가이드" })).toBeInTheDocument();
  });

  it("tells the user when the guidance was generated in the other language", async () => {
    const user = userEvent.setup();
    renderApp(createMockAdapters(), undefined, "ko");
    await user.type(screen.getByLabelText("채용 공고"), "Consultant");
    await user.click(screen.getByRole("button", { name: "공고 분석하기" }));
    await user.upload(await screen.findByLabelText("사진 파일"), syntheticFile(JPEG_SIGNATURE, "me.jpg", "image/jpeg"));
    await user.click(await screen.findByRole("button", { name: "이 사진 쓰기" }));
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "동의하고 분석하기" }));

    // The mocked backend fixture is English.
    expect(await screen.findByText("이 가이드는 영어로 만들어졌어요. 한국어로 받으려면 처음부터 다시 시작해 주세요.")).toBeInTheDocument();
  });
});

describe("Korean report", () => {
  const result = parseAnalysisJob(succeededFixture).result as AnalysisResult;

  it("uses Korean headings and still never embeds image data", () => {
    const text = buildReport({ result, tryOn: "created", generatedAt: new Date("2026-11-16T09:30:00Z"), locale: "ko" });

    expect(text).toMatch(/^# Interview Fit 리포트/);
    expect(text).toContain("## 공고 맥락");
    expect(text).toContain("- 확인한 점: ");
    expect(text).toContain("## 개인정보");
    expect(text).toMatch(HANGUL);
    expect(text).not.toMatch(/!\[|<img|data:image|blob:/i);
  });
});
