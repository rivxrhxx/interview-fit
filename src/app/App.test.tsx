// Draft and image-ready integration: R1.1, R1.3 (task 3.1); R2.3, R3.3 and object URL cleanup (task 4.1).
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { JPEG_SIGNATURE, syntheticFile } from "../test/images";
import { renderApp } from "../test/renderApp";

async function saveJob(user: ReturnType<typeof userEvent.setup>, text = "Account executive — client meetings on video") {
  await user.type(screen.getByLabelText("Job description"), text);
  await user.click(screen.getByRole("button", { name: "Analyze posting" }));
}

describe("App draft step", () => {
  it("keeps the user on the draft step when the job description is empty (R1.1)", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: "Analyze posting" }));

    expect(screen.getByText("Enter a job description to continue.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Step 1 of 8");
  });

  it("saves a job description, shows it as text, and allows editing", async () => {
    const user = userEvent.setup();
    renderApp();

    await saveJob(user);

    expect(screen.getByText("Account executive — client meetings on video")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit job description" }));
    expect(screen.getByLabelText("Job description")).toHaveValue("Account executive — client meetings on video");
  });

  it("only offers photo selection after a job description is saved", async () => {
    const user = userEvent.setup();
    renderApp();

    expect(screen.queryByRole("button", { name: "Choose a photo" })).not.toBeInTheDocument();
    await saveJob(user);
    expect(await screen.findByRole("button", { name: "Choose a photo" })).toBeInTheDocument();
  });
});

describe("App image-ready step", () => {
  it("previews the normalized image and revokes its object URL when the photo is removed", async () => {
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview-1");
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const user = userEvent.setup();
    renderApp();

    await saveJob(user);
    await user.upload(await screen.findByLabelText("Photo file"), syntheticFile(JPEG_SIGNATURE, "me.jpg", "image/jpeg"));

    const preview = await screen.findByRole("img", { name: "Selected photo preview" });
    expect(preview).toHaveAttribute("src", "blob:preview-1");
    expect(screen.getByRole("status")).toHaveTextContent("Step 3 of 8");
    const normalizedBlob = create.mock.calls[0][0];
    expect(normalizedBlob).toBeInstanceOf(Blob);

    await user.click(screen.getByRole("button", { name: "Remove photo" }));

    expect(revoke).toHaveBeenCalledWith("blob:preview-1");
    expect(screen.queryByRole("img", { name: "Selected photo preview" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Step 2 of 8");
    expect(screen.getByText("Account executive — client meetings on video")).toBeInTheDocument();
  });
});
