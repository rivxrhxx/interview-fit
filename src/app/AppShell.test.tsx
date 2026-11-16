// Task 2.1 — verifies R8.1 (keyboard operable flow, visible focus targets, labeled controls).
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AppShell } from "./AppShell";
import { FLOW_STEPS, STEP_META, type FlowStep } from "./flow";

function renderShell(step: FlowStep) {
  return render(
    <AppShell step={step}>
      <button type="button">Primary action</button>
    </AppShell>,
  );
}

describe("AppShell state rendering", () => {
  it.each(FLOW_STEPS)("renders the %s step heading and marks it current", (step) => {
    renderShell(step);

    expect(screen.getByRole("heading", { level: 1, name: STEP_META[step].heading })).toBeInTheDocument();

    const progress = screen.getByRole("navigation", { name: "Progress" });
    const current = within(progress).getByText(STEP_META[step].label).closest("li");
    expect(current).toHaveAttribute("aria-current", "step");
    expect(within(progress).getAllByRole("listitem")).toHaveLength(FLOW_STEPS.length);
  });

  it("announces the current step through a polite status region", () => {
    renderShell("consenting");

    expect(screen.getByRole("status")).toHaveTextContent(
      `Step 3 of ${FLOW_STEPS.length}: ${STEP_META.consenting.label}`,
    );
  });

  it("renders the error state without marking a progress step as current", () => {
    renderShell("error");

    expect(screen.getByRole("heading", { level: 1, name: STEP_META.error.heading })).toBeInTheDocument();
    const progress = screen.getByRole("navigation", { name: "Progress" });
    expect(within(progress).queryByRole("listitem", { current: "step" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(STEP_META.error.label);
  });

  it("labels completed steps for assistive technology", () => {
    renderShell("analyzing");

    const progress = screen.getByRole("navigation", { name: "Progress" });
    const completed = within(progress).getAllByText("(completed)");
    expect(completed).toHaveLength(FLOW_STEPS.indexOf("analyzing"));
  });
});

describe("AppShell keyboard navigation", () => {
  it("offers a skip link as the first tab stop", async () => {
    const user = userEvent.setup();
    renderShell("draft");

    await user.tab();

    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveFocus();
  });

  it("moves focus into the main region when the skip link is activated", async () => {
    const user = userEvent.setup();
    renderShell("draft");

    await user.tab();
    await user.keyboard("{Enter}");

    expect(screen.getByRole("main")).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "Primary action" })).toHaveFocus();
  });

  it("does not steal focus on first render", () => {
    renderShell("draft");

    expect(document.body).toHaveFocus();
  });

  it("moves focus to the new step heading after a step change", () => {
    const { rerender } = renderShell("draft");

    rerender(
      <AppShell step="image-ready">
        <button type="button">Primary action</button>
      </AppShell>,
    );

    expect(screen.getByRole("heading", { level: 1, name: STEP_META["image-ready"].heading })).toHaveFocus();
  });
});
