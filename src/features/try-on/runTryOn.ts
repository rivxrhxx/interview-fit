import { ApiRequestError, type ApiClient } from "../../lib/api";
import {
  TERMINAL_JOB_STATES,
  type AnalysisJobId,
  type ErrorCode,
  type TryOnJob,
  type TryOnJobId,
  type TryOnStyleId,
} from "../../lib/api/contracts";
import { PollCancelled, abortableSleep } from "../../lib/api/polling";

export type TryOnOutcome = { status: "succeeded"; preview: Blob } | { status: "failed"; code: ErrorCode } | { status: "cancelled" };

export interface RunTryOnOptions {
  api: ApiClient;
  analysisJobId: AnalysisJobId;
  styleId: TryOnStyleId;
  signal: AbortSignal;
  pollIntervalMs: number;
  timeoutMs: number;
  /** Called with the backend job ID so the caller can delete the result later (reset). */
  onJobCreated?: (id: TryOnJobId) => void;
  now?: () => number;
}

function code(error: unknown): ErrorCode {
  return error instanceof ApiRequestError ? error.code : "INTERNAL_ERROR";
}

/** Creates the curated try-on, polls with a deadline, and fetches the result into memory. */
export async function runTryOn(options: RunTryOnOptions): Promise<TryOnOutcome> {
  const { api, signal } = options;
  const now = options.now ?? (() => performance.now());
  const deadline = now() + options.timeoutMs;
  let jobId: TryOnJobId | null = null;
  const cleanup = async () => {
    if (jobId) await api.cancelTryOnJob(jobId).catch(() => undefined);
  };

  try {
    if (signal.aborted) throw new PollCancelled();
    let job: TryOnJob;
    try {
      job = await api.createTryOnJob({ analysisJobId: options.analysisJobId, styleId: options.styleId }, signal);
    } catch (error) {
      if (signal.aborted) throw new PollCancelled();
      return { status: "failed", code: code(error) };
    }
    jobId = job.id;
    options.onJobCreated?.(job.id);

    while (!TERMINAL_JOB_STATES.includes(job.state)) {
      if (now() >= deadline) {
        await cleanup();
        return { status: "failed", code: "PROCESSING_TIMEOUT" };
      }
      await abortableSleep(options.pollIntervalMs, signal);
      try {
        job = await api.getTryOnJob(job.id, signal);
      } catch (error) {
        if (signal.aborted) throw new PollCancelled();
        await cleanup();
        return { status: "failed", code: code(error) };
      }
    }

    if (job.state === "failed") return { status: "failed", code: job.error?.code ?? "INTERNAL_ERROR" };
    if (job.state === "cancelled") return { status: "cancelled" };
    if (signal.aborted) throw new PollCancelled();
    try {
      return { status: "succeeded", preview: await api.getTryOnResult(job.id, signal) };
    } catch (error) {
      if (signal.aborted) throw new PollCancelled();
      await cleanup();
      return { status: "failed", code: code(error) };
    }
  } catch (error) {
    await cleanup();
    if (error instanceof PollCancelled || signal.aborted) return { status: "cancelled" };
    return { status: "failed", code: "INTERNAL_ERROR" };
  }
}
