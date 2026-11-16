// Tasks 8.1 and 12.5 — hairstyle try-on in the desktop flow: R6.1 (one category, curated
// styles), R6.4 (the user chooses; suggestions come from the posting only), R6.2
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
  await user.click(screen.getByRole("button", { name: "Analyze posting" }));
  await user.upload(await screen.findByLabelText("Photo file"), syntheticFile(JPEG_SIGNATURE, "me.jpg", "image/jpeg"));
  await user.click(await screen.findByRole("button", { name: "Use this photo" }));
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "Agree and analyze" }));
  await screen.findByRole("heading", { level: 1, name: "Your presentation guidance" });
}

async function openTryOn(user: ReturnType<typeof userEvent.setup>) {
  await reachGuidance(user);
  await user.click(screen.getByRole("button", { name: "Preview a hairstyle" }));
  await screen.findByRole("heading", { level: 1, name: "Preview an interview hairstyle" });
  await user.click(screen.getByRole("radio", { name: /^Neat updo/ }));
}

function urlSpies() {
  let counter = 0;
  const create = vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:url-${++counter}`);
  const revoke = vi.spyOn(URL, "revokeObjectURL");
  return { create, revoke };
}

describe("virtual try-on step", () => {
  it("offers the curated hairstyles in one picker and preselects one that suits the posting (R6.1, R6.4)", async () => {
    const user = userEvent.setup();
    renderApp();

    await reachGuidance(user);
    await user.click(screen.getByRole("button", { name: "Preview a hairstyle" }));

    const picker = await screen.findByRole("group", { name: "Curated hairstyles" });
    const radios = within(picker).getAllByRole("radio");
    expect(radios).toHaveLength(6);
    // The fixture posting is business casual; the first matching style is preselected.
    expect(within(picker).getByRole("radio", { name: /^Sleek middle part/ })).toBeChecked();
    expect(within(picker).getAllByText("Suits the posting")).toHaveLength(5);
    expect(screen.getByRole("button", { name: "Preview Sleek middle part" })).toBeInTheDocument();
    expect(screen.queryByText(/gender|male|female/i)).not.toBeInTheDocument();
  });

  it("loads style thumbnails from the backend only", async () => {
    const api = mockApi();
    const user = userEvent.setup();
    renderApp(createMockAdapters({ api }));

    await openTryOn(user);

    await vi.waitFor(() => expect(api.getStyleThumbnail).toHaveBeenCalledTimes(6));
    expect(vi.mocked(api.getStyleThumbnail).mock.calls.map((call) => call[0])).toEqual([
      "sleek-middle-part",
      "neat-updo",
      "side-swept-cut",
      "side-part-straight",
      "short-bob",
      "textured-comma",
    ]);
  });

  it("previews the chosen style and lets the user try another one", async () => {
    const api = mockApi();
    const user = userEvent.setup();
    renderApp(createMockAdapters({ api }));
    await openTryOn(user);

    await user.click(screen.getByRole("button", { name: "Preview Neat updo" }));
    await screen.findByRole("img", { name: "Neat updo preview" });
    await user.click(screen.getByRole("button", { name: "Try another style" }));
    await user.click(screen.getByRole("radio", { name: /^Short bob/ }));
    await user.click(screen.getByRole("button", { name: "Preview Short bob" }));

    expect(await screen.findByRole("img", { name: "Short bob preview" })).toBeInTheDocument();
    expect(vi.mocked(api.createTryOnJob).mock.calls.map((call) => call[0].styleId)).toEqual(["neat-updo", "short-bob"]);
  });

  it("compares the original with the preview and resets it (R6.2)", async () => {
    const { revoke } = urlSpies();
    const api = mockApi();
    const user = userEvent.setup();
    renderApp(createMockAdapters({ api }));
    await openTryOn(user);

    await user.click(screen.getByRole("button", { name: "Preview Neat updo" }));

    const original = await screen.findByRole("img", { name: "Your photo" });
    const preview = screen.getByRole("img", { name: "Neat updo preview" });
    expect(original.getAttribute("src")).not.toBe(preview.getAttribute("src"));
    expect(api.createTryOnJob).toHaveBeenCalledWith({ analysisJobId: analysis.id, styleId: "neat-updo" }, expect.anything());
    expect(screen.getByRole("status")).toHaveTextContent("Preview ready");

    const previewUrl = preview.getAttribute("src");
    await user.click(screen.getByRole("button", { name: "Try another style" }));

    expect(screen.queryByRole("img", { name: "Neat updo preview" })).not.toBeInTheDocument();
    expect(revoke).toHaveBeenCalledWith(previewUrl);
    await vi.waitFor(() => expect(api.cancelTryOnJob).toHaveBeenCalledWith(queuedTryOn().id));
    expect(screen.getByRole("button", { name: "Preview Neat updo" })).toBeInTheDocument();
  });

  it("cancels a running preview, stops polling, and deletes the backend job", async () => {
    const api = mockApi({ getTryOnJob: vi.fn(async () => runningTryOn) });
    const user = userEvent.setup();
    renderApp(createMockAdapters({ api }));
    await openTryOn(user);

    await user.click(screen.getByRole("button", { name: "Preview Neat updo" }));
    await vi.waitFor(() => expect(api.getTryOnJob).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Cancel preview" }));

    expect(screen.getByRole("button", { name: "Preview Neat updo" })).toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: "Preview Neat updo" }));
    const preview = await screen.findByRole("img", { name: "Neat updo preview" });
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

    await user.click(screen.getByRole("button", { name: "Preview Neat updo" }));

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

    await user.click(screen.getByRole("button", { name: "Preview Neat updo" }));
    await user.click(await screen.findByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("img", { name: "Neat updo preview" })).toBeInTheDocument();
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
