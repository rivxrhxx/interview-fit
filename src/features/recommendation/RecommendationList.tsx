import type { AnalysisResult, ObservationCategory } from "../../lib/api/contracts";
import { filterGuidance } from "./filterGuidance";

const CATEGORY_LABELS: Record<ObservationCategory, string> = {
  lighting: "Lighting",
  framing: "Framing",
  background: "Background",
  "image-clarity": "Image clarity",
  attire: "Attire",
};

interface RecommendationListProps {
  result: AnalysisResult;
}

/** Job context and optional suggestions. All text is rendered as text nodes only. */
export function RecommendationList({ result }: RecommendationListProps) {
  const safe = filterGuidance(result);
  const observations = new Map(safe.observations.map((observation) => [observation.id, observation.text]));

  return (
    <div className="step-stack">
      <section className="summary-card" aria-labelledby="job-context-heading">
        <h2 id="job-context-heading">Job context</h2>
        {safe.jobContext.summary && <p className="job-summary-text">{safe.jobContext.summary}</p>}
        {safe.jobContext.cues.length > 0 && (
          <ul className="cue-list" aria-label="Cues from the job description">
            {safe.jobContext.cues.map((cue) => (
              <li key={cue.id}>
                <span className="cue-label">{cue.label}</span>
                <span className="cue-evidence">“{cue.evidence}”</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="summary-card" aria-labelledby="suggestions-heading">
        <h2 id="suggestions-heading">Suggestions</h2>
        <p className="field-hint">
          These suggestions are optional. Interview Fit does not assess your appearance or predict interview outcomes.
        </p>
        {safe.recommendations.length === 0 ? (
          <p className="field-hint">No adjustments to suggest for this photo and job description.</p>
        ) : (
          <ol className="suggestion-list" aria-label="Suggestions">
            {safe.recommendations.map((rec) => (
              <li key={rec.id}>
                <h3>{CATEGORY_LABELS[rec.category]}</h3>
                <dl>
                  <dt>What we noticed</dt>
                  <dd>{(rec.observationId && observations.get(rec.observationId)) || "From the job description"}</dd>
                  <dt>Optional adjustment</dt>
                  <dd>{rec.adjustment}</dd>
                  <dt>Why</dt>
                  <dd>{rec.rationale}</dd>
                </dl>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
