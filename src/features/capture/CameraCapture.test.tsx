// Task 4.2 — verifies R2.1 (just-in-time camera permission), R2.2 (file fallback after
// denial), and R2.4 (tracks stop on cancel, navigation, background, close, and capture).
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdaptersProvider, type Adapters } from "../../lib/adapters";
import { CameraError, type CameraAdapter } from "../../lib/media/camera";
import { createMockAdapters } from "../../test/adapters";
import { JPEG_SIGNATURE, syntheticFile } from "../../test/images";
import { fakeStream, setVisibility } from "../../test/media";
import { PhotoPicker } from "./PhotoPicker";

const frameBytes = new Uint8Array(32);
frameBytes.set(JPEG_SIGNATURE);

function setup(camera: Partial<CameraAdapter> = {}) {
  const { stream, tracks } = fakeStream();
  const adapters: Adapters = createMockAdapters({
    camera: {
      open: vi.fn(async () => stream),
      captureFrame: vi.fn(async () => new Blob([frameBytes], { type: "image/jpeg" })),
      ...camera,
    },
  });
  const onImageReady = vi.fn();
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  const user = userEvent.setup();
  const view = render(
    <AdaptersProvider adapters={adapters}>
      <PhotoPicker onImageReady={onImageReady} />
    </AdaptersProvider>,
  );
  return { adapters, tracks, onImageReady, fetchSpy, user, ...view };
}

async function startCamera(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Use camera" }));
  await screen.findByRole("button", { name: "Take photo" });
}

describe("camera capture", () => {
  it("does not request camera permission until the user chooses Use camera (R2.1)", async () => {
    const { adapters, user } = setup();

    expect(adapters.camera.open).not.toHaveBeenCalled();
    await startCamera(user);

    expect(adapters.camera.open).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Camera preview")).toBeInTheDocument();
  });

  it("falls back to file selection when permission is denied (R2.2)", async () => {
    const { adapters, user, onImageReady } = setup({
      open: vi.fn(async () => {
        throw new CameraError("CAMERA_PERMISSION_DENIED");
      }),
    });

    await user.click(screen.getByRole("button", { name: "Use camera" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Camera access was not allowed. You can choose a photo file instead.",
    );
    await user.upload(await screen.findByLabelText("Photo file"), syntheticFile(JPEG_SIGNATURE, "me.jpg", "image/jpeg"));
    await vi.waitFor(() => expect(onImageReady).toHaveBeenCalledWith(expect.objectContaining({ source: "upload" })));
    expect(adapters.image.prepare).toHaveBeenCalledTimes(1);
  });

  it("explains when no camera is available", async () => {
    const { user } = setup({
      open: vi.fn(async () => {
        throw new CameraError("CAMERA_UNAVAILABLE");
      }),
    });

    await user.click(screen.getByRole("button", { name: "Use camera" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No camera is available right now. You can choose a photo file instead.",
    );
  });

  it("stops every track within one second of cancelling (R2.4)", async () => {
    const { tracks, user } = setup();
    await startCamera(user);

    const cancelledAt = performance.now();
    await user.click(screen.getByRole("button", { name: "Cancel camera" }));

    for (const track of tracks) expect(track.stop).toHaveBeenCalledTimes(1);
    expect(performance.now() - cancelledAt).toBeLessThan(1000);
    expect(screen.getByRole("button", { name: "Use camera" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Camera preview")).not.toBeInTheDocument();
  });

  it("stops tracks when the user navigates away (unmount)", async () => {
    const { tracks, user, unmount } = setup();
    await startCamera(user);

    unmount();

    for (const track of tracks) expect(track.stop).toHaveBeenCalled();
  });

  it("stops tracks when the app moves to the background", async () => {
    const { tracks, user } = setup();
    await startCamera(user);

    act(() => setVisibility("hidden"));

    for (const track of tracks) expect(track.stop).toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "The camera was turned off because Interview Fit moved to the background.",
    );
    act(() => setVisibility("visible"));
  });

  it("stops tracks when the window is closing", async () => {
    const { tracks, user } = setup();
    await startCamera(user);

    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });

    for (const track of tracks) expect(track.stop).toHaveBeenCalled();
  });

  it("stops tracks immediately after capture and prepares the frame like any photo", async () => {
    const normalized = new Blob(["normalized"], { type: "image/jpeg" });
    const { adapters, tracks, user, onImageReady, fetchSpy } = setup();
    vi.mocked(adapters.image.prepare).mockResolvedValue(normalized);
    await startCamera(user);

    await user.click(screen.getByRole("button", { name: "Take photo" }));

    for (const track of tracks) expect(track.stop).toHaveBeenCalled();
    await vi.waitFor(() => expect(onImageReady).toHaveBeenCalledWith({ blob: normalized, source: "camera" }));
    expect(adapters.image.prepare).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("stops a stream that arrives after the user already cancelled", async () => {
    const { stream, tracks } = fakeStream();
    let grant: (value: MediaStream) => void = () => {};
    const { user } = setup({ open: vi.fn(() => new Promise<MediaStream>((resolve) => (grant = resolve))) });

    await user.click(screen.getByRole("button", { name: "Use camera" }));
    await user.click(await screen.findByRole("button", { name: "Cancel camera" }));
    await act(async () => grant(stream));

    for (const track of tracks) expect(track.stop).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("Camera preview")).not.toBeInTheDocument();
  });
});
