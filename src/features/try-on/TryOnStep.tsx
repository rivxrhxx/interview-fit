import { useEffect, useRef } from "react";
import { useAdapters } from "../../lib/adapters";
import { ERROR_POLICY, TRY_ON_STYLES, type AnalysisJobId, type ErrorCode, type TryOnJobId } from "../../lib/api/contracts";
import { useI18n, type Messages } from "../../lib/i18n";
import { runTryOn, type TryOnOutcome } from "./runTryOn";
import { TryOnCompare } from "./TryOnCompare";

export type TryOnPhase =
  | { status: "idle" }
  | { status: "running" }
  | { status: "ready"; preview: Blob; jobId: TryOnJobId }
  | { status: "failed"; code: ErrorCode };

export interface TryOnTiming {
  pollIntervalMs: number;
  timeoutMs: number;
}

/** The MVP offers exactly one curated style (R6.1). */
export const CURATED_STYLE = TRY_ON_STYLES[0];

interface TryOnStepProps {
  phase: TryOnPhase;
  attempt: number;
  original: Blob;
  analysisJobId: AnalysisJobId;
  timing: TryOnTiming;
  onStart: () => void;
  onFinished: (outcome: Exclude<TryOnOutcome, { status: "cancelled" }>, jobId: TryOnJobId | null) => void;
  onCancel: () => void;
  onReset: () => void;
  onClose: () => void;
  onContinue: () => void;
}

function TryOnRunner({
  analysisJobId,
  timing,
  onFinished,
}: Pick<TryOnStepProps, "analysisJobId" | "timing" | "onFinished">) {
  const { api } = useAdapters();
  const finished = useRef(onFinished);
  finished.current = onFinished;

  useEffect(() => {
    const controller = new AbortController();
    let jobId: TryOnJobId | null = null;
    void runTryOn({
      api,
      analysisJobId,
      styleId: CURATED_STYLE.id,
      signal: controller.signal,
      pollIntervalMs: timing.pollIntervalMs,
      timeoutMs: timing.timeoutMs,
      onJobCreated: (id) => (jobId = id),
    }).then((outcome) => {
      if (!controller.signal.aborted && outcome.status !== "cancelled") finished.current(outcome, jobId);
    });
    // Unmounting (cancel, navigation, close) aborts polling and deletes the backend job.
    return () => controller.abort();
  }, [api, analysisJobId, timing]);

  return (
    <div className="progress-track" aria-hidden="true">
      <span />
    </div>
  );
}

export function TryOnStep(props: TryOnStepProps) {
  const { phase } = props;
  const { api } = useAdapters();
  const { m } = useI18n();
  const style = m.tryOn.style;
  const readyJob = phase.status === "ready" ? phase.jobId : null;

  // Leaving the ready state (reset, back, start over) deletes the backend copy of the result.
  useEffect(() => {
    if (!readyJob) return;
    return () => {
      void api.cancelTryOnJob(readyJob).catch(() => undefined);
    };
  }, [api, readyJob]);

  const retryable = phase.status === "failed" && ERROR_POLICY[phase.code].retryable;

  return (
    <div className="step-stack">
      <section className="panel" aria-label={m.tryOn.regionLabel}>
        <p className="eyebrow">{m.tryOn.eyebrow}</p>
        <h2 className="section-title">{style.label}</h2>
        <p className="hint">{style.description}</p>
        <p className="meta">{m.tryOn.notSaved}</p>
      </section>

      {phase.status === "running" && <TryOnRunner key={props.attempt} {...props} />}
      {phase.status === "ready" && (
        <TryOnCompare original={props.original} preview={phase.preview} styleLabel={style.label} />
      )}

      <div className="actions">
        {phase.status === "idle" && (
          <button type="button" className="button button-primary" onClick={props.onStart}>
            {m.tryOn.generate}
          </button>
        )}
        {retryable && (
          <button type="button" className="button button-primary" onClick={props.onStart}>
            {m.tryOn.retry}
          </button>
        )}
        {phase.status === "running" && (
          <button type="button" className="button button-secondary" onClick={props.onCancel}>
            {m.tryOn.cancel}
          </button>
        )}
        {phase.status === "ready" && (
          <button type="button" className="button button-primary" onClick={props.onContinue}>
            {m.tryOn.continue}
          </button>
        )}
        {phase.status === "ready" && (
          <button type="button" className="button button-secondary" onClick={props.onReset}>
            {m.tryOn.reset}
          </button>
        )}
        {(phase.status === "idle" || phase.status === "failed") && (
          <button type="button" className="button button-secondary" onClick={props.onContinue}>
            {m.tryOn.continue}
          </button>
        )}
        {phase.status !== "running" && (
          <button type="button" className="button button-text" onClick={props.onClose}>
            {m.tryOn.back}
          </button>
        )}
      </div>
    </div>
  );
}

export function tryOnNotice(phase: TryOnPhase, m: Messages): string | undefined {
  switch (phase.status) {
    case "running":
      return m.tryOn.running;
    case "ready":
      return m.tryOn.ready;
    case "failed":
      return m.errors[phase.code];
    default:
      return undefined;
  }
}
