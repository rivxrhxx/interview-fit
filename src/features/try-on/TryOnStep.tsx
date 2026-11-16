import { useEffect, useRef, useState } from "react";
import { useAdapters } from "../../lib/adapters";
import {
  ERROR_POLICY,
  TRY_ON_STYLES,
  type AnalysisJobId,
  type ErrorCode,
  type TryOnJobId,
  type TryOnStyleId,
} from "../../lib/api/contracts";
import { useI18n, type Messages } from "../../lib/i18n";
import { useObjectUrl } from "../../lib/media/useObjectUrl";
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

interface TryOnStepProps {
  phase: TryOnPhase;
  attempt: number;
  styleId: TryOnStyleId;
  /** Styles that suit the posting's formality (R6.4). */
  suggested: readonly TryOnStyleId[];
  original: Blob;
  analysisJobId: AnalysisJobId;
  timing: TryOnTiming;
  onSelect: (styleId: TryOnStyleId) => void;
  onStart: () => void;
  onFinished: (outcome: Exclude<TryOnOutcome, { status: "cancelled" }>, jobId: TryOnJobId | null) => void;
  onCancel: () => void;
  onReset: () => void;
  onClose: () => void;
  onContinue: () => void;
}

function TryOnRunner({
  analysisJobId,
  styleId,
  timing,
  onFinished,
}: Pick<TryOnStepProps, "analysisJobId" | "styleId" | "timing" | "onFinished">) {
  const { api } = useAdapters();
  const finished = useRef(onFinished);
  finished.current = onFinished;

  useEffect(() => {
    const controller = new AbortController();
    let jobId: TryOnJobId | null = null;
    void runTryOn({
      api,
      analysisJobId,
      styleId,
      signal: controller.signal,
      pollIntervalMs: timing.pollIntervalMs,
      timeoutMs: timing.timeoutMs,
      onJobCreated: (id) => (jobId = id),
    }).then((outcome) => {
      if (!controller.signal.aborted && outcome.status !== "cancelled") finished.current(outcome, jobId);
    });
    // Unmounting (cancel, navigation, close) aborts polling and deletes the backend job.
    return () => controller.abort();
  }, [api, analysisJobId, styleId, timing]);

  return (
    <div className="progress-track" aria-hidden="true">
      <span />
    </div>
  );
}

/** Example image of a style from the backend; a plain placeholder if it cannot be loaded. */
function StyleThumbnail({ styleId }: { styleId: TryOnStyleId }) {
  const { api } = useAdapters();
  const [blob, setBlob] = useState<Blob | null>(null);
  const url = useObjectUrl(blob);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getStyleThumbnail(styleId, controller.signal)
      .then((image) => {
        if (!controller.signal.aborted) setBlob(image);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [api, styleId]);

  return (
    // Decorative: the style name next to it is the accessible label.
    <span className="style-thumb" aria-hidden="true">
      {url ? <img src={url} alt="" /> : <span className="style-thumb-placeholder" />}
    </span>
  );
}

function StylePicker({ styleId, suggested, disabled, onSelect }: Pick<TryOnStepProps, "styleId" | "suggested" | "onSelect"> & { disabled: boolean }) {
  const { m } = useI18n();
  return (
    <fieldset className="style-picker" disabled={disabled}>
      <legend className="section-title">{m.tryOn.pickerLabel}</legend>
      <p className="hint">{m.tryOn.pickerHint}</p>
      <div className="style-grid">
        {TRY_ON_STYLES.map((style) => {
          const copy = m.tryOn.styles[style.id];
          const isSuggested = suggested.includes(style.id);
          return (
            <label key={style.id} className="style-option" data-selected={style.id === styleId || undefined}>
              <input
                type="radio"
                name="hairstyle"
                value={style.id}
                checked={style.id === styleId}
                onChange={() => onSelect(style.id)}
              />
              <StyleThumbnail styleId={style.id} />
              <span className="style-name">{copy.label}</span>
              <span className="style-description">{copy.description}</span>
              {isSuggested && <span className="badge badge-accent">{m.tryOn.suggested}</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function TryOnStep(props: TryOnStepProps) {
  const { phase, styleId } = props;
  const { api } = useAdapters();
  const { m } = useI18n();
  const label = m.tryOn.styles[styleId].label;
  const readyJob = phase.status === "ready" ? phase.jobId : null;

  // Leaving the ready state (another style, reset, back, start over) deletes the backend copy of the result.
  useEffect(() => {
    if (!readyJob) return;
    return () => {
      void api.cancelTryOnJob(readyJob).catch(() => undefined);
    };
  }, [api, readyJob]);

  const retryable = phase.status === "failed" && ERROR_POLICY[phase.code].retryable;

  return (
    <div className="step-stack">
      {phase.status !== "ready" && (
        <StylePicker styleId={styleId} suggested={props.suggested} disabled={phase.status === "running"} onSelect={props.onSelect} />
      )}
      <p className="meta">{m.tryOn.notSaved}</p>

      {phase.status === "running" && <TryOnRunner key={props.attempt} {...props} />}
      {phase.status === "ready" && <TryOnCompare original={props.original} preview={phase.preview} styleLabel={label} />}

      <div className="actions">
        {phase.status === "idle" && (
          <button type="button" className="button button-primary" onClick={props.onStart}>
            {m.tryOn.generate(label)}
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
