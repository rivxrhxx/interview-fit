import { checkJobDescription } from "../../lib/api/contracts";

declare const validatedBrand: unique symbol;

/**
 * A job description that passed validation. It is untrusted user-supplied data:
 * it is displayed as plain text and sent to the backend as a data field only.
 * Nothing in the desktop app interprets its content as instructions (R1.3).
 */
export interface JobDescription {
  readonly text: string;
  readonly length: number;
  readonly [validatedBrand]: true;
}

export type JobDescriptionError =
  | { code: "JOB_DESCRIPTION_EMPTY" }
  | { code: "JOB_DESCRIPTION_TOO_LONG"; maxLength: number; length: number };

export type JobDescriptionResult = { ok: true; value: JobDescription } | { ok: false; error: JobDescriptionError };

export { normalizeJobDescription } from "../../lib/api/contracts";

export function validateJobDescription(raw: string): JobDescriptionResult {
  const check = checkJobDescription(raw);
  if (check.ok) return { ok: true, value: { text: check.text, length: check.text.length } as JobDescription };
  if (check.reason === "empty") return { ok: false, error: { code: "JOB_DESCRIPTION_EMPTY" } };
  return { ok: false, error: { code: "JOB_DESCRIPTION_TOO_LONG", maxLength: check.maxLength, length: check.length } };
}

const numberFormat = new Intl.NumberFormat("en-US");

export function formatCount(value: number): string {
  return numberFormat.format(value);
}

export function jobDescriptionErrorMessage(error: JobDescriptionError): string {
  switch (error.code) {
    case "JOB_DESCRIPTION_EMPTY":
      return "Enter a job description to continue.";
    case "JOB_DESCRIPTION_TOO_LONG":
      return `Shorten the job description to ${formatCount(error.maxLength)} characters or fewer (currently ${formatCount(error.length)}).`;
  }
}
