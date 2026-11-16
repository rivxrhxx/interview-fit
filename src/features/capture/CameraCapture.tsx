import { useEffect, useRef, useState } from "react";
import { useAdapters } from "../../lib/adapters";
import { CameraError, stopStream } from "../../lib/media/camera";

export type CameraCloseReason = "cancelled" | "backgrounded" | "denied" | "unavailable" | "failed";

interface CameraCaptureProps {
  onCaptured: (frame: Blob) => void;
  onClosed: (reason: CameraCloseReason) => void;
}

type Phase = "requesting" | "live" | "capturing";

/**
 * Live camera preview. Tracks are stopped on capture, cancellation, unmount
 * (navigation), backgrounding, and window close (security-privacy steering, R2.4).
 */
export function CameraCapture({ onCaptured, onClosed }: CameraCaptureProps) {
  const { camera } = useAdapters();
  const [phase, setPhase] = useState<Phase>("requesting");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const closedRef = useRef(false);
  const callbacks = useRef({ onCaptured, onClosed });
  callbacks.current = { onCaptured, onClosed };

  function stopTracks() {
    stopStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  function close(reason: CameraCloseReason) {
    if (closedRef.current) return;
    closedRef.current = true;
    stopTracks();
    callbacks.current.onClosed(reason);
  }

  useEffect(() => {
    closedRef.current = false;
    let disposed = false;

    camera.open().then(
      (stream) => {
        if (disposed || closedRef.current) {
          stopStream(stream);
          return;
        }
        streamRef.current = stream;
        setPhase("live");
      },
      (error: unknown) => {
        if (disposed || closedRef.current) return;
        const denied = error instanceof CameraError && error.code === "CAMERA_PERMISSION_DENIED";
        close(denied ? "denied" : "unavailable");
      },
    );

    function handleVisibility() {
      if (document.visibilityState === "hidden") close("backgrounded");
    }
    window.addEventListener("pagehide", stopTracks);
    window.addEventListener("beforeunload", stopTracks);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      disposed = true;
      window.removeEventListener("pagehide", stopTracks);
      window.removeEventListener("beforeunload", stopTracks);
      document.removeEventListener("visibilitychange", handleVisibility);
      stopTracks();
    };
    // `close` and `stopTracks` only touch refs, so the session is tied to this component's lifetime.
  }, [camera]);

  useEffect(() => {
    if (phase === "live" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [phase]);

  async function takePhoto() {
    const video = videoRef.current;
    if (!video || !streamRef.current) return;
    setPhase("capturing");
    let frame: Blob;
    try {
      frame = await camera.captureFrame(video);
    } catch {
      close("failed");
      return;
    }
    closedRef.current = true;
    stopTracks();
    callbacks.current.onCaptured(frame);
  }

  return (
    <div className="step-stack">
      <div className="photo-frame">
        {phase === "requesting" ? (
          <p className="hint">Waiting for camera permission…</p>
        ) : (
          <video ref={videoRef} aria-label="Camera preview" autoPlay muted playsInline />
        )}
      </div>
      <div className="actions">
        <button type="button" className="button button-primary" onClick={takePhoto} disabled={phase !== "live"}>
          Take photo
        </button>
        <button type="button" className="button button-text" onClick={() => close("cancelled")}>
          Cancel camera
        </button>
      </div>
    </div>
  );
}
