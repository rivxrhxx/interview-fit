import { JOB_DESCRIPTION_MAX_LENGTH } from "./limits.ts";

// C0 control characters except tab (\u0009) and line feed (\u000A), plus DEL and C1 controls.
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;

/** Shared by the desktop and the backend so both measure the same text (R1.2). */
export function normalizeJobDescription(raw: string): string {
  return raw.normalize("NFC").replace(/\r\n?/g, "\n").replace(CONTROL_CHARACTERS, "").trim();
}

export type JobDescriptionCheck =
  | { ok: true; text: string }
  | { ok: false; reason: "empty" }
  | { ok: false; reason: "too-long"; length: number; maxLength: number };

export function checkJobDescription(raw: string): JobDescriptionCheck {
  const text = normalizeJobDescription(raw);
  if (text.length === 0) return { ok: false, reason: "empty" };
  if (text.length > JOB_DESCRIPTION_MAX_LENGTH) {
    return { ok: false, reason: "too-long", length: text.length, maxLength: JOB_DESCRIPTION_MAX_LENGTH };
  }
  return { ok: true, text };
}
