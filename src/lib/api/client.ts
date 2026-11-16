import {
  API_ROUTES,
  ANALYSIS_REQUEST_FIELDS,
  ContractError,
  ERROR_MESSAGES,
  parseAnalysisJob,
  parseApiErrorBody,
  type AnalysisJob,
  type AnalysisJobId,
  type ErrorCode,
} from "./contracts";

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

  async function request<T>(path: string, init: RequestInit, parse: (body: unknown) => T): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(`${options.baseUrl}${path}`, { ...REQUEST_DEFAULTS, ...init });
    } catch (error) {
      if (isAbort(error)) throw error;
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

  return {
    createAnalysisJob(input, signal) {
      const form = new FormData();
      form.set(ANALYSIS_REQUEST_FIELDS.consentVersion, input.consentVersion);
      form.set(ANALYSIS_REQUEST_FIELDS.jobDescription, input.jobDescription);
      form.set(ANALYSIS_REQUEST_FIELDS.image, input.image, "photo.jpg");
      return request(API_ROUTES.analysisJobs, { method: "POST", body: form, signal }, parseAnalysisJob);
    },

    getAnalysisJob(id, signal) {
      return request(API_ROUTES.analysisJob(id), { method: "GET", signal }, parseAnalysisJob);
    },

    async cancelAnalysisJob(id) {
      try {
        await request(API_ROUTES.analysisJob(id), { method: "DELETE" }, parseAnalysisJob);
      } catch (error) {
        // Already expired or removed: nothing left to clean up.
        if (error instanceof ApiRequestError && error.code === "JOB_NOT_FOUND") return;
        throw error;
      }
    },
  };
}
