import {
  ContractError,
  parseObservations,
  passesContentPolicy,
  type AnalysisJobId,
  type ErrorCode,
} from "../../../../packages/contracts/src/index.ts";
import type { GuidanceEngine } from "../guidance.ts";
import { newAnalysisJobId, newCorrelationId } from "../ids.ts";
import type { ImageInfo } from "../imageInspect.ts";
import type { Logger } from "../logger.ts";
import { ProviderError, type AnalysisProvider, type ProviderErrorKind } from "../providers/types.ts";
import type { AnalysisJobRecord, JobStore } from "./store.ts";

export const PROVIDER_ERROR_CODES: Record<ProviderErrorKind, ErrorCode> = {
  "rate-limited": "RATE_LIMITED",
  unavailable: "PROCESSING_UNAVAILABLE",
  timeout: "PROCESSING_TIMEOUT",
  "invalid-image": "IMAGE_INVALID",
  "unsuitable-image": "IMAGE_UNSUITABLE",
  "malformed-response": "INTERNAL_ERROR",
};

export interface AnalysisJobsOptions {
  store: JobStore;
  provider: AnalysisProvider;
  guidance: GuidanceEngine;
  logger: Logger;
  now: () => number;
  jobTtlMs: number;
  terminalRetentionMs: number;
  providerTimeoutMs: number;
}

export interface AnalysisJobs {
  create(input: { jobDescription: string; image: Uint8Array; imageInfo: ImageInfo }): AnalysisJobRecord;
  cancel(id: AnalysisJobId): AnalysisJobRecord | undefined;
}

export function toErrorCode(error: unknown): ErrorCode {
  if (error instanceof ProviderError) return PROVIDER_ERROR_CODES[error.kind];
  if (error instanceof ContractError) return "INTERNAL_ERROR";
  return "INTERNAL_ERROR";
}

/** Races the provider against a hard deadline so a stalled provider cannot hold a job open (R4.3). */
export function withDeadline<T>(work: (signal: AbortSignal) => Promise<T>, controller: AbortController, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const timeout = new ProviderError("timeout");
      controller.abort(timeout);
      reject(timeout);
    }, ms);
  });
  return Promise.race([work(controller.signal), deadline]).finally(() => clearTimeout(timer));
}

export function createAnalysisJobs(options: AnalysisJobsOptions): AnalysisJobs {
  const { store, provider, guidance, logger, now } = options;

  function finish(record: AnalysisJobRecord, state: "succeeded" | "failed" | "cancelled", error: ErrorCode | null) {
    record.state = state;
    record.error = error;
    record.abort = null;
    record.jobDescription = null;
    if (state !== "succeeded") {
      // Failure and cancellation end the image's purpose immediately.
      store.wipeImage(record);
      record.expiresAt = Math.min(record.expiresAt, now() + options.terminalRetentionMs);
    }
    logger.log({
      level: state === "failed" ? "warn" : "info",
      event: "analysis_job_finished",
      state,
      errorCode: error ?? "none",
      durationMs: now() - record.createdAt,
    });
  }

  async function process(record: AnalysisJobRecord) {
    // Cancelled before processing started (for example, cancel-by-key during upload).
    if (record.state !== "queued") return;
    const controller = new AbortController();
    record.abort = controller;
    record.state = "processing";
    try {
      const image = record.image;
      const imageInfo = record.imageInfo;
      if (!image || !imageInfo) throw new ProviderError("invalid-image");
      const raw = await withDeadline(
        (signal) => provider.analyze({ bytes: image, ...imageInfo }, signal),
        controller,
        options.providerTimeoutMs,
      );
      if (record.state !== "processing") return;
      // Provider text is filtered by the same content policy as generated guidance (R5.3).
      const parsed = parseObservations(raw);
      const observations = parsed.filter((observation) => passesContentPolicy(observation.text));
      if (observations.length < parsed.length) {
        logger.log({ level: "warn", event: "policy_blocked_observations", count: parsed.length - observations.length });
      }
      const { jobContext, recommendations } = guidance.build(record.jobDescription ?? "", observations);
      record.result = { generatedAt: new Date(now()).toISOString(), jobContext, observations, recommendations };
      finish(record, "succeeded", null);
    } catch (error) {
      if (record.state !== "processing") return;
      finish(record, "failed", toErrorCode(error));
    }
  }

  return {
    create({ jobDescription, image, imageInfo }) {
      const createdAt = now();
      const record: AnalysisJobRecord = {
        id: newAnalysisJobId() as AnalysisJobId,
        state: "queued",
        createdAt,
        expiresAt: createdAt + options.jobTtlMs,
        correlationId: newCorrelationId(),
        jobDescription,
        image,
        imageInfo,
        result: null,
        error: null,
        abort: null,
      };
      store.add(record);
      queueMicrotask(() => void process(record));
      return record;
    },

    cancel(id) {
      const record = store.get(id);
      if (!record) return undefined;
      if (record.state === "queued" || record.state === "processing") {
        record.abort?.abort(new Error("cancelled"));
        finish(record, "cancelled", null);
      } else {
        store.wipeImage(record);
        record.expiresAt = Math.min(record.expiresAt, now() + options.terminalRetentionMs);
      }
      return record;
    },
  };
}
