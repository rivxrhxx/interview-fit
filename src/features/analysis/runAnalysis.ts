import { ApiRequestError, type ApiClient } from "../../lib/api";
import { PollCancelled as Cancelled, abortableSleep } from "../../lib/api/polling";
import { TERMINAL_JOB_STATES, type AnalysisJob, type AnalysisJobId, type AnalysisResult, type ErrorCode } from "../../lib/api/contracts";
import { isConsentCurrent, type ConsentRecord } from "../consent";

export type AnalysisStage = "uploading" | "processing";

export type AnalysisOutcome =
  | { status: "succeeded"; jobId: AnalysisJobId; result: AnalysisResult }
  | { status: "failed"; code: ErrorCode }
  | { status: "cancelled" };

export interface RunAnalysisOptions {
  api: ApiClient;
  jobDescription: string;
  image: Blob;
  consent: ConsentRecord;
  signal: AbortSignal;
  pollIntervalMs: number;
  /** Overall client deadline, a backstop for the backend's own provider timeout. */
  timeoutMs: number;
  onProgress?: (stage: AnalysisStage) => void;
  now?: () => number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

/** Consecutive polling failures tolerated before giving up. */
const MAX_POLL_FAILURES = 2;

function errorCode(error: unknown): ErrorCode {
  return error instanceof ApiRequestError ? error.code : "INTERNAL_ERROR";
}

/**
 * Uploads once, then polls with a bounded interval and deadline. Timeouts and
 * cancellation stop polling and ask the backend to delete the job (R4.3, R4.4).
 */
export async function runAnalysis(options: RunAnalysisOptions): Promise<AnalysisOutcome> {
  const { api, signal } = options;
  const now = options.now ?? (() => performance.now());
  const sleep = options.sleep ?? abortableSleep;
  const deadline = now() + options.timeoutMs;
  let jobId: AnalysisJobId | null = null;

  const cleanup = async () => {
    if (jobId) await api.cancelAnalysisJob(jobId).catch(() => undefined);
    jobId = null;
  };
  const checkCancelled = () => {
    if (signal.aborted) throw new Cancelled();
  };

  if (!isConsentCurrent(options.consent)) return { status: "failed", code: "CONSENT_REQUIRED" };

  try {
    checkCancelled();
    options.onProgress?.("uploading");
    let job: AnalysisJob;
    try {
      job = await api.createAnalysisJob(
        { consentVersion: options.consent.version, jobDescription: options.jobDescription, image: options.image },
        signal,
      );
    } catch (error) {
      checkCancelled();
      return { status: "failed", code: errorCode(error) };
    }
    jobId = job.id;
    checkCancelled();
    options.onProgress?.("processing");

    let failures = 0;
    while (!TERMINAL_JOB_STATES.includes(job.state)) {
      if (now() >= deadline) {
        await cleanup();
        return { status: "failed", code: "PROCESSING_TIMEOUT" };
      }
      await sleep(Math.min(options.pollIntervalMs, Math.max(0, deadline - now())), signal);
      checkCancelled();
      try {
        job = await api.getAnalysisJob(job.id, signal);
        failures = 0;
      } catch (error) {
        checkCancelled();
        failures += 1;
        if (failures >= MAX_POLL_FAILURES) {
          await cleanup();
          return { status: "failed", code: errorCode(error) };
        }
      }
      checkCancelled();
    }

    if (job.state === "succeeded" && job.result) return { status: "succeeded", jobId: job.id, result: job.result };
    if (job.state === "cancelled") return { status: "cancelled" };
    return { status: "failed", code: job.error?.code ?? "INTERNAL_ERROR" };
  } catch (error) {
    if (error instanceof Cancelled || signal.aborted) {
      await cleanup();
      return { status: "cancelled" };
    }
    await cleanup();
    return { status: "failed", code: "INTERNAL_ERROR" };
  }
}
