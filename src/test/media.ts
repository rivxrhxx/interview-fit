import { act } from "@testing-library/react";
import { vi } from "vitest";

export interface FakeTrack {
  stop: ReturnType<typeof vi.fn>;
  readyState: "live" | "ended";
}

export function fakeStream(trackCount = 2): { stream: MediaStream; tracks: FakeTrack[] } {
  const tracks: FakeTrack[] = Array.from({ length: trackCount }, () => {
    const track: FakeTrack = { readyState: "live", stop: vi.fn() };
    track.stop.mockImplementation(() => {
      track.readyState = "ended";
    });
    return track;
  });
  const stream = { getTracks: () => tracks } as unknown as MediaStream;
  return { stream, tracks };
}

export function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

/**
 * Simulate a video element becoming ready for capture (R2.5).
 * Sets readyState, videoWidth, videoHeight on the element and fires
 * a `loadeddata` event so CameraCapture's checkReady callback runs.
 */
export function makeVideoReady(
  video: HTMLVideoElement,
  options: { readyState?: number; width?: number; height?: number } = {},
): void {
  const { readyState = 2, width = 640, height = 480 } = options;
  Object.defineProperty(video, "readyState", { value: readyState, configurable: true });
  Object.defineProperty(video, "videoWidth", { value: width, configurable: true });
  Object.defineProperty(video, "videoHeight", { value: height, configurable: true });
  act(() => {
    video.dispatchEvent(new Event("loadeddata"));
  });
}
