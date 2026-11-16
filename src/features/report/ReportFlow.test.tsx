// Task 9.1 — report step: explicit export only, text-only payload (R7.2), and clear
// saved / cancelled / failed outcomes.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReportExportError } from "../../lib/tauri";
import { createMockAdapters } from "../../test/adapters";
import { JPEG_SIGNATURE, syntheticFile } from "../../test/images";
import { renderApp } from "../../test/renderApp";

async function reachGuidance(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Job description"), "Client-facing consultant. Interviews are held over video.");
  await user.click(screen.getByRole("button", { name: "Analyze posting" }));
  await user.upload(await screen.findByLabelText("Photo file"), syntheticFile(JPEG_SIGNATURE, "me.jpg", "image/jpeg"));
  await user.click(await screen.findByRole("button", { name: "Use this photo" }));
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "Agree and analyze" }));
  await screen.findByRole("heading", { level: 1, name: "Your presentation guidance" });
}

describe("report step", () => {
  it("shows the report and saves only after an explicit action, sending text only (R7.2)", async () => {
    const adapters = createMockAdapters();
    const user = userEvent.setup();
    renderApp(adapters);
    await reachGuidance(user);

    await user.click(screen.getByRole("button", { name: "Create report" }));

    expect(screen.getByRole("heading", { level: 1, name: "Your report is ready" })).toBeInTheDocument();
    expect(screen.getByText(/# Interview Fit report/)).toBeInTheDocument();
    expect(screen.getByText("Your photo is not included. Saving creates a text file only where you choose.")).toBeInTheDocument();
    expect(adapters.report.save).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Save report…" }));

    expect(adapters.report.save).toHaveBeenCalledTimes(1);
    const [payload] = vi.mocked(adapters.report.save).mock.calls[0];
    expect(Object.keys(payload).sort()).toEqual(["contents", "suggestedName"]);
    expect(typeof payload.contents).toBe("string");
    expect(payload.contents).not.toMatch(/!\[|<img|data:image|blob:/i);
    expect(payload.suggestedName).toMatch(/^interview-fit-report-\d{4}-\d{2}-\d{2}\.md$/);
    expect(await screen.findByText("Report saved.")).toBeInTheDocument();
  });

  it("reports the try-on status from the try-on step", async () => {
    const adapters = createMockAdapters();
    const user = userEvent.setup();
    renderApp(adapters);
    await reachGuidance(user);
    await user.click(screen.getByRole("button", { name: "Preview interview attire" }));
    await user.click(screen.getByRole("button", { name: "Generate preview" }));
    await screen.findByRole("img", { name: "Navy blazer preview" });

    await user.click(screen.getByRole("button", { name: "Continue to report" }));

    expect(screen.getByText(/A navy blazer preview was created during this session/)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("tells the user when the save dialog was cancelled", async () => {
    const adapters = createMockAdapters({ report: { save: vi.fn(async () => "cancelled" as const) } });
    const user = userEvent.setup();
    renderApp(adapters);
    await reachGuidance(user);
    await user.click(screen.getByRole("button", { name: "Create report" }));

    await user.click(screen.getByRole("button", { name: "Save report…" }));

    expect(await screen.findByText("Save cancelled. Nothing was written.")).toBeInTheDocument();
  });

  it("shows a neutral error when saving fails", async () => {
    const adapters = createMockAdapters({
      report: { save: vi.fn(async () => Promise.reject(new ReportExportError("REPORT_SAVE_FAILED"))) },
    });
    const user = userEvent.setup();
    renderApp(adapters);
    await reachGuidance(user);
    await user.click(screen.getByRole("button", { name: "Create report" }));

    await user.click(screen.getByRole("button", { name: "Save report…" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The report could not be saved. Choose another location and try again.");
  });

  it("returns to guidance without losing the analysis", async () => {
    const user = userEvent.setup();
    renderApp();
    await reachGuidance(user);
    await user.click(screen.getByRole("button", { name: "Create report" }));

    await user.click(screen.getByRole("button", { name: "Back to guidance" }));

    expect(screen.getByRole("heading", { level: 1, name: "Your presentation guidance" })).toBeInTheDocument();
  });
});
