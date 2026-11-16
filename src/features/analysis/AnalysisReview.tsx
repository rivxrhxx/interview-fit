import type { AnalysisResult } from "../../lib/api/contracts";

const CATEGORY_LABELS: Record<AnalysisResult["observations"][number]["category"], string> = {
  lighting: "Lighting",
  framing: "Framing",
  background: "Background",
  "image-clarity": "Image clarity",
  attire: "Attire",
};

interface AnalysisReviewProps {
  result: AnalysisResult;
}

/** Neutral capture observations. Text is rendered as text nodes only. */
export function AnalysisReview({ result }: AnalysisReviewProps) {
  return (
    <section className="summary-card" aria-labelledby="observations-heading">
      <h2 id="observations-heading">What the photo shows</h2>
      {result.observations.length === 0 ? (
        <p className="field-hint">No capture observations were returned for this photo.</p>
      ) : (
        <ul className="observation-list">
          {result.observations.map((observation) => (
            <li key={observation.id}>
              <span className="observation-category">{CATEGORY_LABELS[observation.category]}</span>
              <span>{observation.text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
