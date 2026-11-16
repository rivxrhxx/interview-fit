import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  ANALYSIS_JOB_ID_PATTERN,
  ANALYSIS_REQUEST_FIELDS,
  CURRENT_CONSENT_VERSION,
  ERROR_MESSAGES,
  ERROR_POLICY,
  IMAGE_MAX_BYTES,
  JOB_ANALYSIS_REQUEST_FIELDS,
  TRY_ON_JOB_ID_PATTERN,
  TRY_ON_STYLES,
  checkJobDescription,
  isLocale,
  type AnalysisJob,
  type AnalysisJobId,
  type ErrorCode,
  type JobAnalysis,
  type TryOnJob,
  type TryOnStyleId,
} from "../../../packages/contracts/src/index.ts";
import type { ProxyConfig } from "./config.ts";
import { createAdvisor, type AiWriter } from "./guidance.ts";
import { BodyTooLargeError, parseMultipart, readBody } from "./http/body.ts";
import { newCorrelationId } from "./ids.ts";
import { inspectImage, stripImageMetadata } from "./imageInspect.ts";
import { createAnalysisJobs, toErrorCode, withDeadline } from "./jobs/analysisJobs.ts";
import { createJobStore, type AnalysisJobRecord, type JobStore } from "./jobs/store.ts";
import { createTryOnJobs, type TryOnJobRecord } from "./jobs/tryOnJobs.ts";
import type { Logger } from "./logger.ts";
import type { AnalysisProvider, TryOnProvider } from "./providers/types.ts";
import { createRateLimiter } from "./rateLimit.ts";

/** Upload limit plus room for the job description and multipart framing. */
const MAX_BODY_BYTES = IMAGE_MAX_BYTES + 128 * 1024;

const MAX_JSON_BODY_BYTES = 4 * 1024;
/** A maximum-length job description in UTF-8 plus JSON framing. */
const MAX_JOB_ANALYSIS_BODY_BYTES = 64 * 1024;
const TRY_ON_STYLE_IDS: readonly string[] = TRY_ON_STYLES.map((style) => style.id);

/** Client-generated retry key; a repeat within the job's lifetime returns the same job. */
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{16,128}$/;

export interface ProxyDeps {
  config: ProxyConfig;
  provider: AnalysisProvider;
  /** Optional: without it, try-on requests fail with PROCESSING_UNAVAILABLE. */
  tryOnProvider?: TryOnProvider;
  logger: Logger;
  /** Optional AI writer (Claude). Without it, the deterministic rules engine is used (R1.6). */
  ai?: AiWriter | null;
  now?: () => number;
}

export interface Proxy {
  server: Server;
  store: JobStore;
  shutdown(): void;
}

class HttpError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly headers: Record<string, string>;

  constructor(code: ErrorCode, options: { status?: number; headers?: Record<string, string> } = {}) {
    super(code);
    this.code = code;
    this.status = options.status ?? ERROR_POLICY[code].httpStatus;
    this.headers = options.headers ?? {};
  }
}

const ROUTES = {
  jobAnalyses: "/v1/job-analyses",
  collection: "/v1/analysis-jobs",
  item: /^\/v1\/analysis-jobs\/([^/]+)$/,
  tryOnCollection: "/v1/try-on-jobs",
  tryOnItem: /^\/v1\/try-on-jobs\/([^/]+)$/,
  tryOnResult: /^\/v1\/try-on-jobs\/([^/]+)\/result$/,
};

function iso(ms: number) {
  return new Date(ms).toISOString();
}

/** Builds the public contract view from explicit fields only; internal state never leaks. */
function toPublicJob(record: AnalysisJobRecord): AnalysisJob {
  return {
    id: record.id,
    state: record.state,
    createdAt: iso(record.createdAt),
    expiresAt: iso(record.expiresAt),
    result: record.state === "succeeded" ? record.result : null,
    error:
      record.state === "failed" && record.error
        ? {
            code: record.error,
            message: ERROR_MESSAGES[record.error],
            retryable: ERROR_POLICY[record.error].retryable,
            correlationId: record.correlationId,
          }
        : null,
  };
}

