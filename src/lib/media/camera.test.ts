// Task 4.2 — camera adapter error mapping (R2.1, R2.2).
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeStream } from "../../test/media";
import { CameraError, browserCameraAdapter } from "./camera";

function stubGetUserMedia(impl: () => Promise<MediaStream>) {
  const getUserMedia = vi.fn(impl);
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
  return getUserMedia;
}

afterEach(() => {
  Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
});

describe("browserCameraAdapter.open", () => {
  it("requests video only, never audio", async () => {
    const { stream } = fakeStream();
    const getUserMedia = stubGetUserMedia(async () => stream);

    await expect(browserCameraAdapter.open()).resolves.toBe(stream);
    expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: false, video: expect.any(Object) }));
  });

  it.each([
    ["NotAllowedError", "CAMERA_PERMISSION_DENIED"],
    ["SecurityError", "CAMERA_PERMISSION_DENIED"],
    ["NotFoundError", "CAMERA_UNAVAILABLE"],
    ["NotReadableError", "CAMERA_UNAVAILABLE"],
    ["OverconstrainedError", "CAMERA_UNAVAILABLE"],
    ["AbortError", "CAMERA_UNAVAILABLE"],
  ])("maps %s to %s", async (name, code) => {
    stubGetUserMedia(async () => {
      throw new DOMException("device detail that must not be shown", name);
    });

    const error = await browserCameraAdapter.open().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CameraError);
    expect((error as CameraError).code).toBe(code);
  });

  it("reports an unavailable camera when the media API is missing", async () => {
    const error = await browserCameraAdapter.open().catch((caught: unknown) => caught);

    expect((error as CameraError).code).toBe("CAMERA_UNAVAILABLE");
  });
});
