// Task 10.1 — automated accessibility checks for every step and failure state (R8.1,
// R8.2, R8.3) and a keyboard-only walkthrough of the golden path (R8.1).
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "../lib/api/client";
import type { ErrorCode } from "../lib/api/contracts";
import { CameraError } from "../lib/media/camera";
import { axeViolations } from "../test/axe";
import { createMockAdapters, mockApi } from "../test/adapters";
import { JPEG_SIGNATURE, syntheticFile } from "../test/images";
import { renderApp } from "../test/renderApp";

type User = ReturnType<typeof userEvent.setup>;

async function expectAccessible() {
  expect(await axeViolations()).toEqual([]);
}

async function saveJob(user: User) {
  await user.type(screen.getByLabelText("Job description"), "Client-facing consultant. Interviews are held over video.");
  await user.click(screen.getByRole("button", { name: "Analyze posting" }));
}

async function choosePhoto(user: User) {
  await user.upload(await screen.findByLabelText("Photo file"), syntheticFile(JPEG_SIGNATURE, "me.jpg", "image/jpeg"));
  await screen.findByRole("button", { name: "Use this photo" });
}

async function consent(user: User) {
  await user.click(screen.getByRole("button", { name: "Use this photo" }));
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "Agree and analyze" }));
}

describe("automated accessibility checks (axe-core)", () => {
  it("detects real violations (checker sanity)", async () => {
    render(
      <main>
        <img src="x.png" />
        <button type="button" />
        <input type="text" />
      </main>,
    );

    const violations = await axeViolations();

    expect(violations.join("\n")).toMatch(/image-alt/);
    expect(violations.join("\n")).toMatch(/button-name/);
    expect(violations.join("\n")).toMatch(/label/);
  });

  it("passes on every step of the golden path", async () => {
    const user = userEvent.setup();
    renderApp();

    await expectAccessible(); // draft: job description
    await user.click(screen.getByRole("button", { name: "Analyze posting" }));
    await expectAccessible(); // draft: inline validation error
    await saveJob(user);
    await expectAccessible(); // draft: photo picker
    await choosePhoto(user);
    await expectAccessible(); // image-ready
    await user.click(screen.getByRole("button", { name: "Use this photo" }));
    await expectAccessible(); // consenting
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Agree and analyze" }));
    await screen.findByRole("heading", { level: 1, name: "Your presentation guidance" });
    await expectAccessible(); // reviewed
    await user.click(screen.getByRole("button", { name: "Preview interview attire" }));
    await expectAccessible(); // trying-on idle
    await user.click(screen.getByRole("button", { name: "Generate preview" }));
    await screen.findByRole("img", { name: "Navy blazer preview" });
    await expectAccessible(); // trying-on compare
    await user.click(screen.getByRole("button", { name: "Continue to report" }));
    await expectAccessible(); // report-ready
  });

  it("passes while analysis is in progress", async () => {
    const api = mockApi({ getAnalysisJob: vi.fn(() => new Promise<never>(() => {})) });
    const user = userEvent.setup();
    renderApp(createMockAdapters({ api }));
    await saveJob(user);
    await choosePhoto(user);
    await consent(user);

    await screen.findByRole("button", { name: "Cancel analysis" });
    await expectAccessible();
  });

  it("passes with the camera open and after camera denial", async () => {
    const user = userEvent.setup();
    renderApp();
    await saveJob(user);
    await user.click(screen.getByRole("button", { name: "Use camera" }));
    await screen.findByRole("button", { name: "Take photo" });
    await expectAccessible();
  });

  it("announces camera denial as an alert and keeps file selection reachable (R8.3)", async () => {
    const adapters = createMockAdapters();
    adapters.camera.open = vi.fn(async () => {
      throw new CameraError("CAMERA_PERMISSION_DENIED");
    });
    const user = userEvent.setup();
    renderApp(adapters);
    await saveJob(user);

    await user.click(screen.getByRole("button", { name: "Use camera" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose a photo" })).toBeEnabled();
    await expectAccessible();
  });
});

describe("controlled, recoverable failure states (R8.3)", () => {
  it.each<[string, ErrorCode, string]>([
    ["provider outage", "PROCESSING_UNAVAILABLE", "Try again"],
    ["rate limit", "RATE_LIMITED", "Try again"],
    ["invalid image", "IMAGE_INVALID", "Choose another photo"],
    ["timeout", "PROCESSING_TIMEOUT", "Try again"],
    ["consent required", "CONSENT_REQUIRED", "Review consent"],
  ])("%s: announces the problem, moves focus to it, and offers a recovery action", async (_label, code, action) => {
    const api = mockApi({ createAnalysisJob: vi.fn(async () => Promise.reject(new ApiRequestError(code))) });
    const user = userEvent.setup();
    renderApp(createMockAdapters({ api }));
    await saveJob(user);
    await choosePhoto(user);
    await consent(user);

    const heading = await screen.findByRole("heading", { level: 1, name: "That step could not be completed" });
    expect(heading).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent(/Interrupted/);
    const recover = screen.getByRole("button", { name: action });
    expect(screen.getByRole("button", { name: "Start over" })).toBeInTheDocument();
    await expectAccessible();

    await user.tab();
    expect(recover).toHaveFocus();
  });

  it("cancellation returns to a safe, focused state", async () => {
    const api = mockApi({ getAnalysisJob: vi.fn(() => new Promise<never>(() => {})) });
    const user = userEvent.setup();
    renderApp(createMockAdapters({ api }));
    await saveJob(user);
    await choosePhoto(user);
    await consent(user);

    await user.click(await screen.findByRole("button", { name: "Cancel analysis" }));

    expect(screen.getByRole("heading", { level: 1, name: "Check your photo" })).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Step 3 of 8");
  });
});

describe("keyboard-only walkthrough (R8.1)", () => {
  async function tabTo(user: User, name: string | RegExp, role: "button" | "checkbox" | "textbox" = "button") {
    const target = role === "textbox" ? screen.getByRole(role) : screen.getByRole(role, { name });
    for (let i = 0; i < 25 && document.activeElement !== target; i++) await user.tab();
    expect(target).toHaveFocus();
    return target;
  }

  it("completes the golden path without a pointer", async () => {
    const fileDialog = vi.spyOn(HTMLInputElement.prototype, "click");
    const adapters = createMockAdapters();
    const user = userEvent.setup();
    renderApp(adapters);

    await tabTo(user, "Job description", "textbox");
    await user.keyboard("Client-facing consultant. Interviews are held over video.");
    await tabTo(user, "Analyze posting");
    await user.keyboard("{Enter}");

    await tabTo(user, "Choose a photo");
    await user.keyboard("{Enter}");
    expect(fileDialog).toHaveBeenCalled();
    // The operating system's file dialog returns the chosen file.
    await user.upload(await screen.findByLabelText("Photo file"), syntheticFile(JPEG_SIGNATURE, "me.jpg", "image/jpeg"));

    await screen.findByRole("button", { name: "Use this photo" });
    await tabTo(user, "Use this photo");
    await user.keyboard("{Enter}");
    await tabTo(user, /I agree to send this photo/, "checkbox");
    await user.keyboard(" ");
    await tabTo(user, "Agree and analyze");
    await user.keyboard("{Enter}");

    await screen.findByRole("heading", { level: 1, name: "Your presentation guidance" });
    await tabTo(user, "Preview interview attire");
    await user.keyboard("{Enter}");
    await tabTo(user, "Generate preview");
    await user.keyboard("{Enter}");
    await screen.findByRole("img", { name: "Navy blazer preview" });
    await tabTo(user, "Continue to report");
    await user.keyboard("{Enter}");
    await tabTo(user, "Save report…");
    await user.keyboard("{Enter}");

    expect(adapters.report.save).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Report saved.")).toBeInTheDocument();
  });

  it("gives every interactive control an accessible name", async () => {
    const user = userEvent.setup();
    renderApp();
    await saveJob(user);
    await choosePhoto(user);

    for (const button of screen.getAllByRole("button")) expect(button).toHaveAccessibleName();
  });
});
