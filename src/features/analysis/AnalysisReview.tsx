import { passesContentPolicy, type AnalysisResult } from "../../lib/api/contracts";

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
  const observations = result.observations.filter((observation) => passesContentPolicy(observation.text));
  return (
    <section className="section" aria-labelledby="observations-heading">
      <h2 id="observations-heading" className="section-title">
        What the photo shows
      </h2>
      {observations.length === 0 ? (
        <p className="hint">No capture observations were returned for this photo.</p>
      ) : (
        <ul className="rows">
          {observations.map((observation) => (
            <li key={observation.id} data-assessment={observation.assessment}>
              <div className="row-main">
                <span className="row-title">{CATEGORY_LABELS[observation.category]}</span>
                <span className="row-text">{observation.text}</span>
              </div>
              <span className={observation.assessment === "ok" ? "badge" : "badge badge-accent"}>
                {observation.assessment === "ok" ? "Looks fine" : "Could be adjusted"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
