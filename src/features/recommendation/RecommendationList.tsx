import type { AnalysisResult } from "../../lib/api/contracts";
import { MESSAGES, useI18n } from "../../lib/i18n";
import { filterGuidance } from "./filterGuidance";

/** Hides the quote when the evidence is just the label again (for example 화상 면접). */
function sameText(a: string, b: string): boolean {
  const normalize = (value: string) => value.replace(/\s/g, "").toLowerCase();
  return normalize(a) === normalize(b);
}

interface RecommendationListProps {
  result: AnalysisResult;
}

/** Job context and optional suggestions. All text is rendered as text nodes only. */
export function RecommendationList({ result }: RecommendationListProps) {
  const { m, locale } = useI18n();
  const safe = filterGuidance(result);
  const observations = new Map(safe.observations.map((observation) => [observation.id, observation.text]));

  return (
    <>
      <section className="section" aria-labelledby="job-context-heading">
        <h2 id="job-context-heading" className="section-title">
          {m.guidance.contextTitle}
        </h2>
        {result.locale !== locale && <p className="notice">{MESSAGES[locale].review.languageNote}</p>}
        {safe.jobContext.summary && <p className="hint">{safe.jobContext.summary}</p>}
        {safe.jobContext.cues.length > 0 && (
          <ul className="chips" aria-label={m.guidance.cuesLabel}>
            {safe.jobContext.cues.map((cue) => (
              <li key={cue.id}>
                <span className="chip-label">{cue.label}</span>
                {sameText(cue.label, cue.evidence) ? null : <span className="chip-evidence">“{cue.evidence}”</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section" aria-labelledby="suggestions-heading">
        <h2 id="suggestions-heading" className="section-title">
          {m.guidance.suggestionsTitle}
        </h2>
        <p className="hint">{m.guidance.disclaimer}</p>
        {safe.recommendations.length === 0 ? (
          <p className="hint">{m.guidance.empty}</p>
        ) : (
          <ol className="suggestions" aria-label={m.guidance.listLabel}>
            {safe.recommendations.map((rec) => (
              <li key={rec.id} className="suggestion">
                <h3>{m.categories[rec.category]}</h3>
                <dl>
                  <div>
                    <dt>{m.guidance.noticed}</dt>
                    <dd>{(rec.observationId && observations.get(rec.observationId)) || m.guidance.fromJob}</dd>
                  </div>
                  <div>
                    <dt>{m.guidance.adjustment}</dt>
                    <dd>{rec.adjustment}</dd>
                  </div>
                  <div>
                    <dt>{m.guidance.why}</dt>
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
