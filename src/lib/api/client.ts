import {
  API_ROUTES,
  ANALYSIS_REQUEST_FIELDS,
  ContractError,
  ERROR_MESSAGES,
  parseAnalysisJob,
  parseApiErrorBody,
  parseTryOnJob,
  type AnalysisJob,
  type AnalysisJobId,
  type ErrorCode,
  type TryOnJob,
  type TryOnJobId,
  type TryOnRequest,
} from "./contracts";
import { sniffImageType } from "../validation/image";

export class ApiRequestError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode) {
    // Contract copy only; server-provided text is never surfaced.
    super(ERROR_MESSAGES[code]);
    this.name = "ApiRequestError";
    this.code = code;
  }
}

export interface CreateAnalysisJobInput {
  consentVersion: string;
  jobDescription: string;
  /** Metadata-free JPEG produced by the native image adapter. */
  image: Blob;
}

/** Typed first-party backend boundary. React never calls `fetch` directly. */
export interface ApiClient {
  createAnalysisJob(input: CreateAnalysisJobInput, signal?: AbortSignal): Promise<AnalysisJob>;
  getAnalysisJob(id: AnalysisJobId, signal?: AbortSignal): Promise<AnalysisJob>;
  cancelAnalysisJob(id: AnalysisJobId): Promise<void>;
  createTryOnJob(input: TryOnRequest, signal?: AbortSignal): Promise<TryOnJob>;
  getTryOnJob(id: TryOnJobId, signal?: AbortSignal): Promise<TryOnJob>;
  /** Result image held in memory only; never written to storage implicitly (R6.3). */
  getTryOnResult(id: TryOnJobId, signal?: AbortSignal): Promise<Blob>;
  cancelTryOnJob(id: TryOnJobId): Promise<void>;
}

const REQUEST_DEFAULTS: RequestInit = {
  credentials: "omit",
  cache: "no-store",
  // Never follow a redirect to another host (R4.1).
  redirect: "error",
  referrerPolicy: "no-referrer",
};

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function createHttpApiClient(options: { baseUrl: string; fetch?: typeof fetch }): ApiClient {
  const fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init));

  async function request<T>(
    path: string,
    init: RequestInit,
    parse: (body: unknown) => T,
    networkRetries = 0,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(`${options.baseUrl}${path}`, { ...REQUEST_DEFAULTS, ...init });
    } catch (error) {
      if (isAbort(error)) throw error;
      // Only requests carrying an idempotency key are retried, so a retry never duplicates work.
      if (networkRetries > 0) return request(path, init, parse, networkRetries - 1);
      throw new ApiRequestError("PROCESSING_UNAVAILABLE");
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      if (isAbort(error)) throw error;
      throw new ApiRequestError("INTERNAL_ERROR");
    }

    if (!response.ok) {
      try {
        throw new ApiRequestError(parseApiErrorBody(body).error.code);
      } catch (error) {
        if (error instanceof ApiRequestError) throw error;
        throw new ApiRequestError("INTERNAL_ERROR");
      }
    }

    try {
      return parse(body);
    } catch (error) {
      if (error instanceof ContractError) throw new ApiRequestError("INTERNAL_ERROR");
      throw error;
    }
  }

  async function ignoreMissing(work: Promise<unknown>): Promise<void> {
    try {
      await work;
    } catch (error) {
      // Already expired or removed: nothing left to clean up.
      if (error instanceof ApiRequestError && error.code === "JOB_NOT_FOUND") return;
      throw error;
    }
  }

  return {
    createAnalysisJob(input, signal) {
      const form = new FormData();
      form.set(ANALYSIS_REQUEST_FIELDS.consentVersion, input.consentVersion);
      form.set(ANALYSIS_REQUEST_FIELDS.jobDescription, input.jobDescription);
      form.set(ANALYSIS_REQUEST_FIELDS.image, input.image, "photo.jpg");
      const headers = { "Idempotency-Key": crypto.randomUUID() };
      return request(API_ROUTES.analysisJobs, { method: "POST", body: form, headers, signal }, parseAnalysisJob, 1).catch(
        async (error: unknown) => {
          // Cancelled or lost before the job ID arrived: the backend may still have the
          // upload, so cancel it by key (never creates anything) before giving up (R4.4).
          const unknownOutcome =
            isAbort(error) || (error instanceof ApiRequestError && error.code === "PROCESSING_UNAVAILABLE");
          if (unknownOutcome) {
            await fetchImpl(`${options.baseUrl}${API_ROUTES.analysisJobs}`, {
              ...REQUEST_DEFAULTS,
              method: "DELETE",
              headers,
            }).catch(() => undefined);
          }
          throw error;
        },
      );
    },

    getAnalysisJob(id, signal) {
      return request(API_ROUTES.analysisJob(id), { method: "GET", signal }, parseAnalysisJob);
    },

    cancelAnalysisJob(id) {
      return ignoreMissing(request(API_ROUTES.analysisJob(id), { method: "DELETE" }, parseAnalysisJob));
    },

    createTryOnJob(input, signal) {
      return request(
        API_ROUTES.tryOnJobs,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ analysisJobId: input.analysisJobId, styleId: input.styleId }),
          signal,
        },
        parseTryOnJob,
      );
    },

    getTryOnJob(id, signal) {
      return request(API_ROUTES.tryOnJob(id), { method: "GET", signal }, parseTryOnJob);
    },

    async getTryOnResult(id, signal) {
      let response: Response;
      try {
        response = await fetchImpl(`${options.baseUrl}${API_ROUTES.tryOnResult(id)}`, {
          ...REQUEST_DEFAULTS,
          method: "GET",
          signal,
        });
      } catch (error) {
        if (isAbort(error)) throw error;
        throw new ApiRequestError("PROCESSING_UNAVAILABLE");
      }
      if (!response.ok) throw new ApiRequestError(response.status === 404 ? "JOB_NOT_FOUND" : "INTERNAL_ERROR");
      const declared = response.headers.get("content-type") ?? "";
      const bytes = new Uint8Array(await response.arrayBuffer());
      const actual = sniffImageType(bytes);
      // Only JPEG or PNG whose bytes match the declared type is rendered (no SVG or HTML).
      if (!actual || !declared.startsWith(actual)) throw new ApiRequestError("INTERNAL_ERROR");
      return new Blob([bytes], { type: actual });
    },

    cancelTryOnJob(id) {
      return ignoreMissing(request(API_ROUTES.tryOnJob(id), { method: "DELETE" }, parseTryOnJob));
    },
  };
}
