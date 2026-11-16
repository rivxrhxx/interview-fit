import type { ErrorCode, JobState, TryOnJobId, TryOnStyleId } from "../../../../packages/contracts/src/index.ts";
import { newCorrelationId, newTryOnJobId } from "../ids.ts";
import type { Logger } from "../logger.ts";
import type { TryOnProvider, TryOnResult } from "../providers/types.ts";
import { toErrorCode, withDeadline } from "./analysisJobs.ts";
import type { AnalysisJobRecord } from "./store.ts";

export interface TryOnJobRecord {
  id: TryOnJobId;
  styleId: TryOnStyleId;
  state: JobState;
  createdAt: number;
  expiresAt: number;
  correlationId: string;
  /** Temporary result; zeroed and cleared on reset, failure, or expiry (R6.3). */
  result: TryOnResult | null;
  error: ErrorCode | null;
  abort: AbortController | null;
}

export interface TryOnJobs {
  create(analysis: AnalysisJobRecord, styleId: TryOnStyleId): TryOnJobRecord;
  get(id: string): TryOnJobRecord | undefined;
  cancel(id: string): TryOnJobRecord | undefined;
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
}): TryOnJobs {
  const { provider, logger, now } = options;
  const jobs = new Map<string, TryOnJobRecord>();

  function wipe(record: TryOnJobRecord) {
    record.result?.bytes.fill(0);
    record.result = null;
  }

  function remove(record: TryOnJobRecord) {
    record.abort?.abort();
    wipe(record);
    jobs.delete(record.id);
  }

  function finish(record: TryOnJobRecord, state: "succeeded" | "failed" | "cancelled", error: ErrorCode | null) {
    record.state = state;
    record.error = error;
    record.abort = null;
    if (state !== "succeeded") {
      wipe(record);
      record.expiresAt = Math.min(record.expiresAt, now() + options.terminalRetentionMs);
    }
    logger.log({ level: state === "failed" ? "warn" : "info", event: "try_on_job_finished", state, errorCode: error ?? "none" });
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
      const createdAt = now();
      const record: TryOnJobRecord = {
        id: newTryOnJobId() as TryOnJobId,
        styleId,
        state: "queued",
        createdAt,
        // A try-on never outlives the consented analysis job it came from.
        expiresAt: Math.min(analysis.expiresAt, createdAt + options.jobTtlMs),
        correlationId: newCorrelationId(),
        result: null,
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
      if (record.state === "queued" || record.state === "processing") {
        record.abort?.abort(new Error("cancelled"));
        finish(record, "cancelled", null);
      } else {
        // Reset after success: the result is deleted immediately (R6.2, R6.3).
        wipe(record);
        if (record.state === "succeeded") record.state = "cancelled";
        record.expiresAt = Math.min(record.expiresAt, now() + options.terminalRetentionMs);
      }
      return record;
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
