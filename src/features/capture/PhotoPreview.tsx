import type { ReactNode } from "react";
import type { PreparedImage } from "./types";
import { useObjectUrl } from "../../lib/media/useObjectUrl";

interface PhotoPreviewProps {
  image: PreparedImage;
  onRemove: () => void;
  children?: ReactNode;
}

export function PhotoPreview({ image, onRemove, children }: PhotoPreviewProps) {
  const url = useObjectUrl(image.blob);

  return (
    <section className="step-stack" aria-label="Photo preview">
      <div className="photo-frame">{url && <img src={url} alt="Selected photo preview" />}</div>
      <div className="actions">
        {children}
        <button type="button" className="button button-secondary" onClick={onRemove}>
          Remove photo
        </button>
      </div>
    </section>
  );
}
