// Task 3.1 — draft-step integration for R1.1 and R1.3.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App draft step", () => {
  it("keeps the user on the draft step when the job description is empty (R1.1)", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Save job description" }));

    expect(screen.getByText("Enter a job description to continue.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Step 1 of 7");
  });

  it("saves a job description, shows it as text, and allows editing", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText("Job description"), "Account executive — client meetings on video");
    await user.click(screen.getByRole("button", { name: "Save job description" }));

    expect(screen.getByText("Account executive — client meetings on video")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit job description" }));
    expect(screen.getByLabelText("Job description")).toHaveValue("Account executive — client meetings on video");
  });
});
