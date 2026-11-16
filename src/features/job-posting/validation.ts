import { JOB_DESCRIPTION_MAX_LENGTH } from "../../lib/validation/limits";

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

// C0 control characters except tab (\u0009) and line feed (\u000A), plus DEL and C1 controls.
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;

export function normalizeJobDescription(raw: string): string {
  return raw.normalize("NFC").replace(/\r\n?/g, "\n").replace(CONTROL_CHARACTERS, "").trim();
}

export function validateJobDescription(raw: string): JobDescriptionResult {
  const text = normalizeJobDescription(raw);
  if (text.length === 0) return { ok: false, error: { code: "JOB_DESCRIPTION_EMPTY" } };
  if (text.length > JOB_DESCRIPTION_MAX_LENGTH) {
    return {
      ok: false,
      error: { code: "JOB_DESCRIPTION_TOO_LONG", maxLength: JOB_DESCRIPTION_MAX_LENGTH, length: text.length },
    };
  }
  return { ok: true, value: { text, length: text.length } as JobDescription };
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
