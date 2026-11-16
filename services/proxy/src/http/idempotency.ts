import type { IncomingMessage } from "node:http";

/** Client-generated retry key; a repeat within the job's lifetime returns the same job. */
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{16,128}$/;

/** How long a cancel for a not-yet-created job is remembered. */
const TOMBSTONE_MS = 60_000;

/** Upper bound on remembered cancels, so random keys cannot grow memory; the oldest go first. */
export const MAX_TOMBSTONES = 1_024;

/** The request's Idempotency-Key, scoped to the peer address, or null when missing or malformed. */
export function requestKey(request: IncomingMessage): string | null {
  const header = request.headers["idempotency-key"];
  const key = Array.isArray(header) ? header[0] : header;
  return key && IDEMPOTENCY_KEY.test(key) ? `${request.socket.remoteAddress ?? "unknown"}|${key}` : null;
}

/**
 * Maps idempotency keys to the job they created, and remembers keys cancelled
 * before their job existed, so a client that cancelled before it learned the job
 * ID can still stop it (R4.4, R4.5).
 */
export interface IdempotencyRegistry {
  /** The job ID created for this key, if any. */
  lookup(key: string): string | undefined;
  remember(key: string, id: string): void;
  /** Records a cancel for a key whose job does not exist yet. */
  tombstone(key: string): void;
  /** True, once, when the key was cancelled before its job was created. */
  takeTombstone(key: string): boolean;
  /** Forgets keys whose job is gone and tombstones that have expired. */
  prune(isLive: (id: string) => boolean): void;
}

export function createIdempotencyRegistry(now: () => number): IdempotencyRegistry {
  const ids = new Map<string, string>();
  const tombstones = new Map<string, number>();

  return {
    lookup: (key) => ids.get(key),
    remember(key, id) {
      ids.set(key, id);
    },
    tombstone(key) {
      tombstones.delete(key);
      while (tombstones.size >= MAX_TOMBSTONES) tombstones.delete(tombstones.keys().next().value!);
      tombstones.set(key, now() + TOMBSTONE_MS);
    },
    takeTombstone(key) {
      const expiresAt = tombstones.get(key);
      tombstones.delete(key);
      return expiresAt !== undefined && expiresAt > now();
    },
    prune(isLive) {
      for (const [key, id] of ids) if (!isLive(id)) ids.delete(key);
      for (const [key, expiresAt] of tombstones) if (expiresAt <= now()) tombstones.delete(key);
    },
  };
}
