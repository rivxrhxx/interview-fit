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
    <>
      <section className="section" aria-labelledby="job-context-heading">
        <h2 id="job-context-heading" className="section-title">
          Job context
        </h2>
        {safe.jobContext.summary && <p className="hint">{safe.jobContext.summary}</p>}
        {safe.jobContext.cues.length > 0 && (
          <ul className="chips" aria-label="Cues from the job description">
            {safe.jobContext.cues.map((cue) => (
              <li key={cue.id}>
                <span className="chip-label">{cue.label}</span>
                <span className="chip-evidence">“{cue.evidence}”</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section" aria-labelledby="suggestions-heading">
        <h2 id="suggestions-heading" className="section-title">
          Suggestions
        </h2>
        <p className="hint">
          These suggestions are optional. Interview Fit does not assess your appearance or predict interview outcomes.
        </p>
        {safe.recommendations.length === 0 ? (
          <p className="hint">No adjustments to suggest for this photo and job description.</p>
        ) : (
          <ol className="suggestions" aria-label="Suggestions">
            {safe.recommendations.map((rec) => (
              <li key={rec.id} className="suggestion">
                <h3>{CATEGORY_LABELS[rec.category]}</h3>
                <dl>
                  <div>
                    <dt>What we noticed</dt>
                    <dd>{(rec.observationId && observations.get(rec.observationId)) || "From the job description"}</dd>
                  </div>
                  <div>
                    <dt>Optional adjustment</dt>
                    <dd>{rec.adjustment}</dd>
                  </div>
                  <div>
                    <dt>Why</dt>
                    <dd>{rec.rationale}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
