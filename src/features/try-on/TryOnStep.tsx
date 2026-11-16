import { useEffect, useRef } from "react";
import { useAdapters } from "../../lib/adapters";
import { ERROR_MESSAGES, ERROR_POLICY, TRY_ON_STYLES, type AnalysisJobId, type ErrorCode, type TryOnJobId } from "../../lib/api/contracts";
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
    <div className="progress-bar" aria-hidden="true">
      <span />
    </div>
  );
}

export function TryOnStep(props: TryOnStepProps) {
  const { phase } = props;
  const { api } = useAdapters();
  const readyJob = phase.status === "ready" ? phase.jobId : null;

  // Leaving the ready state (reset, back, start over) deletes the backend copy of the result.
  useEffect(() => {
    if (!readyJob) return;
    return () => {
      void api.cancelTryOnJob(readyJob).catch(() => undefined);
    };
  }, [api, readyJob]);

  return (
    <div className="step-stack">
      <section className="summary-card" aria-label="Curated style">
        <p className="eyebrow-label">Curated style</p>
        <h2 id="curated-style-heading">{CURATED_STYLE.label}</h2>
        <p className="field-hint">{CURATED_STYLE.description}</p>
        <p className="field-hint">The preview is not saved. Only an explicit export creates a file.</p>
      </section>

      {phase.status === "running" && <TryOnRunner key={props.attempt} {...props} />}
      {phase.status === "ready" && (
        <TryOnCompare original={props.original} preview={phase.preview} styleLabel={CURATED_STYLE.label} />
      )}

      <div className="photo-actions">
        {phase.status === "idle" && (
          <button type="button" className="button button-primary" onClick={props.onStart}>
            Generate preview
          </button>
        )}
        {phase.status === "running" && (
          <button type="button" className="button button-secondary" onClick={props.onCancel}>
            Cancel preview
          </button>
        )}
        {phase.status === "ready" && (
          <button type="button" className="button button-secondary" onClick={props.onReset}>
            Reset preview
          </button>
        )}
        {phase.status === "failed" && ERROR_POLICY[phase.code].retryable && (
          <button type="button" className="button button-primary" onClick={props.onStart}>
            Try again
          </button>
        )}
        {phase.status !== "running" && (
          <button type="button" className="button button-secondary" onClick={props.onContinue}>
            Continue to report
          </button>
        )}
        {phase.status !== "running" && (
          <button type="button" className="button button-secondary" onClick={props.onClose}>
            Back to guidance
          </button>
        )}
      </div>
    </div>
  );
}

export function tryOnNotice(phase: TryOnPhase): string | undefined {
  switch (phase.status) {
    case "running":
      return "Creating your preview…";
    case "ready":
      return "Preview ready. Compare it with your original photo.";
    case "failed":
      return ERROR_MESSAGES[phase.code];
    default:
      return undefined;
  }
}
