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
