import type { ErrorCode, JobState, TryOnJobId, TryOnStyleId } from "../../../../packages/contracts/src/index.ts";
import { newCorrelationId, newTryOnJobId } from "../ids.ts";
import type { Logger } from "../logger.ts";
import type { TryOnProvider, TryOnResult } from "../providers/types.ts";
import { toErrorCode, withDeadline } from "./analysisJobs.ts";
import type { AnalysisJobRecord } from "./store.ts";

export interface TryOnJobRecord {
  id: TryOnJobId;
  /** The consented analysis job whose image was used; its deletion cascades here. */
  analysisJobId: string;
  styleId: TryOnStyleId;
  state: JobState;
  createdAt: number;
  expiresAt: number;
  correlationId: string;
  /** Temporary result; zeroed and cleared on reset, failure, or expiry (R6.3). */
  result: TryOnResult | null;
  /** Memory held back while the try-on runs: the private photo copy plus the expected result (R4.6). */
  reservedBytes: number;
  error: ErrorCode | null;
  abort: AbortController | null;
}

/** No memory or try-on slot is free right now; the caller answers PROCESSING_UNAVAILABLE. */
export class TryOnCapacityError extends Error {
  readonly reason: "memory" | "busy";

  constructor(reason: "memory" | "busy") {
    super(`try-on capacity: ${reason}`);
    this.name = "TryOnCapacityError";
    this.reason = reason;
  }
}

/** The private copy of the photo plus a result of about the same size (a re-rendered photo). */
export const reservationFor = (photoBytes: number) => 2 * photoBytes;

export interface TryOnJobs {
  /**
   * Replaces any try-on of the same analysis, reserves memory, and starts the job.
   * Throws TryOnCapacityError when the memory limit or the in-progress cap would be exceeded.
   */
  create(analysis: AnalysisJobRecord, styleId: TryOnStyleId): TryOnJobRecord;
  get(id: string): TryOnJobRecord | undefined;
  cancel(id: string): TryOnJobRecord | undefined;
  /** Removes every try-on (and its result) made from an analysis job. */
  removeForAnalysis(analysisJobId: string): void;
  /** Result bytes plus reservations of try-ons still running. */
  retainedBytes(): number;
  sweep(): void;
  clear(): void;
}

export function createTryOnJobs(options: {
  provider: TryOnProvider;
  logger: Logger;
  now: () => number;
  jobTtlMs: number;
  terminalRetentionMs: number;
  providerTimeoutMs: number;
  /** Try-ons queued or processing at once, across all analyses. */
  maxActive: number;
  /** True when `bytes` more can be held without passing the backend's memory limit. */
  fits: (bytes: number) => boolean;
}): TryOnJobs {
  const { provider, logger, now } = options;
  const jobs = new Map<string, TryOnJobRecord>();

  const isActive = (record: TryOnJobRecord) => record.state === "queued" || record.state === "processing";

  function wipe(record: TryOnJobRecord) {
    record.result?.bytes.fill(0);
    record.result = null;
  }

  function remove(record: TryOnJobRecord) {
    record.abort?.abort();
    wipe(record);
    record.reservedBytes = 0;
    jobs.delete(record.id);
  }

  function finish(record: TryOnJobRecord, state: "succeeded" | "failed" | "cancelled", error: ErrorCode | null) {
    record.state = state;
    record.error = error;
    record.abort = null;
    record.reservedBytes = 0;
    if (state !== "succeeded") {
      wipe(record);
      record.expiresAt = Math.min(record.expiresAt, now() + options.terminalRetentionMs);
    }
    logger.log({ level: state === "failed" ? "warn" : "info", event: "try_on_job_finished", state, errorCode: error ?? "none" });
  }

  /** Stops a running try-on, or deletes a finished one's result, keeping a short-lived record. */
  function discard(record: TryOnJobRecord) {
    if (isActive(record)) {
      record.abort?.abort(new Error("cancelled"));
      finish(record, "cancelled", null);
    } else {
      // Reset after success: the result is deleted immediately (R6.2, R6.3).
      wipe(record);
      if (record.state === "succeeded") record.state = "cancelled";
      record.expiresAt = Math.min(record.expiresAt, now() + options.terminalRetentionMs);
    }
  }

  async function process(record: TryOnJobRecord, source: Uint8Array, info: NonNullable<AnalysisJobRecord["imageInfo"]>) {
    const controller = new AbortController();
    record.abort = controller;
    record.state = "processing";
    try {
      const result = await withDeadline(
        (signal) => provider.tryOn({ bytes: source, ...info }, record.styleId, signal),
        controller,
        options.providerTimeoutMs,
      );
      if (record.state !== "processing") {
        result.bytes.fill(0);
        return;
      }
      // Recheck with the actual size: the reservation was only an estimate (R4.6).
      source.fill(0);
      record.reservedBytes = 0;
      if (!options.fits(result.bytes.length)) {
        result.bytes.fill(0);
        logger.log({ level: "warn", event: "try_on_result_over_budget", bytes: result.bytes.length });
        finish(record, "failed", "PROCESSING_UNAVAILABLE");
        return;
      }
      record.result = result;
      finish(record, "succeeded", null);
    } catch (error) {
      if (record.state === "processing") finish(record, "failed", toErrorCode(error));
    } finally {
      // The provider received a private copy of the analysis image.
      source.fill(0);
    }
  }

  return {
    create(analysis, styleId) {
      // One try-on per analysis: a new style replaces the previous one, running or finished.
      for (const record of [...jobs.values()]) if (record.analysisJobId === analysis.id) discard(record);
      if ([...jobs.values()].filter(isActive).length >= options.maxActive) throw new TryOnCapacityError("busy");
      const reservedBytes = reservationFor(analysis.image!.length);
      if (!options.fits(reservedBytes)) throw new TryOnCapacityError("memory");
      const createdAt = now();
      const record: TryOnJobRecord = {
        id: newTryOnJobId() as TryOnJobId,
        analysisJobId: analysis.id,
        styleId,
        state: "queued",
        createdAt,
        // A try-on never outlives the consented analysis job it came from.
        expiresAt: Math.min(analysis.expiresAt, createdAt + options.jobTtlMs),
        correlationId: newCorrelationId(),
        result: null,
        reservedBytes,
        error: null,
        abort: null,
      };
      jobs.set(record.id, record);
      const source = analysis.image!.slice();
      const info = analysis.imageInfo!;
      queueMicrotask(() => void process(record, source, info));
      return record;
    },

    get(id) {
      const record = jobs.get(id);
      if (!record) return undefined;
      if (record.expiresAt <= now()) {
        remove(record);
        return undefined;
      }
      return record;
    },

    cancel(id) {
      const record = this.get(id);
      if (!record) return undefined;
      discard(record);
      return record;
    },

    removeForAnalysis(analysisJobId) {
      for (const record of [...jobs.values()]) if (record.analysisJobId === analysisJobId) remove(record);
    },

    retainedBytes() {
      return [...jobs.values()].reduce((sum, record) => sum + (record.result?.bytes.length ?? 0) + record.reservedBytes, 0);
    },

    sweep() {
      const current = now();
      for (const record of [...jobs.values()]) if (record.expiresAt <= current) remove(record);
    },

    clear() {
      for (const record of [...jobs.values()]) remove(record);
    },
  };
}
