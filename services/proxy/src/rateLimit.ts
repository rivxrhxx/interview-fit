export type RateDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export interface RateLimiter {
  take(key: string): RateDecision;
  prune(): void;
}

/** Fixed-window limiter keyed by client address. */
export function createRateLimiter(options: { limit: number; windowMs: number; now: () => number }): RateLimiter {
  const windows = new Map<string, { count: number; resetAt: number }>();
  return {
    take(key) {
      const now = options.now();
      const current = windows.get(key);
      if (!current || current.resetAt <= now) {
        windows.set(key, { count: 1, resetAt: now + options.windowMs });
        return { allowed: true };
      }
      if (current.count < options.limit) {
        current.count += 1;
        return { allowed: true };
      }
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
    },
    prune() {
      const now = options.now();
      for (const [key, window] of windows) if (window.resetAt <= now) windows.delete(key);
    },
  };
}
