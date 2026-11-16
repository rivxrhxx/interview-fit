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
