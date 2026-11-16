import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useAdapters } from "../../lib/adapters";
import type { ImageErrorCode } from "../../lib/validation/image";
import { imageErrorMessage } from "./imageErrors";
import { preparePhoto } from "./preparePhoto";
import type { PreparedImage } from "./types";

interface PhotoPickerProps {
  onImageReady: (image: PreparedImage) => void;
}

type PickerState = { status: "idle" } | { status: "preparing" } | { status: "error"; code: ImageErrorCode };

export function PhotoPicker({ onImageReady }: PhotoPickerProps) {
  const { image: imageAdapter } = useAdapters();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<PickerState>({ status: "idle" });
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset so selecting the same file again still triggers a change event.
    event.target.value = "";
    if (!file) return;

    setState({ status: "preparing" });
    const result = await preparePhoto(file, imageAdapter, "upload");
    if (!active.current) return;
    if (result.ok) {
      setState({ status: "idle" });
      onImageReady(result.image);
    } else {
      setState({ status: "error", code: result.code });
    }
  }

  const preparing = state.status === "preparing";

  return (
    <section className="photo-picker" aria-labelledby="photo-picker-heading">
      <h2 id="photo-picker-heading">Photo</h2>
      <p className="field-hint">
        Use a JPEG or PNG up to 10 MB and 16 megapixels. Location and camera metadata are removed on this device.
        Nothing is uploaded until you review and agree on the consent step.
      </p>
      <div className="photo-actions">
        <button
          type="button"
          className="button button-secondary"
          onClick={() => inputRef.current?.click()}
          disabled={preparing}
        >
          Choose a photo
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png"
          aria-label="Photo file"
          tabIndex={-1}
          hidden
          onChange={handleChange}
        />
      </div>
      {preparing && (
        <p className="field-hint" role="status">
          Checking your photo…
        </p>
      )}
      {state.status === "error" && (
        <p className="field-error" role="alert">
          {imageErrorMessage(state.code)}
        </p>
      )}
    </section>
  );
}
