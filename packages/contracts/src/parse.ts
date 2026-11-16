import { ERROR_MESSAGES, ERROR_POLICY, isErrorCode, type ApiError, type ApiErrorBody } from "./errors.ts";
import {
  ANALYSIS_JOB_ID_PATTERN,
  JOB_STATES,
  OBSERVATION_CATEGORIES,
  TRY_ON_JOB_ID_PATTERN,
  TRY_ON_STYLES,
  type AnalysisJob,
  type AnalysisJobId,
  type AnalysisResult,
  type JobCue,
  type JobState,
  type Observation,
  type Recommendation,
  type TryOnJob,
  type TryOnJobId,
  type TryOnStyleId,
} from "./jobs.ts";

/**
 * Runtime validation for untrusted JSON crossing the backend boundary. Parsers
 * build new objects from known fields only, so unexpected fields (for example a
 * leaked provider ID or URL) never reach application state (R4.2).
 */
export class ContractError extends Error {
  readonly path: string;

  constructor(path: string, reason: string) {
    super(`${path}: ${reason}`);
    this.name = "ContractError";
    this.path = path;
  }
}

const MAX_SHORT_TEXT = 200;
const MAX_TEXT = 1_000;
const MAX_ITEMS = 25;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const LOCAL_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const CORRELATION_ID = /^req_[A-Za-z0-9]{8,40}$/;

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new ContractError(path, "expected object");
  return value as Record<string, unknown>;
}

function string(value: unknown, path: string, maxLength = MAX_SHORT_TEXT): string {
  if (typeof value !== "string") throw new ContractError(path, "expected string");
  if (value.length === 0 || value.length > maxLength) throw new ContractError(path, "string length out of range");
  return value;
}

function matching(value: unknown, pattern: RegExp, path: string): string {
  const text = string(value, path);
  if (!pattern.test(text)) throw new ContractError(path, "unexpected format");
  return text;
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new ContractError(path, "expected boolean");
  return value;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new ContractError(path, "unexpected value");
  }
  return value as T;
}

function list<T>(value: unknown, path: string, item: (entry: unknown, path: string) => T): T[] {
  if (!Array.isArray(value)) throw new ContractError(path, "expected array");
  if (value.length > MAX_ITEMS) throw new ContractError(path, "too many items");
  return value.map((entry, index) => item(entry, `${path}[${index}]`));
}

const timestamp = (value: unknown, path: string) => matching(value, ISO_TIMESTAMP, path);
const localId = (value: unknown, path: string) => matching(value, LOCAL_ID, path);

/** Normalizes an error to contract copy; server-provided text is discarded. */
export function parseApiError(value: unknown, path = "$.error"): ApiError {
  const source = record(value, path);
  if (!isErrorCode(source.code)) throw new ContractError(`${path}.code`, "unknown error code");
  boolean(source.retryable, `${path}.retryable`);
  return {
    code: source.code,
    message: ERROR_MESSAGES[source.code],
    retryable: ERROR_POLICY[source.code].retryable,
    correlationId: matching(source.correlationId, CORRELATION_ID, `${path}.correlationId`),
  };
}

export function parseApiErrorBody(value: unknown): ApiErrorBody {
  return { error: parseApiError(record(value, "$").error, "$.error") };
}

function parseCue(value: unknown, path: string): JobCue {
  const source = record(value, path);
  return {
    id: localId(source.id, `${path}.id`),
    label: string(source.label, `${path}.label`),
    evidence: string(source.evidence, `${path}.evidence`, MAX_TEXT),
  };
}

function parseObservation(value: unknown, path: string): Observation {
  const source = record(value, path);
  return {
    id: localId(source.id, `${path}.id`),
    category: oneOf(source.category, OBSERVATION_CATEGORIES, `${path}.category`),
    text: string(source.text, `${path}.text`, MAX_TEXT),
  };
}

