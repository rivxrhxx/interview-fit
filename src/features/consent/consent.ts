/**
 * Version of the consent text below. Changing what is sent, why, or to whom
 * requires a new version, which invalidates any earlier agreement.
 */
export const CONSENT_VERSION = "2026-11-16.v1";

/** In-memory record of an explicit agreement. Never persisted. */
export interface ConsentRecord {
  readonly version: string;
  readonly grantedAt: string;
}

export function createConsentRecord(now: Date = new Date()): ConsentRecord {
  return { version: CONSENT_VERSION, grantedAt: now.toISOString() };
}

export function isConsentCurrent(
  record: ConsentRecord | null | undefined,
  currentVersion: string = CONSENT_VERSION,
): record is ConsentRecord {
  return record != null && record.version === currentVersion;
}
