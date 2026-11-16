import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
// Largest multiple of 62 below 256, so rejection sampling keeps characters uniform.
const LIMIT = 248;

/** Cryptographically random base62 token. Job IDs double as unguessable capability tokens. */
export function randomToken(length: number): string {
  let out = "";
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte < LIMIT) out += ALPHABET[byte % 62];
      if (out.length === length) break;
    }
  }
  return out;
}

export const newAnalysisJobId = () => `an_${randomToken(24)}`;
export const newTryOnJobId = () => `to_${randomToken(24)}`;
export const newCorrelationId = () => `req_${randomToken(16)}`;