function parseRecommendation(value: unknown, path: string): Recommendation {
  const source = record(value, path);
  return {
    id: localId(source.id, `${path}.id`),
    category: oneOf(source.category, OBSERVATION_CATEGORIES, `${path}.category`),
    observationId: source.observationId === null ? null : localId(source.observationId, `${path}.observationId`),
    adjustment: string(source.adjustment, `${path}.adjustment`, MAX_TEXT),
    rationale: string(source.rationale, `${path}.rationale`, MAX_TEXT),
    cueIds: list(source.cueIds, `${path}.cueIds`, localId),
  };
}

/** Validates a provider-normalized observation list; IDs must be unique. */
export function parseObservations(value: unknown, path = "$.observations"): Observation[] {
  const observations = list(value, path, parseObservation);
  if (new Set(observations.map((observation) => observation.id)).size !== observations.length) {
    throw new ContractError(path, "duplicate observation id");
  }
  return observations;
}

export function parseAnalysisResult(value: unknown, path = "$.result"): AnalysisResult {
  const source = record(value, path);
  const context = record(source.jobContext, `${path}.jobContext`);
  const result: AnalysisResult = {
    generatedAt: timestamp(source.generatedAt, `${path}.generatedAt`),
    jobContext: {
      summary: string(context.summary, `${path}.jobContext.summary`, MAX_TEXT),
      cues: list(context.cues, `${path}.jobContext.cues`, parseCue),
    },
    observations: list(source.observations, `${path}.observations`, parseObservation),
    recommendations: list(source.recommendations, `${path}.recommendations`, parseRecommendation),
  };

  const cueIds = new Set(result.jobContext.cues.map((cue) => cue.id));
  const observationIds = new Set(result.observations.map((observation) => observation.id));
  result.recommendations.forEach((recommendation, index) => {
    const where = `${path}.recommendations[${index}]`;
    if (recommendation.observationId !== null && !observationIds.has(recommendation.observationId)) {
      throw new ContractError(`${where}.observationId`, "references an unknown observation");
    }
    if (!recommendation.cueIds.every((id) => cueIds.has(id))) {
      throw new ContractError(`${where}.cueIds`, "references an unknown cue");
    }
  });
  return result;
}

function checkStateConsistency(state: JobState, hasResult: boolean, hasError: boolean, path: string) {
  if ((state === "failed") !== hasError) throw new ContractError(`${path}.error`, "error must be present only when failed");
  if (hasResult && state !== "succeeded") throw new ContractError(`${path}.result`, "result present before success");
}

export function parseAnalysisJob(value: unknown): AnalysisJob {
  const source = record(value, "$");
  const state = oneOf(source.state, JOB_STATES, "$.state");
  const result = source.result == null ? null : parseAnalysisResult(source.result);
  const error = source.error == null ? null : parseApiError(source.error);
  checkStateConsistency(state, result !== null, error !== null, "$");
  if (state === "succeeded" && result === null) throw new ContractError("$.result", "missing result");
  return {
    id: matching(source.id, ANALYSIS_JOB_ID_PATTERN, "$.id") as AnalysisJobId,
    state,
    createdAt: timestamp(source.createdAt, "$.createdAt"),
    expiresAt: timestamp(source.expiresAt, "$.expiresAt"),
    result,
    error,
  };
}

const TRY_ON_STYLE_IDS: readonly TryOnStyleId[] = TRY_ON_STYLES.map((style) => style.id);

export function parseTryOnJob(value: unknown): TryOnJob {
  const source = record(value, "$");
  const state = oneOf(source.state, JOB_STATES, "$.state");
  const error = source.error == null ? null : parseApiError(source.error);
  checkStateConsistency(state, false, error !== null, "$");
  return {
    id: matching(source.id, TRY_ON_JOB_ID_PATTERN, "$.id") as TryOnJobId,
    state,
    styleId: oneOf(source.styleId, TRY_ON_STYLE_IDS, "$.styleId"),
    createdAt: timestamp(source.createdAt, "$.createdAt"),
    expiresAt: timestamp(source.expiresAt, "$.expiresAt"),
    error,
  };
}
