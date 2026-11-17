import { useEffect, useRef, useState } from "react";
import { useAdapters } from "../../lib/adapters";
import { useI18n } from "../../lib/i18n";
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
  const { m } = useI18n();
  const [phase, setPhase] = useState<Phase>("requesting");
  const [videoReady, setVideoReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const closedRef = useRef(false);
  const callbacks = useRef({ onCaptured, onClosed });
  callbacks.current = { onCaptured, onClosed };

  function checkReady() {
    const video = videoRef.current;
    if (video && video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) {
      setVideoReady(true);
    }
  }

  function stopTracks() {
    stopStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setVideoReady(false);
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
      const video = videoRef.current;
      video.srcObject = streamRef.current;
      // Check readiness once immediately in case the browser already has data,
      // then re-check on every event that may advance readyState or dimensions.
      checkReady();
      video.addEventListener("loadedmetadata", checkReady);
      video.addEventListener("loadeddata", checkReady);
      video.addEventListener("canplay", checkReady);
      video.addEventListener("resize", checkReady);
      return () => {
        video.removeEventListener("loadedmetadata", checkReady);
        video.removeEventListener("loadeddata", checkReady);
        video.removeEventListener("canplay", checkReady);
        video.removeEventListener("resize", checkReady);
      };
    }
  // checkReady only reads refs and calls setVideoReady; it is stable within the render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
          <p className="hint">{m.camera.waiting}</p>
        ) : (
          <video ref={videoRef} aria-label={m.camera.previewLabel} autoPlay muted playsInline />
        )}
      </div>
      <div className="actions">
        <button type="button" className="button button-primary" onClick={takePhoto} disabled={phase !== "live" || !videoReady}>
          {m.camera.take}
        </button>
        <button type="button" className="button button-text" onClick={() => close("cancelled")}>
          {m.camera.cancel}
        </button>
      </div>
    </div>
  );
}
