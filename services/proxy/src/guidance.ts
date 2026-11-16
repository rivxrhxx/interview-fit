import { createHash } from "node:crypto";
import type { JobContext, Locale, Observation, Recommendation } from "../../../packages/contracts/src/index.ts";
import { analyzeJobRules, checkJobContext } from "./guidance/jobAnalysis.ts";
import { filterRecommendations, suggestRules } from "./guidance/engine.ts";
import type { Logger } from "./logger.ts";

export interface SuggestionInput {
  jobDescription: string;
  jobContext: JobContext;
  observations: Observation[];
  locale: Locale;
}

/**
 * A model-backed writer (Claude). It receives job text and neutral observation
 * text only, never image bytes or provider scores. Its output is untrusted: the
 * advisor checks it with the same evidence and content rules as the rules engine.
 */
export interface AiWriter {
  analyzeJob(jobDescription: string, locale: Locale, signal: AbortSignal): Promise<JobContext>;
  suggest(input: SuggestionInput, signal: AbortSignal): Promise<Recommendation[]>;
}

/** Job analysis and suggestions with policy checks and a deterministic fallback (R1.6, R5.6). */
export interface Advisor {
  analyzeJob(jobDescription: string, locale: Locale, signal: AbortSignal): Promise<JobContext>;
  suggest(input: SuggestionInput, signal: AbortSignal): Promise<Recommendation[]>;
}

export interface AdvisorOptions {
  ai?: AiWriter | null;
  logger: Logger;
  now: () => number;
  /** Job analyses are reused by the photo analysis for this long. */
  cacheTtlMs: number;
  maxCacheEntries?: number;
}

/** Stable, non-reversible cache key; the job text itself is not kept as a key. */
function cacheKey(jobDescription: string, locale: Locale): string {
  return createHash("sha256").update(locale).update("\u0000").update(jobDescription).digest("hex");
}

function failureKind(error: unknown): string {
  return error instanceof Error ? error.name : "unknown";
}

export function createAdvisor(options: AdvisorOptions): Advisor {
  const { ai, logger, now } = options;
  const maxEntries = options.maxCacheEntries ?? 200;
  const cache = new Map<string, { expiresAt: number; value: Promise<JobContext> }>();

  async function analyzeUncached(jobDescription: string, locale: Locale, signal: AbortSignal): Promise<JobContext> {
    if (ai) {
      try {
        const raw = await ai.analyzeJob(jobDescription, locale, signal);
        return checkJobContext({ ...raw, source: "ai" }, jobDescription, locale);
      } catch (error) {
        if (signal.aborted) throw signal.reason;
        logger.log({ level: "warn", event: "ai_fallback", operation: "job_analysis", reason: failureKind(error) });
      }
    }
    return analyzeJobRules(jobDescription, locale);
  }

  function prune() {
    const current = now();
    for (const [key, entry] of cache) if (entry.expiresAt <= current) cache.delete(key);
    while (cache.size >= maxEntries) cache.delete(cache.keys().next().value as string);
  }

  return {
    analyzeJob(jobDescription, locale, signal) {
      const key = cacheKey(jobDescription, locale);
      const hit = cache.get(key);
      if (hit && hit.expiresAt > now()) return hit.value;
      prune();
      const value = analyzeUncached(jobDescription, locale, signal);
      cache.set(key, { expiresAt: now() + options.cacheTtlMs, value });
      // A cancelled or failed analysis is never reused.
      value.catch(() => cache.delete(key));
      return value;
    },

    async suggest(input, signal) {
      const rules = () => filterRecommendations(suggestRules(input.jobContext, input.observations, input.locale), input.jobContext, input.observations);
      if (!ai) return rules();
      try {
        const kept = filterRecommendations(await ai.suggest(input, signal), input.jobContext, input.observations);
        if (kept.length > 0) return kept;
        logger.log({ level: "warn", event: "ai_fallback", operation: "suggestions", reason: "nothing_usable" });
      } catch (error) {
        if (signal.aborted) throw signal.reason;
        logger.log({ level: "warn", event: "ai_fallback", operation: "suggestions", reason: failureKind(error) });
      }
      return rules();
    },
  };
}
