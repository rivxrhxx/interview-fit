import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { useAdapters } from "../../lib/adapters";
import { useI18n, type Messages } from "../../lib/i18n";
import { CameraIcon, PhotoIcon } from "../../lib/ui/icons";
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

function cameraState(m: Messages, reason: Exclude<CameraCloseReason, "cancelled">): PickerState {
  switch (reason) {
    case "backgrounded":
      return { status: "idle", notice: m.photo.backgrounded };
    case "denied":
      return { status: "error", message: m.photo.denied };
    case "unavailable":
      return { status: "error", message: m.photo.unavailable };
    case "failed":
      return { status: "error", message: m.photo.captureFailed };
  }
}

export function PhotoPicker({ onImageReady }: PhotoPickerProps) {
  const { image: imageAdapter } = useAdapters();
  const { m } = useI18n();
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
      setState({ status: "error", message: imageErrorMessage(m, result.code) });
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset so selecting the same file again still triggers a change event.
    event.target.value = "";
    if (file) void prepare(file, "upload");
  }

  function handleCameraClosed(reason: CameraCloseReason) {
    setState(reason === "cancelled" ? { status: "idle" } : cameraState(m, reason));
  }

  const preparing = state.status === "preparing";
  const ids = { choose: useId(), chooseDetail: useId(), camera: useId(), cameraDetail: useId() };

  return (
    <section className="section" aria-labelledby="photo-picker-heading">
      <h2 id="photo-picker-heading" className="section-title">
        {m.photo.title}
      </h2>
      <p className="hint">{m.photo.hint}</p>
      {state.status === "camera" ? (
        <CameraCapture onCaptured={(frame) => void prepare(frame, "camera")} onClosed={handleCameraClosed} />
      ) : (
        <div className="option-grid">
          <button
            type="button"
            className="option-tile"
            onClick={() => inputRef.current?.click()}
            disabled={preparing}
            aria-labelledby={ids.choose}
            aria-describedby={ids.chooseDetail}
          >
            <PhotoIcon className="option-icon" />
            <span id={ids.choose} className="option-title">
              {m.photo.choose}
            </span>
            <span id={ids.chooseDetail} className="option-detail">
              {m.photo.chooseDetail}
            </span>
          </button>
          <button
            type="button"
            className="option-tile"
            onClick={() => setState({ status: "camera" })}
            disabled={preparing}
            aria-labelledby={ids.camera}
            aria-describedby={ids.cameraDetail}
          >
            <CameraIcon className="option-icon" />
            <span id={ids.camera} className="option-title">
              {m.photo.camera}
            </span>
            <span id={ids.cameraDetail} className="option-detail">
              {m.photo.cameraDetail}
            </span>
          </button>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        aria-label={m.photo.fileLabel}
        tabIndex={-1}
        hidden
        onChange={handleFileChange}
      />
      {preparing && (
        <p className="status-text" role="status">
          {m.photo.checking}
        </p>
      )}
      {state.status === "idle" && state.notice && (
        <p className="status-text" role="status">
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