function toPublicTryOn(record: TryOnJobRecord): TryOnJob {
  return {
    id: record.id,
    state: record.state,
    styleId: record.styleId,
    createdAt: iso(record.createdAt),
    expiresAt: iso(record.expiresAt),
    error:
      record.state === "failed" && record.error
        ? {
            code: record.error,
            message: ERROR_MESSAGES[record.error],
            retryable: ERROR_POLICY[record.error].retryable,
            correlationId: record.correlationId,
          }
        : null,
  };
}

export function createProxy(deps: ProxyDeps): Proxy {
  const { config, logger } = deps;
  const now = deps.now ?? Date.now;
  // Deleting or expiring an analysis job also deletes try-on results made from it.
  let tryOnCascade: ((analysisJobId: string) => void) | undefined;
  const store = createJobStore(now, { onRemove: (id) => tryOnCascade?.(id) });
  const advisor = createAdvisor({ ai: deps.ai ?? null, logger, now, cacheTtlMs: config.jobTtlMs });
  const jobs = createAnalysisJobs({
    store,
    provider: deps.provider,
    advisor,
    logger,
    now,
    jobTtlMs: config.jobTtlMs,
    terminalRetentionMs: config.terminalRetentionMs,
    providerTimeoutMs: config.providerTimeoutMs,
  });
  const tryOns = deps.tryOnProvider
    ? createTryOnJobs({
        provider: deps.tryOnProvider,
        logger,
        now,
        jobTtlMs: config.jobTtlMs,
        terminalRetentionMs: config.terminalRetentionMs,
        providerTimeoutMs: config.providerTimeoutMs,
      })
    : null;
  tryOnCascade = (id) => tryOns?.removeForAnalysis(id);
  const limiter = createRateLimiter({ limit: config.rateLimitPerMinute, windowMs: 60_000, now });
  const idempotency = new Map<string, string>();
  /** Keys cancelled before their upload finished; the job is cancelled as soon as it exists. */
  const tombstones = new Map<string, number>();
  const TOMBSTONE_MS = 60_000;

  function idempotencyKey(request: IncomingMessage): string | null {
    const header = request.headers["idempotency-key"];
    const key = Array.isArray(header) ? header[0] : header;
    return key && IDEMPOTENCY_KEY.test(key) ? `${request.socket.remoteAddress ?? "unknown"}|${key}` : null;
  }
  const allowedOrigins = new Set(config.allowedOrigins);

  function send(response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
    const payload = JSON.stringify(body);
    response.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": Buffer.byteLength(payload),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    });
    response.end(payload);
  }

  function sendError(response: ServerResponse, error: HttpError, corsHeaders: Record<string, string>) {
    send(
      response,
      error.status,
      {
        error: {
          code: error.code,
          message: ERROR_MESSAGES[error.code],
          retryable: ERROR_POLICY[error.code].retryable,
          correlationId: newCorrelationId(),
        },
      },
      { ...corsHeaders, ...error.headers },
    );
  }

  function lookup(rawId: string): AnalysisJobRecord {
    if (!ANALYSIS_JOB_ID_PATTERN.test(rawId)) throw new HttpError("JOB_NOT_FOUND");
    const record = store.get(rawId);
    if (!record) throw new HttpError("JOB_NOT_FOUND");
    return record;
  }

  async function createJob(request: IncomingMessage): Promise<AnalysisJobRecord> {
    const key = idempotencyKey(request);
    const existing = key ? store.get(idempotency.get(key) ?? "") : undefined;
    if (key && existing) {
      // A retried request: never create a second job or a second provider call.
      request.resume();
      return existing;
    }

    const decision = limiter.take(request.socket.remoteAddress ?? "unknown");
    if (!decision.allowed) {
      request.resume();
      throw new HttpError("RATE_LIMITED", { headers: { "Retry-After": String(decision.retryAfterSeconds) } });
    }
    if (store.size() >= config.maxLiveJobs) {
      request.resume();
      throw new HttpError("PROCESSING_UNAVAILABLE");
    }

    const contentType = request.headers["content-type"] ?? "";
    if (!contentType.startsWith("multipart/form-data")) {
      request.resume();
      throw new HttpError("IMAGE_INVALID");
    }

    let form: FormData;
    try {
      form = await parseMultipart(await readBody(request, MAX_BODY_BYTES), contentType);
    } catch (error) {
      throw new HttpError(error instanceof BodyTooLargeError ? "IMAGE_TOO_LARGE" : "IMAGE_INVALID");
    }

    if (form.get(ANALYSIS_REQUEST_FIELDS.consentVersion) !== CURRENT_CONSENT_VERSION) {
      throw new HttpError("CONSENT_REQUIRED");
    }

    const rawJob = form.get(ANALYSIS_REQUEST_FIELDS.jobDescription);
    const job = typeof rawJob === "string" ? checkJobDescription(rawJob) : null;
    if (!job?.ok) throw new HttpError("JOB_DESCRIPTION_INVALID");

    const file = form.get(ANALYSIS_REQUEST_FIELDS.image);
    if (!(file instanceof Blob)) throw new HttpError("IMAGE_INVALID");
    if (file.size > IMAGE_MAX_BYTES) throw new HttpError("IMAGE_TOO_LARGE");
    const image = new Uint8Array(await file.arrayBuffer());
    const inspection = inspectImage(image);
    if (!inspection.ok) throw new HttpError(inspection.code);
    const clean = stripImageMetadata(image, inspection.info.mimeType);
    image.fill(0);
    if (!clean) throw new HttpError("IMAGE_INVALID");
    if (store.retainedBytes() + (tryOns?.retainedBytes() ?? 0) + clean.length > config.maxRetainedBytes) {
      clean.fill(0);
      throw new HttpError("PROCESSING_UNAVAILABLE");
    }

    const requestedLocale = form.get(ANALYSIS_REQUEST_FIELDS.locale);
    const locale = isLocale(requestedLocale) ? requestedLocale : "en";
    const record = jobs.create({ jobDescription: job.text, image: clean, imageInfo: inspection.info, locale });
    if (key) idempotency.set(key, record.id);
    if (key && tombstones.has(key)) {
      // The client already cancelled this upload: stop before any provider call.
      tombstones.delete(key);
      jobs.cancel(record.id);
    }
    return record;
  }

  /** Job and company-atmosphere analysis from text only; no image, no consent needed (R1.4, R1.5). */
  async function analyzeJob(request: IncomingMessage, response: ServerResponse): Promise<JobAnalysis> {
    const decision = limiter.take(request.socket.remoteAddress ?? "unknown");
    if (!decision.allowed) {
      request.resume();
      throw new HttpError("RATE_LIMITED", { headers: { "Retry-After": String(decision.retryAfterSeconds) } });
    }
    if (!(request.headers["content-type"] ?? "").startsWith("application/json")) {
      request.resume();
      throw new HttpError("REQUEST_INVALID");
    }
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder().decode(await readBody(request, MAX_JOB_ANALYSIS_BODY_BYTES)));
    } catch (error) {
      throw new HttpError(error instanceof BodyTooLargeError ? "JOB_DESCRIPTION_INVALID" : "REQUEST_INVALID");
    }
    const fields = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
    const rawJob = fields[JOB_ANALYSIS_REQUEST_FIELDS.jobDescription];
    const job = typeof rawJob === "string" ? checkJobDescription(rawJob) : null;
    if (!job?.ok) throw new HttpError("JOB_DESCRIPTION_INVALID");
    const requestedLocale = fields[JOB_ANALYSIS_REQUEST_FIELDS.locale];
    const locale = isLocale(requestedLocale) ? requestedLocale : "en";

    // Stop AI work when the desktop goes away (for example, the user edits the posting).
    const controller = new AbortController();
    const onClose = () => {
      if (!response.writableFinished) controller.abort(new Error("client closed"));
    };
    response.once("close", onClose);
    try {
      const jobContext = await withDeadline((signal) => advisor.analyzeJob(job.text, locale, signal), controller, config.providerTimeoutMs);
      return { generatedAt: iso(now()), locale, jobContext };
    } catch (error) {
      throw new HttpError(toErrorCode(error));
    } finally {
      response.off("close", onClose);
    }
  }

  function lookupTryOn(rawId: string): TryOnJobRecord {
    const record = TRY_ON_JOB_ID_PATTERN.test(rawId) ? tryOns?.get(rawId) : undefined;
    if (!record) throw new HttpError("JOB_NOT_FOUND");
    return record;
  }

  async function createTryOn(request: IncomingMessage): Promise<TryOnJobRecord> {
    const decision = limiter.take(request.socket.remoteAddress ?? "unknown");
    if (!decision.allowed) {
      request.resume();
      throw new HttpError("RATE_LIMITED", { headers: { "Retry-After": String(decision.retryAfterSeconds) } });
    }
    if (!(request.headers["content-type"] ?? "").startsWith("application/json")) {
      request.resume();
      throw new HttpError("REQUEST_INVALID");
    }
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder().decode(await readBody(request, MAX_JSON_BODY_BYTES)));
    } catch {
      throw new HttpError("REQUEST_INVALID");
    }
    const fields = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
    if (typeof fields.styleId !== "string" || !TRY_ON_STYLE_IDS.includes(fields.styleId)) throw new HttpError("REQUEST_INVALID");
    if (typeof fields.analysisJobId !== "string") throw new HttpError("JOB_NOT_FOUND");
    const analysis = lookup(fields.analysisJobId);
    // Only a successful, still-retained, consented analysis image can be used (R6.1).
    if (analysis.state !== "succeeded" || !analysis.image || !analysis.imageInfo) throw new HttpError("JOB_NOT_FOUND");
    if (!tryOns) throw new HttpError("PROCESSING_UNAVAILABLE");
    return tryOns.create(analysis, fields.styleId as TryOnStyleId);
  }

  function sendImage(response: ServerResponse, bytes: Uint8Array, mimeType: string, headers: Record<string, string>) {
    response.writeHead(200, {
      "Content-Type": mimeType,
      "Content-Length": bytes.length,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
      ...headers,
    });
    response.end(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  }

  async function route(request: IncomingMessage, response: ServerResponse, cors: Record<string, string>) {
    const path = new URL(request.url ?? "/", "http://proxy.local").pathname;
    const method = request.method ?? "GET";

    if (path === ROUTES.jobAnalyses) {
      if (method !== "POST") {
        request.resume();
        throw new HttpError("JOB_NOT_FOUND", { status: 405, headers: { Allow: "POST, OPTIONS" } });
      }
      const analysis = await analyzeJob(request, response);
      if (!response.destroyed) send(response, 200, analysis, cors);
      return "/v1/job-analyses";
    }

    if (path === ROUTES.collection) {
      if (method === "DELETE") {
        // Cancel by Idempotency-Key, for a client that cancelled before it learned the job ID.
        // Never creates anything and reveals nothing: always 204.
        request.resume();
        const key = idempotencyKey(request);
        if (key) {
          const existing = store.get(idempotency.get(key) ?? "");
          if (existing) {
            jobs.cancel(existing.id);
            tryOns?.removeForAnalysis(existing.id);
          } else {
            tombstones.set(key, now() + TOMBSTONE_MS);
          }
        }
        response.writeHead(204, { ...cors, "Cache-Control": "no-store" });
        response.end();
        return "/v1/analysis-jobs";
      }
      if (method !== "POST") {
        request.resume();
        throw new HttpError("JOB_NOT_FOUND", { status: 405, headers: { Allow: "POST, DELETE, OPTIONS" } });
      }
      const record = await createJob(request);
      // If the client is gone before it learns the job ID (cancel during upload),
      // nobody can delete the job, so cancel it here (R4.4). HTTP/1.1 clients do
      // not half-close, so a received FIN also means the client went away.
      // Clients that cancel later use DELETE with their Idempotency-Key.
      const socket = request.socket;
      if (socket.destroyed || socket.readableEnded || response.destroyed) {
        jobs.cancel(record.id);
        return "/v1/analysis-jobs";
      }
      response.once("close", () => {
        if (!response.writableFinished) jobs.cancel(record.id);
      });
      send(response, 202, toPublicJob(record), cors);
      return "/v1/analysis-jobs";
    }

    const item = ROUTES.item.exec(path);
    if (item) {
      request.resume();
      const id = item[1];
      if (method === "GET") {
        send(response, 200, toPublicJob(lookup(id)), cors);
      } else if (method === "DELETE") {
        const record = jobs.cancel(lookup(id).id as AnalysisJobId);
        if (!record) throw new HttpError("JOB_NOT_FOUND");
        tryOns?.removeForAnalysis(record.id);
        send(response, 200, toPublicJob(record), cors);
      } else {
        throw new HttpError("JOB_NOT_FOUND", { status: 405, headers: { Allow: "GET, DELETE, OPTIONS" } });
      }
      return "/v1/analysis-jobs/:id";
    }

    if (path === ROUTES.tryOnCollection) {
      if (method !== "POST") {
        request.resume();
        throw new HttpError("JOB_NOT_FOUND", { status: 405, headers: { Allow: "POST, OPTIONS" } });
      }
      send(response, 202, toPublicTryOn(await createTryOn(request)), cors);
      return "/v1/try-on-jobs";
    }

    const tryOnResult = ROUTES.tryOnResult.exec(path);
    if (tryOnResult) {
      request.resume();
      if (method !== "GET") throw new HttpError("JOB_NOT_FOUND", { status: 405, headers: { Allow: "GET, OPTIONS" } });
      const record = lookupTryOn(tryOnResult[1]);
      if (record.state !== "succeeded" || !record.result) throw new HttpError("JOB_NOT_FOUND");
      sendImage(response, record.result.bytes, record.result.mimeType, cors);
      return "/v1/try-on-jobs/:id/result";
    }

    const tryOnItem = ROUTES.tryOnItem.exec(path);
    if (tryOnItem) {
      request.resume();
      if (method === "GET") {
        send(response, 200, toPublicTryOn(lookupTryOn(tryOnItem[1])), cors);
      } else if (method === "DELETE") {
        const record = tryOns?.cancel(lookupTryOn(tryOnItem[1]).id);
        if (!record) throw new HttpError("JOB_NOT_FOUND");
        send(response, 200, toPublicTryOn(record), cors);
      } else {
        throw new HttpError("JOB_NOT_FOUND", { status: 405, headers: { Allow: "GET, DELETE, OPTIONS" } });
      }
      return "/v1/try-on-jobs/:id";
    }

    request.resume();
    throw new HttpError("JOB_NOT_FOUND");
  }

  const server = createServer(async (request, response) => {
    const started = now();
    const origin = request.headers.origin;
    const originAllowed = origin !== undefined && allowedOrigins.has(origin);
    const cors: Record<string, string> = originAllowed ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {};
    let routeLabel = "unmatched";

    try {
      if (origin !== undefined && !originAllowed) {
        request.resume();
        throw new HttpError("JOB_NOT_FOUND", { status: 403 });
      }
      if (request.method === "OPTIONS") {
        request.resume();
        response.writeHead(204, {
          ...cors,
          "Access-Control-Allow-Methods": "GET, POST, DELETE",
          "Access-Control-Allow-Headers": "Content-Type, Idempotency-Key",
          "Access-Control-Max-Age": "600",
        });
        response.end();
        routeLabel = "preflight";
      } else {
        routeLabel = await route(request, response, cors);
      }
    } catch (error) {
      const httpError = error instanceof HttpError ? error : new HttpError("INTERNAL_ERROR");
      if (!(error instanceof HttpError)) {
        logger.log({ level: "error", event: "unhandled_error", errorName: error instanceof Error ? error.name : "unknown" });
      }
      if (!response.headersSent) sendError(response, httpError, cors);
    } finally {
      logger.log({
        level: "info",
        event: "http_request",
        method: request.method ?? "UNKNOWN",
        route: routeLabel,
        status: response.statusCode,
        durationMs: now() - started,
      });
    }
  });

  // Slow or stalled uploads cannot hold connections open for Node's 300-second default.
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;

  const sweeper =
    config.sweepIntervalMs > 0
      ? setInterval(() => {
          store.sweep();
          tryOns?.sweep();
          limiter.prune();
          for (const [key, id] of idempotency) if (!store.peek(id)) idempotency.delete(key);
          for (const [key, expiresAt] of tombstones) if (expiresAt <= now()) tombstones.delete(key);
        }, config.sweepIntervalMs)
      : undefined;
  sweeper?.unref();

  return {
    server,
    store,
    shutdown() {
      if (sweeper) clearInterval(sweeper);
      tryOns?.clear();
      store.clear();
    },
  };
}
