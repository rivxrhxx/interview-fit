import { useEffect, useRef } from "react";
import { useAdapters } from "../../lib/adapters";
import { ApiRequestError } from "../../lib/api";
import { FORMALITY_LEVELS, passesContentPolicy, type ErrorCode, type JobContext } from "../../lib/api/contracts";
import { useI18n } from "../../lib/i18n";

/** Formality steps shown on the scale, most to least formal. */
const SCALE = FORMALITY_LEVELS.filter((level) => level !== "unknown");

interface JobInsightLoaderProps {
  jobDescription: string;
  onReady: (jobContext: JobContext) => void;
  onFailed: (code: ErrorCode) => void;
}

/**
 * Requests the job analysis for its lifetime. Leaving the step (for example,
 * editing the posting) aborts the request. Only text is sent (R1.5).
 */
export function JobInsightLoader({ jobDescription, onReady, onFailed }: JobInsightLoaderProps) {
  const { api } = useAdapters();
  const { m, locale } = useI18n();
  // The analysis language is fixed when the request is sent.
  const requestLocale = useRef(locale);
  const callbacks = useRef({ onReady, onFailed });
  callbacks.current = { onReady, onFailed };

  useEffect(() => {
    const controller = new AbortController();
    api
      .analyzeJob({ jobDescription, locale: requestLocale.current }, controller.signal)
      .then((analysis) => {
        if (!controller.signal.aborted) callbacks.current.onReady(analysis.jobContext);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        callbacks.current.onFailed(error instanceof ApiRequestError ? error.code : "INTERNAL_ERROR");
      });
    return () => controller.abort();
  }, [api, jobDescription]);

  return (
    <section className="panel" aria-busy="true" aria-labelledby="job-insight-heading">
      <h2 id="job-insight-heading" className="section-title">
        {m.insight.title}
      </h2>
      <div className="progress-track" aria-hidden="true">
        <span />
      </div>
      <p className="hint">{m.insight.loading}</p>
    </section>
  );
}

/** Job and company-atmosphere analysis. Every value is rendered as text, never as markup (R1.3). */
export function JobInsightView({ jobContext }: { jobContext: JobContext }) {
  const { m } = useI18n();
  const safe = (text: string | null) => (text !== null && passesContentPolicy(text) ? text : null);
  const summary = safe(jobContext.summary);

  return (
    <section className="panel insight" aria-labelledby="job-insight-heading">
      <div className="section-header">
        <h2 id="job-insight-heading" className="section-title">
          {m.insight.title}
        </h2>
        <span className={jobContext.source === "ai" ? "badge badge-accent" : "badge"}>{m.insight.source[jobContext.source]}</span>
      </div>
      {summary && <p className="insight-summary">{summary}</p>}
      {jobContext.source === "rules" && <p className="meta">{m.insight.rulesNote}</p>}

      <dl className="insight-points">
        {jobContext.points.map((point) => {
          const value = safe(point.value);
          const evidence = safe(point.evidence);
          return (
            <div key={point.id} className="insight-point" data-stated={value !== null || undefined}>
              <dt>{m.insight.fields[point.id]}</dt>
              <dd>
                {value === null ? (
                  <span className="insight-empty">{m.insight.notStated}</span>
                ) : (
                  <>
                    <span className="insight-value">{value}</span>
                    {evidence && evidence !== value && <span className="insight-quote">{m.insight.quote(evidence)}</span>}
                  </>
                )}
              </dd>
            </div>
          );
        })}
      </dl>

      <div className="formality">
        <h3 className="formality-title">{m.insight.formalityTitle}</h3>
        <ol className="formality-scale" data-unknown={jobContext.formality === "unknown" || undefined}>
          {SCALE.map((level) => {
            const selected = level === jobContext.formality;
            return (
              <li key={level} aria-current={selected ? "true" : undefined}>
                {m.insight.formality[level]}
                {selected && <span className="visually-hidden"> {m.insight.selected}</span>}
              </li>
            );
          })}
        </ol>
        {jobContext.formality === "unknown" && <p className="meta">{m.insight.formalityUnknown}</p>}
      </div>
    </section>
  );
}

interface JobInsightErrorProps {
  code: ErrorCode;
  onRetry: () => void;
  onEdit: () => void;
}

export function JobInsightError({ code, onRetry, onEdit }: JobInsightErrorProps) {
  const { m } = useI18n();
  return (
    <section className="panel" aria-labelledby="job-insight-heading">
      <h2 id="job-insight-heading" className="section-title">
        {m.insight.title}
      </h2>
      <p className="field-error" role="alert">
        {m.insight.failed} {m.errors[code]}
      </p>
      <div className="actions">
        <button type="button" className="button button-primary" onClick={onRetry}>
          {m.insight.retry}
        </button>
        <button type="button" className="button button-text" onClick={onEdit}>
          {m.insight.edit}
        </button>
      </div>
    </section>
  );
}
