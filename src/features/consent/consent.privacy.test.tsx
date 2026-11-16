// Task 5.1 — privacy suite for R3.1 (unchecked consent describing purpose and recipients)
// and R3.2 (declining uploads zero image bytes and keeps non-image features usable).
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { JPEG_SIGNATURE, syntheticFile } from "../../test/images";
import { spyOnNetwork } from "../../test/network";
import { renderApp } from "../../test/renderApp";
import { ConsentGate } from "./ConsentGate";
import { CONSENT_VERSION, createConsentRecord, isConsentCurrent } from "./consent";

async function reachConsentStep(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Job description"), "Client-facing consultant, video interviews");
  await user.click(screen.getByRole("button", { name: "Save job description" }));
  await user.upload(screen.getByLabelText("Photo file"), syntheticFile(JPEG_SIGNATURE, "me.jpg", "image/jpeg"));
  await user.click(await screen.findByRole("button", { name: "Use this photo" }));
  await screen.findByRole("heading", { level: 1, name: "Review how your photo is used" });
}

describe("ConsentGate", () => {
  it("renders an unchecked consent control that names the purpose and recipients (R3.1)", () => {
    render(<ConsentGate onAccept={() => {}} onDecline={() => {}} />);

    const checkbox = screen.getByRole("checkbox", { name: /I agree to send this photo and job description/ });
    expect(checkbox).not.toBeChecked();
    expect(screen.getByRole("heading", { name: "Why" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Who receives it" })).toBeInTheDocument();
    expect(screen.getByText(/Interview Fit backend/)).toBeInTheDocument();
    expect(screen.getByText(/YouCam/)).toBeInTheDocument();
    expect(screen.getByText(`Consent version ${CONSENT_VERSION}`)).toBeInTheDocument();
  });

  it("does not accept until the box is checked", async () => {
    const onAccept = vi.fn();
    const user = userEvent.setup();
    render(<ConsentGate onAccept={onAccept} onDecline={() => {}} />);

    await user.click(screen.getByRole("button", { name: "Agree and analyze" }));

    expect(onAccept).not.toHaveBeenCalled();
    expect(screen.getByText("Check the box to agree, or choose Not now.")).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toHaveFocus();
  });

  it("returns a consent record for the current version once checked", async () => {
    const onAccept = vi.fn();
    const user = userEvent.setup();
    render(<ConsentGate onAccept={onAccept} onDecline={() => {}} />);

    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Agree and analyze" }));

    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onAccept.mock.calls[0][0]).toMatchObject({ version: CONSENT_VERSION });
  });
});

describe("consent versioning", () => {
  it("treats a record from a different consent version as invalid", () => {
    const current = createConsentRecord(new Date("2026-11-16T00:00:00Z"));
    const stale = { ...current, version: "2025-01-01.v0" };

    expect(isConsentCurrent(current)).toBe(true);
    expect(isConsentCurrent(stale)).toBe(false);
    expect(isConsentCurrent(current, "2027-01-01.v2")).toBe(false);
  });
});

describe("consent gate in the flow", () => {
  it("shows the gate before anything is uploaded and starts unchecked (R3.1)", async () => {
    const network = spyOnNetwork();
    const user = userEvent.setup();
    renderApp();

    await reachConsentStep(user);

    expect(screen.getByRole("checkbox")).not.toBeChecked();
    network.expectNothingSent();
  });

  it("uploads zero bytes when consent is declined and keeps the job description usable (R3.2)", async () => {
    const network = spyOnNetwork();
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const user = userEvent.setup();
    renderApp();
    await reachConsentStep(user);

    await user.click(screen.getByRole("button", { name: "Not now" }));

    network.expectNothingSent();
    expect(revoke).toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Your photo was discarded and nothing was uploaded.");
    expect(screen.queryByRole("img", { name: "Selected photo preview" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit job description" }));
    expect(screen.getByLabelText("Job description")).toHaveValue("Client-facing consultant, video interviews");
  });

  it("calls the upload adapter only after explicit agreement, never raw network APIs", async () => {
    const network = spyOnNetwork();
    const user = userEvent.setup();
    const { adapters } = renderApp();
    await reachConsentStep(user);

    expect(adapters.api.createAnalysisJob).not.toHaveBeenCalled();
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Agree and analyze" }));

    await vi.waitFor(() => expect(adapters.api.createAnalysisJob).toHaveBeenCalledTimes(1));
    expect(vi.mocked(adapters.api.createAnalysisJob).mock.calls[0][0].consentVersion).toBe(CONSENT_VERSION);
    network.expectNothingSent();
  });

  it("asks for consent again after the photo changes", async () => {
    const user = userEvent.setup();
    renderApp();
    await reachConsentStep(user);
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Agree and analyze" }));

    await user.click(await screen.findByRole("button", { name: "Start over" }));
    await user.upload(screen.getByLabelText("Photo file"), syntheticFile(JPEG_SIGNATURE, "other.jpg", "image/jpeg"));
    await user.click(await screen.findByRole("button", { name: "Use this photo" }));

    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });
});
