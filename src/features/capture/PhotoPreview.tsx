import type { ReactNode } from "react";
import { useI18n } from "../../lib/i18n";
import type { PreparedImage } from "./types";
import { useObjectUrl } from "../../lib/media/useObjectUrl";

interface PhotoPreviewProps {
  image: PreparedImage;
  onRemove: () => void;
  children?: ReactNode;
}

export function PhotoPreview({ image, onRemove, children }: PhotoPreviewProps) {
  const url = useObjectUrl(image.blob);
  const { m } = useI18n();

  return (
    <section className="step-stack" aria-label={m.photo.previewLabel}>
      <div className="photo-frame">{url && <img src={url} alt={m.photo.previewAlt} />}</div>
      <div className="actions">
        {children}
        <button type="button" className="button button-secondary" onClick={onRemove}>
          {m.photo.remove}
        </button>
      </div>
    </section>
  );
}
