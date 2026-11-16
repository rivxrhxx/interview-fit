// Task 8.1 — one curated try-on in the desktop flow: R6.1 (exactly one style), R6.2
// (original/result comparison and reset), R6.3 (no implicit persistence), cancellation.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import succeededFixture from "../../../packages/contracts/fixtures/analysis-job.succeeded.json";
import { ApiRequestError } from "../../lib/api/client";
import { parseAnalysisJob, type TryOnJob } from "../../lib/api/contracts";
import { createMockAdapters, mockApi, queuedTryOn } from "../../test/adapters";
import { JPEG_SIGNATURE, syntheticFile } from "../../test/images";
import { renderApp } from "../../test/renderApp";

const analysis = parseAnalysisJob(succeededFixture);
const runningTryOn: TryOnJob = { ...queuedTryOn(), state: "processing" };

async function reachGuidance(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Job description"), "Client-facing consultant. Interviews are held over video.");
  await user.click(screen.getByRole("button", { name: "Save job description" }));
  await user.upload(screen.getByLabelText("Photo file"), syntheticFile(JPEG_SIGNATURE, "me.jpg", "image/jpeg"));
  await user.click(await screen.findByRole("button", { name: "Use this photo" }));
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "Agree and analyze" }));
  await screen.findByRole("heading", { level: 1, name: "Your presentation guidance" });
}

async function openTryOn(user: ReturnType<typeof userEvent.setup>) {
  await reachGuidance(user);
  await user.click(screen.getByRole("button", { name: "Preview interview attire" }));
  await screen.findByRole("heading", { level: 1, name: "Preview interview attire" });
}

function urlSpies() {
  let counter = 0;
  const create = vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:url-${++counter}`);
  const revoke = vi.spyOn(URL, "revokeObjectURL");
  return { create, revoke };
}

describe("virtual try-on step", () => {
  it("offers exactly one curated style and no style picker (R6.1)", async () => {
    const user = userEvent.setup();
    renderApp();

    await openTryOn(user);

    const style = screen.getByRole("region", { name: "Curated style" });
    expect(within(style).getByRole("heading", { name: "Navy blazer" })).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("compares the original with the preview and resets it (R6.2)", async () => {
    const { revoke } = urlSpies();
    const api = mockApi();
    const user = userEvent.setup();
    renderApp(createMockAdapters({ api }));
    await openTryOn(user);

    await user.click(screen.getByRole("button", { name: "Generate preview" }));

    const original = await screen.findByRole("img", { name: "Your photo" });
    const preview = screen.getByRole("img", { name: "Navy blazer preview" });
    expect(original.getAttribute("src")).not.toBe(preview.getAttribute("src"));
    expect(api.createTryOnJob).toHaveBeenCalledWith({ analysisJobId: analysis.id, styleId: "navy-blazer" }, expect.anything());
    expect(screen.getByRole("status")).toHaveTextContent("Preview ready");

    const previewUrl = preview.getAttribute("src");
    await user.click(screen.getByRole("button", { name: "Reset preview" }));

    expect(screen.queryByRole("img", { name: "Navy blazer preview" })).not.toBeInTheDocument();
    expect(revoke).toHaveBeenCalledWith(previewUrl);
    await vi.waitFor(() => expect(api.cancelTryOnJob).toHaveBeenCalledWith(queuedTryOn().id));
    expect(screen.getByRole("button", { name: "Generate preview" })).toBeInTheDocument();
  });

  it("cancels a running preview, stops polling, and deletes the backend job", async () => {
    const api = mockApi({ getTryOnJob: vi.fn(async () => runningTryOn) });
    const user = userEvent.setup();
    renderApp(createMockAdapters({ api }));
    await openTryOn(user);

    await user.click(screen.getByRole("button", { name: "Generate preview" }));
    await vi.waitFor(() => expect(api.getTryOnJob).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Cancel preview" }));

    expect(screen.getByRole("button", { name: "Generate preview" })).toBeInTheDocument();
    await vi.waitFor(() => expect(api.cancelTryOnJob).toHaveBeenCalledWith(queuedTryOn().id));
    const polls = vi.mocked(api.getTryOnJob).mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(vi.mocked(api.getTryOnJob).mock.calls.length).toBe(polls);
    expect(api.getTryOnResult).not.toHaveBeenCalled();
  });

  it("never persists the photo or the preview implicitly (R6.3)", async () => {
    const storageWrites = [vi.spyOn(Storage.prototype, "setItem")];
    const indexedDbOpen = vi.fn();
    vi.stubGlobal("indexedDB", { open: indexedDbOpen });
    const { revoke } = urlSpies();
    const user = userEvent.setup();
    renderApp();
    await openTryOn(user);
    await user.click(screen.getByRole("button", { name: "Generate preview" }));
    const preview = await screen.findByRole("img", { name: "Navy blazer preview" });
    const previewUrl = preview.getAttribute("src");
    expect(screen.getByText("The preview is not saved. Only an explicit export creates a file.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to guidance" }));

    for (const spy of storageWrites) expect(spy).not.toHaveBeenCalled();
    expect(indexedDbOpen).not.toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith(previewUrl);
    vi.unstubAllGlobals();
  });

  it("explains an unsuitable photo and lets the user return to guidance", async () => {
    const api = mockApi({ createTryOnJob: vi.fn(async () => Promise.reject(new ApiRequestError("IMAGE_UNSUITABLE"))) });
    const user = userEvent.setup();
    renderApp(createMockAdapters({ api }));
    await openTryOn(user);

    await user.click(screen.getByRole("button", { name: "Generate preview" }));

    expect(
      await screen.findByText(
        "This photo could not be used for the preview. A well-lit photo showing your head and shoulders works best.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to guidance" }));
    expect(screen.getByRole("heading", { level: 1, name: "Your presentation guidance" })).toBeInTheDocument();
  });

  it("offers a retry for retryable failures", async () => {
    const api = mockApi({
      createTryOnJob: vi
        .fn()
        .mockRejectedValueOnce(new ApiRequestError("PROCESSING_UNAVAILABLE"))
        .mockResolvedValue(queuedTryOn()),
    });
    const user = userEvent.setup();
    renderApp(createMockAdapters({ api }));
    await openTryOn(user);

    await user.click(screen.getByRole("button", { name: "Generate preview" }));
    await user.click(await screen.findByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("img", { name: "Navy blazer preview" })).toBeInTheDocument();
  });

  it("asks the backend to delete the analysis copy when the user starts over", async () => {
    const api = mockApi();
    const user = userEvent.setup();
    renderApp(createMockAdapters({ api }));
    await reachGuidance(user);

    await user.click(screen.getByRole("button", { name: "Start over" }));

    await vi.waitFor(() => expect(api.cancelAnalysisJob).toHaveBeenCalledWith(analysis.id));
  });
});
