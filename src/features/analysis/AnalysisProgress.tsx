import { useEffect, useRef } from "react";
import { useAdapters } from "../../lib/adapters";
import type { ConsentRecord } from "../consent";
import { runAnalysis, type AnalysisOutcome, type AnalysisStage } from "./runAnalysis";

export interface AnalysisTiming {
  pollIntervalMs: number;
  timeoutMs: number;
}

export const DEFAULT_ANALYSIS_TIMING: AnalysisTiming = { pollIntervalMs: 1_500, timeoutMs: 60_000 };

interface AnalysisProgressProps {
  jobDescription: string;
  image: Blob;
  consent: ConsentRecord;
  timing: AnalysisTiming;
  onProgress: (stage: AnalysisStage) => void;
  onFinished: (outcome: Exclude<AnalysisOutcome, { status: "cancelled" }>) => void;
  onCancel: () => void;
}

/**
 * Runs one analysis for its lifetime. Unmounting (cancel, navigation, or close)
 * aborts polling and requests backend cleanup.
 */
export function AnalysisProgress(props: AnalysisProgressProps) {
  const { api } = useAdapters();
  const callbacks = useRef(props);
  callbacks.current = props;
  const { jobDescription, image, consent, timing } = props;

  useEffect(() => {
    const controller = new AbortController();
    void runAnalysis({
      api,
      jobDescription,
      image,
      consent,
      signal: controller.signal,
      pollIntervalMs: timing.pollIntervalMs,
      timeoutMs: timing.timeoutMs,
      onProgress: (stage) => {
        if (!controller.signal.aborted) callbacks.current.onProgress(stage);
      },
    }).then((outcome) => {
      if (controller.signal.aborted || outcome.status === "cancelled") return;
      callbacks.current.onFinished(outcome);
    });
    return () => controller.abort();
  }, [api, jobDescription, image, consent, timing]);

  return (
    <div className="analysis-progress">
      <div className="progress-bar" aria-hidden="true">
        <span />
      </div>
      <p className="field-hint">
        Your photo and job description are being processed by the Interview Fit backend. Cancelling stops the analysis
        and asks the backend to delete the temporary copy.
      </p>
      <div className="photo-actions">
        <button type="button" className="button button-secondary" onClick={() => callbacks.current.onCancel()}>
          Cancel analysis
        </button>
      </div>
    </div>
  );
}
