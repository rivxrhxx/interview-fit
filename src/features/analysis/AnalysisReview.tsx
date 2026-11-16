import { passesContentPolicy, type AnalysisResult } from "../../lib/api/contracts";
import { useI18n } from "../../lib/i18n";

interface AnalysisReviewProps {
  result: AnalysisResult;
}

/** Neutral capture observations. Text is rendered as text nodes only. */
export function AnalysisReview({ result }: AnalysisReviewProps) {
  const { m } = useI18n();
  const observations = result.observations.filter((observation) => passesContentPolicy(observation.text));
  return (
    <section className="section" aria-labelledby="observations-heading">
      <h2 id="observations-heading" className="section-title">
        {m.review.title}
      </h2>
      {observations.length === 0 ? (
        <p className="hint">{m.review.empty}</p>
      ) : (
        <ul className="rows">
          {observations.map((observation) => (
            <li key={observation.id} data-assessment={observation.assessment}>
              <div className="row-main">
                <span className="row-title">{m.categories[observation.category]}</span>
                <span className="row-text">{observation.text}</span>
              </div>
              <span className={observation.assessment === "ok" ? "badge" : "badge badge-accent"}>
                {observation.assessment === "ok" ? m.review.ok : m.review.adjustable}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
