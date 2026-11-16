import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useAdapters } from "../../lib/adapters";
import { CameraCapture, type CameraCloseReason } from "./CameraCapture";
import { imageErrorMessage } from "./imageErrors";
import { preparePhoto } from "./preparePhoto";
import type { PreparedImage } from "./types";

interface PhotoPickerProps {
  onImageReady: (image: PreparedImage) => void;
}

type PickerState =
  | { status: "idle"; notice?: string }
  | { status: "camera" }
  | { status: "preparing" }
  | { status: "error"; message: string };

const CAMERA_MESSAGES: Record<Exclude<CameraCloseReason, "cancelled">, PickerState> = {
  backgrounded: {
    status: "idle",
    notice: "The camera was turned off because Interview Fit moved to the background.",
  },
  denied: { status: "error", message: "Camera access was not allowed. You can choose a photo file instead." },
  unavailable: { status: "error", message: "No camera is available right now. You can choose a photo file instead." },
  failed: { status: "error", message: "The camera photo could not be captured. Try again or choose a photo file." },
};

export function PhotoPicker({ onImageReady }: PhotoPickerProps) {
  const { image: imageAdapter } = useAdapters();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<PickerState>({ status: "idle" });
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function prepare(blob: Blob, source: PreparedImage["source"]) {
    setState({ status: "preparing" });
    const result = await preparePhoto(blob, imageAdapter, source);
    if (!mounted.current) return;
    if (result.ok) {
      setState({ status: "idle" });
      onImageReady(result.image);
    } else {
      setState({ status: "error", message: imageErrorMessage(result.code) });
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset so selecting the same file again still triggers a change event.
    event.target.value = "";
    if (file) void prepare(file, "upload");
  }

  function handleCameraClosed(reason: CameraCloseReason) {
    setState(reason === "cancelled" ? { status: "idle" } : CAMERA_MESSAGES[reason]);
  }

  const preparing = state.status === "preparing";

  return (
    <section className="photo-picker" aria-labelledby="photo-picker-heading">
      <h2 id="photo-picker-heading">Photo</h2>
      <p className="field-hint">
        Use a JPEG or PNG up to 10 MB and 16 megapixels. Location and camera metadata are removed on this device.
        Nothing is uploaded until you review and agree on the consent step.
      </p>
      {state.status === "camera" ? (
        <CameraCapture onCaptured={(frame) => void prepare(frame, "camera")} onClosed={handleCameraClosed} />
      ) : (
        <div className="photo-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={() => inputRef.current?.click()}
            disabled={preparing}
          >
            Choose a photo
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setState({ status: "camera" })}
            disabled={preparing}
          >
            Use camera
          </button>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        aria-label="Photo file"
        tabIndex={-1}
        hidden
        onChange={handleFileChange}
      />
      {preparing && (
        <p className="field-hint" role="status">
          Checking your photo…
        </p>
      )}
      {state.status === "idle" && state.notice && (
        <p className="field-hint" role="status">
          {state.notice}
        </p>
      )}
      {state.status === "error" && (
        <p className="field-error" role="alert">
          {state.message}
        </p>
      )}
    </section>
  );
}
