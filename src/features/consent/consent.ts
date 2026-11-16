import { CURRENT_CONSENT_VERSION } from "../../lib/api/contracts";

/**
 * Version of the consent text in ConsentGate. Changing what is sent, why, or to
 * whom requires a new contract version, which invalidates any earlier agreement.
 */
export const CONSENT_VERSION = CURRENT_CONSENT_VERSION;

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
