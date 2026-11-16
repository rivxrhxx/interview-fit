/** Stable client-visible error codes. Vendor errors are never passed through. */
export const ERROR_CODES = [
  "CONSENT_REQUIRED",
  "JOB_DESCRIPTION_INVALID",
  "IMAGE_INVALID",
  "IMAGE_TOO_LARGE",
  "RATE_LIMITED",
  "PROCESSING_TIMEOUT",
  "PROCESSING_UNAVAILABLE",
  "JOB_NOT_FOUND",
  "INTERNAL_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** What the user can do next. Every failure maps to a controlled recoverable state (R8.3). */
export type Recovery =
  | "retry"
  | "retry-later"
  | "choose-another-image"
  | "review-consent"
  | "edit-job-description"
  | "start-over";

export interface ErrorPolicy {
  retryable: boolean;
  recovery: Recovery;
  httpStatus: number;
}

export const ERROR_POLICY: Record<ErrorCode, ErrorPolicy> = {
  CONSENT_REQUIRED: { retryable: false, recovery: "review-consent", httpStatus: 403 },
  JOB_DESCRIPTION_INVALID: { retryable: false, recovery: "edit-job-description", httpStatus: 422 },
  IMAGE_INVALID: { retryable: false, recovery: "choose-another-image", httpStatus: 422 },
  IMAGE_TOO_LARGE: { retryable: false, recovery: "choose-another-image", httpStatus: 413 },
  RATE_LIMITED: { retryable: true, recovery: "retry-later", httpStatus: 429 },
  PROCESSING_TIMEOUT: { retryable: true, recovery: "retry", httpStatus: 504 },
  PROCESSING_UNAVAILABLE: { retryable: true, recovery: "retry-later", httpStatus: 503 },
  JOB_NOT_FOUND: { retryable: false, recovery: "start-over", httpStatus: 404 },
  INTERNAL_ERROR: { retryable: true, recovery: "retry", httpStatus: 500 },
};

/** Neutral default copy. Clients display these by code rather than any server-provided text. */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  CONSENT_REQUIRED: "Review and agree to the consent step before analysis.",
  JOB_DESCRIPTION_INVALID: "Check the job description and try again.",
  IMAGE_INVALID: "Choose a JPEG or PNG image.",
  IMAGE_TOO_LARGE: "Choose an image up to 10 MB and 16 megapixels.",
  RATE_LIMITED: "Too many requests right now. Wait a moment and try again.",
  PROCESSING_TIMEOUT: "Analysis took too long and was stopped. You can try again.",
  PROCESSING_UNAVAILABLE: "Analysis is temporarily unavailable. Try again in a few minutes.",
  JOB_NOT_FOUND: "This analysis is no longer available. Start again with your photo.",
  INTERNAL_ERROR: "Something went wrong on our side. You can try again.",
};

export interface ApiError {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  /** Opaque Interview Fit request ID for support. Never a provider identifier. */
  correlationId: string;
}

export interface ApiErrorBody {
  error: ApiError;
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value);
}
