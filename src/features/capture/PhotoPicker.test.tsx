// Task 4.1 — verifies R2.2 (file selection path), R2.3 (limits), R3.3 (native preprocessing).
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdaptersProvider } from "../../lib/adapters";
import type { ImageAdapter } from "../../lib/tauri";
import { IMAGE_MAX_BYTES } from "../../lib/validation/limits";
import { GIF_SIGNATURE, JPEG_SIGNATURE, fileWithReportedSize, syntheticFile } from "../../test/images";
import { PhotoPicker } from "./PhotoPicker";

function setup(adapter: ImageAdapter = { prepare: vi.fn(async () => new Blob(["jpeg"], { type: "image/jpeg" })) }) {
  const onImageReady = vi.fn();
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  const user = userEvent.setup({ applyAccept: false });
  render(
    <AdaptersProvider adapters={{ image: adapter }}>
      <PhotoPicker onImageReady={onImageReady} />
    </AdaptersProvider>,
  );
  return { adapter, onImageReady, fetchSpy, user, input: screen.getByLabelText("Photo file") };
}

describe("PhotoPicker", () => {
  it("offers a labeled, keyboard-reachable file selection control (R2.2)", async () => {
    const { user } = setup();

    await user.tab();

    expect(screen.getByRole("button", { name: "Choose a photo" })).toHaveFocus();
    expect(screen.getByLabelText("Photo file")).toHaveAttribute("accept", "image/jpeg,image/png");
  });

  it("rejects an unsupported format with a neutral message (R2.3)", async () => {
    const { user, input, adapter, onImageReady } = setup();

    await user.upload(input, syntheticFile(GIF_SIGNATURE, "animation.gif", "image/gif"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Choose a JPEG or PNG image.");
    expect(adapter.prepare).not.toHaveBeenCalled();
    expect(onImageReady).not.toHaveBeenCalled();
  });

  it("rejects an oversized image before reading or uploading it (R2.3)", async () => {
    const { user, input, adapter, onImageReady, fetchSpy } = setup();

    await user.upload(input, fileWithReportedSize(IMAGE_MAX_BYTES + 1));

    expect(await screen.findByRole("alert")).toHaveTextContent("Choose an image up to 10 MB and 16 megapixels.");
    expect(adapter.prepare).not.toHaveBeenCalled();
    expect(onImageReady).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("hands the normalized image to the flow and uploads nothing (R3.3)", async () => {
    const normalized = new Blob(["normalized"], { type: "image/jpeg" });
    const { user, input, onImageReady, fetchSpy } = setup({ prepare: vi.fn(async () => normalized) });

    await user.upload(input, syntheticFile(JPEG_SIGNATURE, "me.jpg", "image/jpeg"));

    await vi.waitFor(() => expect(onImageReady).toHaveBeenCalledWith({ blob: normalized, source: "upload" }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("announces progress while the image is being prepared", async () => {
    let resolve: (blob: Blob) => void = () => {};
    const adapter: ImageAdapter = { prepare: vi.fn(() => new Promise<Blob>((done) => (resolve = done))) };
    const { user, input } = setup(adapter);

    await user.upload(input, syntheticFile(JPEG_SIGNATURE, "me.jpg", "image/jpeg"));

    expect(await screen.findByText("Checking your photo…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose a photo" })).toBeDisabled();
    resolve(new Blob(["done"]));
  });
});
