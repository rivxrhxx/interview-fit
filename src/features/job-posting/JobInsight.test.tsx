// Task 12.2 — job and company-atmosphere analysis step: R1.4 (each point quotes the
// posting or says it is not stated), R1.5 (notice before text leaves the device; text
// only), R1.6 (source label), retry and edit, policy defense, and accessibility.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import jobAnalysisFixture from "../../../packages/contracts/fixtures/job-analysis.succeeded.json";
import { ApiRequestError } from "../../lib/api";
import { parseJobAnalysis, type JobAnalysis } from "../../lib/api/contracts";
import { axeViolations } from "../../test/axe";
import { createMockAdapters, mockApi } from "../../test/adapters";
import { renderApp } from "../../test/renderApp";

const POSTING = "Client-facing consultant. Interviews are held over video.";

function analysis(patch: Partial<JobAnalysis["jobContext"]> = {}): JobAnalysis {
  const base = parseJobAnalysis(jobAnalysisFixture);
  return { ...base, jobContext: { ...base.jobContext, ...patch } };
}

async function analyze(user: ReturnType<typeof userEvent.setup>, text = POSTING) {
  await user.type(screen.getByLabelText("Job description"), text);
  await user.click(screen.getByRole("button", { name: "Analyze posting" }));
}

describe("job analysis step", () => {
  it("says what is sent before the posting leaves the device (R1.5)", () => {
    renderApp();

    expect(
      screen.getByText(
        "Analyzing sends the posting text to the Interview Fit backend and its AI provider (Anthropic). No photo is sent at this step.",
      ),
    ).toBeInTheDocument();
  });

  it("sends only the posting text and the language, never an image (R1.5)", async () => {
    const adapters = createMockAdapters();
    const user = userEvent.setup();
    renderApp(adapters);

    await analyze(user);

    await screen.findByRole("heading", { level: 2, name: "Job analysis" });
    expect(adapters.api.analyzeJob).toHaveBeenCalledWith({ jobDescription: POSTING, locale: "en" }, expect.any(AbortSignal));
    expect(adapters.api.createAnalysisJob).not.toHaveBeenCalled();
    expect(adapters.image.prepare).not.toHaveBeenCalled();
  });

  it("shows each point with its quote, or that the posting does not say (R1.4)", async () => {
    const user = userEvent.setup();
    renderApp();

    await analyze(user);

    await screen.findByText("Consulting");
    const points = screen.getAllByRole("term");
    expect(points.map((term) => term.textContent)).toEqual(["Role", "Industry", "Atmosphere", "Interview format", "Dress code"]);
    expect(screen.getByText("“interviews are held over video”")).toBeInTheDocument();
    expect(screen.getAllByText("Not stated in the posting")).toHaveLength(2);
    expect(screen.getByText("Basic analysis")).toBeInTheDocument();
  });

  it("marks the suggested dress formality on the scale", async () => {
    const user = userEvent.setup();
    renderApp();

    await analyze(user);

    const scale = (await screen.findByText("Suggested dress formality")).nextElementSibling as HTMLElement;
    const current = within(scale).getByText("Business casual").closest("li");
    expect(current).toHaveAttribute("aria-current", "true");
    expect(within(scale).getAllByRole("listitem").filter((item) => item.hasAttribute("aria-current"))).toHaveLength(1);
  });

  it("labels an AI-written analysis", async () => {
    const api = mockApi({ analyzeJob: vi.fn(async () => analysis({ source: "ai" })) });
    const user = userEvent.setup();
    renderApp(createMockAdapters({ api }));

    await analyze(user);

    expect(await screen.findByText("AI analysis")).toBeInTheDocument();
    expect(screen.queryByText(/basic keyword analysis/)).not.toBeInTheDocument();
  });

  it("offers the photo step only after the analysis is shown", async () => {
    let resolve: (value: JobAnalysis) => void = () => {};
    const api = mockApi({ analyzeJob: vi.fn(() => new Promise<JobAnalysis>((done) => (resolve = done))) });
    const user = userEvent.setup();
    renderApp(createMockAdapters({ api }));

    await analyze(user);

    expect(await screen.findByText("Reading the posting…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Choose a photo" })).not.toBeInTheDocument();
    resolve(analysis());
    expect(await screen.findByRole("button", { name: "Choose a photo" })).toBeInTheDocument();
  });

  it("retries after a failure and keeps the posting editable", async () => {
    const analyzeJob = vi
      .fn()
      .mockRejectedValueOnce(new ApiRequestError("PROCESSING_UNAVAILABLE"))
      .mockResolvedValueOnce(analysis());
    const user = userEvent.setup();
    renderApp(createMockAdapters({ api: mockApi({ analyzeJob }) }));

    await analyze(user);

    expect(await screen.findByRole("alert")).toHaveTextContent("The posting could not be analyzed.");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Choose a photo" })).toBeInTheDocument();
    expect(analyzeJob).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole("button", { name: "Edit job description" }));
    expect(screen.getByLabelText("Job description")).toHaveValue(POSTING);
  });

  it("aborts the request when the user goes back to edit the posting", async () => {
    let signal: AbortSignal | undefined;
    const api = mockApi({
      analyzeJob: vi.fn((_input, abort?: AbortSignal) => {
        signal = abort;
        return new Promise<JobAnalysis>(() => {});
      }),
    });
    const user = userEvent.setup();
    renderApp(createMockAdapters({ api }));

    await analyze(user);
    await user.click(await screen.findByRole("button", { name: "Edit job description" }));

    expect(signal?.aborted).toBe(true);
  });

  it("hides a finding that fails the content policy, even if the backend sent it", async () => {
    const base = analysis();
    const tampered = analysis({
      points: base.jobContext.points.map((point) =>
        point.id === "atmosphere" ? { id: "atmosphere", value: "Young and attractive team", evidence: "young and attractive" } : point,
      ),
    });
    const user = userEvent.setup();
    renderApp(createMockAdapters({ api: mockApi({ analyzeJob: vi.fn(async () => tampered) }) }));

    await analyze(user);

    await screen.findByText("Consulting");
    expect(screen.queryByText(/attractive/)).not.toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const user = userEvent.setup();
    renderApp();

    await analyze(user);
    await screen.findByRole("button", { name: "Choose a photo" });

    expect(await axeViolations()).toEqual([]);
  });

  it("asks for Korean when the app is in Korean", async () => {
    const adapters = createMockAdapters();
    const user = userEvent.setup();
    renderApp(adapters, undefined, "ko");

    await user.type(screen.getByLabelText("채용 공고"), "금융권 컨설턴트");
    await user.click(screen.getByRole("button", { name: "공고 분석하기" }));

    await screen.findByRole("heading", { level: 2, name: "공고 분석" });
    expect(adapters.api.analyzeJob).toHaveBeenCalledWith({ jobDescription: "금융권 컨설턴트", locale: "ko" }, expect.any(AbortSignal));
  });
});
