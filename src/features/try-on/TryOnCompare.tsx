import { useI18n } from "../../lib/i18n";
import { useObjectUrl } from "../../lib/media/useObjectUrl";

interface TryOnCompareProps {
  original: Blob;
  preview: Blob;
  styleLabel: string;
}

/** Side-by-side original and preview (R6.2). Object URLs are revoked on reset or unmount. */
export function TryOnCompare({ original, preview, styleLabel }: TryOnCompareProps) {
  const originalUrl = useObjectUrl(original);
  const previewUrl = useObjectUrl(preview);
  const { m } = useI18n();

  return (
    <div className="compare-grid">
      <figure>
        <div className="photo-frame">{originalUrl && <img src={originalUrl} alt={m.tryOn.originalAlt} />}</div>
        <figcaption>{m.tryOn.original}</figcaption>
      </figure>
      <figure>
        <div className="photo-frame">{previewUrl && <img src={previewUrl} alt={m.tryOn.previewAlt(styleLabel)} />}</div>
        <figcaption>{m.tryOn.previewCaption(styleLabel)}</figcaption>
      </figure>
    </div>
  );
}
