// Task 6.2 — analysis step in the desktop flow: R4.1 (typed first-party adapter), R4.3
// (timeout → retryable neutral error), R4.4 (cancel → stop polling, cleanup), R8.2/R8.3.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import queuedFixture from "../../../packages/contracts/fixtures/analysis-job.queued.json";
import succeededFixture from "../../../packages/contracts/fixtures/analysis-job.succeeded.json";
import { ApiRequestError } from "../../lib/api/client";
import { CURRENT_CONSENT_VERSION, parseAnalysisJob, type AnalysisJob } from "../../lib/api/contracts";
import { createMockAdapters, mockApi } from "../../test/adapters";
import { JPEG_SIGNATURE, syntheticFile } from "../../test/images";
import { renderApp } from "../../test/renderApp";

const queued = parseAnalysisJob(queuedFixture);
const processing: AnalysisJob = { ...queued, state: "processing" };
const succeeded = parseAnalysisJob(succeededFixture);

async function startAnalysis(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Job description"), "Client-facing consultant. Interviews are held over video.");
  await user.click(screen.getByRole("button", { name: "Save job description" }));
  await user.upload(screen.getByLabelText("Photo file"), syntheticFile(JPEG_SIGNATURE, "me.jpg", "image/jpeg"));
  await user.click(await screen.findByRole("button", { name: "Use this photo" }));
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "Agree and analyze" }));
}

describe("analysis step", () => {
  it("uploads through the typed adapter with the consent version and shows neutral observations", async () => {
    const api = mockApi({ getAnalysisJob: vi.fn().mockResolvedValueOnce(processing).mockResolvedValue(succeeded) });
    const adapters = createMockAdapters({ api });
    const user = userEvent.setup();
    renderApp(adapters);

    await startAnalysis(user);

    expect(await screen.findByRole("heading", { level: 1, name: "Your presentation guidance" })).toBeInTheDocument();
    expect(api.createAnalysisJob).toHaveBeenCalledTimes(1);
    const request = vi.mocked(api.createAnalysisJob).mock.calls[0][0];
    expect(request.consentVersion).toBe(CURRENT_CONSENT_VERSION);
    expect(request.jobDescription).toBe("Client-facing consultant. Interviews are held over video.");
    expect(request.image).toBe(await vi.mocked(adapters.image.prepare).mock.results[0].value);
    expect(screen.getByText("The light source appears to be behind you.")).toBeInTheDocument();
  });

  it("announces upload and processing status (R8.2)", async () => {
    let created: (job: AnalysisJob) => void = () => {};
    let finish: (job: AnalysisJob) => void = () => {};
    const api = mockApi({
      createAnalysisJob: vi.fn(() => new Promise<AnalysisJob>((resolve) => (created = resolve))),
      getAnalysisJob: vi.fn(() => new Promise<AnalysisJob>((resolve) => (finish = resolve))),
    });
    const user = userEvent.setup();
    renderApp(createMockAdapters({ api }));

    await startAnalysis(user);

    await vi.waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Uploading your photo securely"));
    created(queued);
    await vi.waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Analyzing presentation cues"));
    await vi.waitFor(() => expect(api.getAnalysisJob).toHaveBeenCalled());
    finish(succeeded);
    expect(await screen.findByRole("heading", { level: 1, name: "Your presentation guidance" })).toBeInTheDocument();
  });

  it("cancels: stops polling, asks the backend to clean up, and returns to the photo (R4.4)", async () => {
    const api = mockApi({ getAnalysisJob: vi.fn(async () => processing) });
    const user = userEvent.setup();
    renderApp(createMockAdapters({ api }));
    await startAnalysis(user);
    await vi.waitFor(() => expect(api.getAnalysisJob).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "Cancel analysis" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Check your photo" })).toBeInTheDocument();
    await vi.waitFor(() => expect(api.cancelAnalysisJob).toHaveBeenCalledWith(queued.id));
    const pollsAtCancel = vi.mocked(api.getAnalysisJob).mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(vi.mocked(api.getAnalysisJob).mock.calls.length).toBe(pollsAtCancel);
  });

  it("shows a retryable neutral error on timeout and retries with a fresh job (R4.3)", async () => {
    const api = mockApi({ getAnalysisJob: vi.fn(async () => processing) });
    const user = userEvent.setup();
    renderApp(createMockAdapters({ api }), { pollIntervalMs: 5, timeoutMs: 30 });

    await startAnalysis(user);

    expect(await screen.findByText("Analysis took too long and was stopped. You can try again.")).toBeInTheDocument();
    expect(api.cancelAnalysisJob).toHaveBeenCalledWith(queued.id);
    vi.mocked(api.getAnalysisJob).mockResolvedValue(succeeded);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Your presentation guidance" })).toBeInTheDocument();
    expect(api.createAnalysisJob).toHaveBeenCalledTimes(2);
  });

  it("offers a later retry when rate limited (R8.3)", async () => {
    const api = mockApi({ createAnalysisJob: vi.fn(async () => Promise.reject(new ApiRequestError("RATE_LIMITED"))) });
    const user = userEvent.setup();
    renderApp(createMockAdapters({ api }));

    await startAnalysis(user);

    expect(await screen.findByText("Too many requests right now. Wait a moment and try again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("sends the user back to photo selection when the backend rejects the image (R8.3)", async () => {
    const api = mockApi({ createAnalysisJob: vi.fn(async () => Promise.reject(new ApiRequestError("IMAGE_INVALID"))) });
    const user = userEvent.setup();
    renderApp(createMockAdapters({ api }));
    await startAnalysis(user);

    await user.click(await screen.findByRole("button", { name: "Choose another photo" }));

    expect(screen.getByRole("heading", { level: 1, name: "Describe the role and choose a photo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose a photo" })).toBeInTheDocument();
  });

  it("cancels the backend job when the analysis view unmounts (navigation or close)", async () => {
    const api = mockApi({ getAnalysisJob: vi.fn(async () => processing) });
    const user = userEvent.setup();
    const { unmount } = renderApp(createMockAdapters({ api }));
    await startAnalysis(user);
    await vi.waitFor(() => expect(api.getAnalysisJob).toHaveBeenCalled());

    unmount();

    await vi.waitFor(() => expect(api.cancelAnalysisJob).toHaveBeenCalledWith(queued.id));
  });
});
