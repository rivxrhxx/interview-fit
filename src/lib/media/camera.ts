export type CameraErrorCode = "CAMERA_PERMISSION_DENIED" | "CAMERA_UNAVAILABLE" | "CAMERA_CAPTURE_FAILED";

export class CameraError extends Error {
  readonly code: CameraErrorCode;

  constructor(code: CameraErrorCode) {
    super(code);
    this.name = "CameraError";
    this.code = code;
  }
}

/** Camera access boundary. Permission is requested only when `open` is called. */
export interface CameraAdapter {
  open(): Promise<MediaStream>;
  captureFrame(video: HTMLVideoElement): Promise<Blob>;
}

const PERMISSION_ERRORS = new Set(["NotAllowedError", "SecurityError"]);

const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
};

export function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => track.stop());
}

export const browserCameraAdapter: CameraAdapter = {
  async open() {
    if (!navigator.mediaDevices?.getUserMedia) throw new CameraError("CAMERA_UNAVAILABLE");
    try {
      return await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      throw new CameraError(PERMISSION_ERRORS.has(name) ? "CAMERA_PERMISSION_DENIED" : "CAMERA_UNAVAILABLE");
    }
  },

  async captureFrame(video) {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context || canvas.width === 0 || canvas.height === 0) throw new CameraError("CAMERA_CAPTURE_FAILED");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new CameraError("CAMERA_CAPTURE_FAILED"))),
        "image/jpeg",
        0.92,
      );
    });
  },
};
