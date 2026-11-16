// Task 7.1 — desktop rendering of recommendations: R5.1 (cue evidence shown), R5.2
// (observation, adjustment, and rationale shown separately), R5.3 (client-side policy guard).
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import succeededFixture from "../../../packages/contracts/fixtures/analysis-job.succeeded.json";
import { parseAnalysisJob, type AnalysisResult } from "../../lib/api/contracts";
import { RecommendationList } from "./RecommendationList";

const result = parseAnalysisJob(succeededFixture).result as AnalysisResult;

describe("RecommendationList", () => {
  it("shows the job-context summary and each cue with its verbatim evidence (R5.1)", () => {
    render(<RecommendationList result={result} />);

    expect(screen.getByText(result.jobContext.summary)).toBeInTheDocument();
    for (const cue of result.jobContext.cues) {
      const item = screen.getByText(cue.label).closest("li")!;
      expect(item).toHaveTextContent(`“${cue.evidence}”`);
    }
  });

  it("labels observation, optional adjustment, and rationale separately (R5.2)", () => {
    render(<RecommendationList result={result} />);

    const items = within(screen.getByRole("list", { name: "Suggestions" })).getAllByRole("listitem");
    expect(items).toHaveLength(result.recommendations.length);
    const lighting = items[0];
    expect(within(lighting).getByText("What we noticed").nextElementSibling).toHaveTextContent(
      "The light source appears to be behind you.",
    );
    expect(within(lighting).getByText("Optional adjustment").nextElementSibling).toHaveTextContent(
      result.recommendations[0].adjustment,
    );
    expect(within(lighting).getByText("Why").nextElementSibling).toHaveTextContent(result.recommendations[0].rationale);
    expect(within(items[1]).getByText("What we noticed").nextElementSibling).toHaveTextContent("From the job description");
  });

  it("states that suggestions are optional and make no appearance or outcome judgments", () => {
    render(<RecommendationList result={result} />);

    expect(
      screen.getByText("These suggestions are optional. Interview Fit does not assess your appearance or predict interview outcomes."),
    ).toBeInTheDocument();
  });

  it("drops a prohibited claim even if the backend sent one (R5.3)", () => {
    const tampered: AnalysisResult = {
      ...result,
      jobContext: { ...result.jobContext, summary: "You are an attractive candidate who will be hired." },
      recommendations: [
        ...result.recommendations,
        {
          id: "rec_bad",
          category: "attire",
          observationId: null,
          adjustment: "Consider covering your acne.",
          rationale: "It hurts your chances of success.",
          cueIds: ["client-facing"],
        },
      ],
    };

    render(<RecommendationList result={tampered} />);

    expect(screen.queryByText(/acne|attractive|hired/)).not.toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Suggestions" })).getAllByRole("listitem")).toHaveLength(
      result.recommendations.length,
    );
  });

  it("renders markup in cue evidence as inert text", () => {
    const withMarkup: AnalysisResult = {
      ...result,
      jobContext: {
        ...result.jobContext,
        cues: [{ id: "client-facing", label: "Client-facing work", evidence: "<img src=x onerror=alert(1)>" }],
      },
    };

    const { container } = render(<RecommendationList result={withMarkup} />);

    expect(container.querySelector("img")).toBeNull();
  });
});
