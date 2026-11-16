// Task 3.1 — verifies R1.1, R1.2, R1.3 at the UI boundary.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { JOB_DESCRIPTION_MAX_LENGTH } from "../../lib/validation/limits";
import { JobDescriptionForm } from "./JobDescriptionForm";
import { JobDescriptionSummary } from "./JobDescriptionSummary";
import { validateJobDescription } from "./validation";

function setup(initialText = "") {
  const onSubmit = vi.fn();
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  const user = userEvent.setup();
  render(<JobDescriptionForm initialText={initialText} onSubmit={onSubmit} />);
  const field = screen.getByLabelText("Job description");
  const submit = screen.getByRole("button", { name: "Save job description" });
  return { onSubmit, fetchSpy, user, field, submit };
}

describe("JobDescriptionForm", () => {
  it("shows an inline message and does not continue when submitted empty (R1.1)", async () => {
    const { onSubmit, fetchSpy, user, field, submit } = setup();

    await user.click(submit);

    expect(screen.getByText("Enter a job description to continue.")).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription(expect.stringContaining("Enter a job description to continue."));
    expect(field).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects over-limit input before any network call (R1.2)", async () => {
    const { onSubmit, fetchSpy, user, submit } = setup("a".repeat(JOB_DESCRIPTION_MAX_LENGTH + 5));

    await user.click(submit);

    expect(screen.getByText(/Shorten the job description to 12,000 characters or fewer/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not silently truncate pasted text", async () => {
    const { user, field } = setup();
    const longText = "b".repeat(JOB_DESCRIPTION_MAX_LENGTH + 1);

    await user.click(field);
    await user.paste(longText);

    expect(field).toHaveValue(longText);
    expect(screen.getByText(`${(JOB_DESCRIPTION_MAX_LENGTH + 1).toLocaleString("en-US")} / 12,000 characters`)).toBeInTheDocument();
  });

  it("submits the normalized value when valid", async () => {
    const { onSubmit, user, field, submit } = setup();

    await user.type(field, "  Customer success manager, client-facing video calls  ");
    await user.click(submit);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ text: "Customer success manager, client-facing video calls" });
  });

  it("clears the inline error once the user fixes the input", async () => {
    const { user, field, submit } = setup();

    await user.click(submit);
    await user.type(field, "Data engineer");

    expect(screen.queryByText("Enter a job description to continue.")).not.toBeInTheDocument();
    expect(field).not.toHaveAttribute("aria-invalid");
  });

  it("is operable from the keyboard alone", async () => {
    const { onSubmit, user, field } = setup();

    await user.tab();
    expect(field).toHaveFocus();
    await user.keyboard("Backend developer");
    await user.tab();
    expect(screen.getByRole("button", { name: "Save job description" })).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe("JobDescriptionSummary", () => {
  it("renders untrusted markup as inert text (R1.3)", () => {
    const markup = '<img src=x onerror="alert(1)"><b>Designer</b>';
    const result = validateJobDescription(markup);
    if (!result.ok) throw new Error("expected valid job description");

    const { container } = render(<JobDescriptionSummary job={result.value} onEdit={() => {}} />);

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(screen.getByText(markup)).toBeInTheDocument();
  });
});
