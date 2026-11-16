import { createHash } from "node:crypto";
import type { JobContext, Locale, Observation, ObservationCategory, Recommendation } from "../../../packages/contracts/src/index.ts";
import { buildJobContext, findJobFacts, mergeFacts, type JobFacts } from "./guidance/jobAnalysis.ts";
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
 * text only, never image bytes or provider scores. Its output is untrusted: job
 * findings must name catalog entries with verbatim quotes and only fill gaps the
 * rules left, and suggestions pass the same checks as the rules engine.
 */
export interface AiWriter {
  analyzeJob(jobDescription: string, locale: Locale, signal: AbortSignal): Promise<Partial<JobFacts>>;
  suggest(input: SuggestionInput, signal: AbortSignal): Promise<Recommendation[]>;
}

/** Job analysis and suggestions with policy checks and a deterministic fallback (R1.6, R5.6). */
export interface Advisor {
  /** Never fails because of the AI provider; only the caller's own cancellation rejects. */
  analyzeJob(jobDescription: string, locale: Locale, signal: AbortSignal): Promise<JobContext>;
  /** `budgetMs` caps the AI call; when it runs out, the rules answer instead. */
  suggest(input: SuggestionInput, signal: AbortSignal, budgetMs?: number): Promise<Recommendation[]>;
  /** True when an analysis for this text and language is cached or in progress (no new AI work needed). */
  hasCached(jobDescription: string, locale: Locale): boolean;
}

export interface AdvisorOptions {
  ai?: AiWriter | null;
  logger: Logger;
  now: () => number;
  /** Job analyses are reused by the photo analysis for this long. */
  cacheTtlMs: number;
  maxCacheEntries?: number;
  /** Time budget for one AI job analysis. */
  analysisBudgetMs?: number;
  /** Upper bound for one AI suggestion call. */
  suggestionBudgetMs?: number;
}

/**
 * Categories whose wording always comes from fixed, reviewed templates: skin-prep
 * tips must never name a condition and hair tips must never assume a gender, so
 * AI wording is not used for them (R5.3, R5.4, R6.4).
 */
const TEMPLATE_ONLY: ReadonlySet<ObservationCategory> = new Set(["skin-prep", "hair"]);

/** Stable, non-reversible cache key; the job text itself is not kept as a key. */
function cacheKey(jobDescription: string, locale: Locale): string {
  return createHash("sha256").update(locale).update("\u0000").update(jobDescription).digest("hex");
}

/** A coarse reason for logs; never a provider message or any job text. */
function failureKind(error: unknown): string {
  if (error && typeof error === "object" && "kind" in error && typeof error.kind === "string") return error.kind;
  if (error instanceof DOMException && error.name === "TimeoutError") return "timeout";
  return error instanceof Error ? error.name : "unknown";
}

/** Resolves with `work` unless the caller's own signal aborts first; the shared work keeps running. */
function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

interface CacheEntry {
  expiresAt: number;
  settled: boolean;
  value: Promise<JobContext>;
}

export function createAdvisor(options: AdvisorOptions): Advisor {
  const { ai, logger, now } = options;
  const maxEntries = options.maxCacheEntries ?? 200;
  const analysisBudgetMs = options.analysisBudgetMs ?? 20_000;
  const suggestionBudgetMs = options.suggestionBudgetMs ?? 15_000;
  const cache = new Map<string, CacheEntry>();

  /**
   * Runs under its own time budget, independent of any one caller, and never
   * rejects: every AI failure or timeout falls back to the rules (R1.6).
   */
  async function analyzeShared(jobDescription: string, locale: Locale): Promise<JobContext> {
    const rules = findJobFacts(jobDescription);
    if (!ai) return buildJobContext(rules, jobDescription, locale, "rules");
    try {
      const found = await ai.analyzeJob(jobDescription, locale, AbortSignal.timeout(analysisBudgetMs));
      return buildJobContext(mergeFacts(rules, found, jobDescription), jobDescription, locale, "ai");
    } catch (error) {
      logger.log({ level: "warn", event: "ai_fallback", operation: "job_analysis", reason: failureKind(error) });
      return buildJobContext(rules, jobDescription, locale, "rules");
    }
  }

  function prune() {
    const current = now();
    for (const [key, entry] of cache) if (entry.settled && entry.expiresAt <= current) cache.delete(key);
    // Evict the oldest finished entries first; in-flight work is never evicted.
    for (const [key, entry] of cache) {
      if (cache.size < maxEntries) break;
      if (entry.settled) cache.delete(key);
    }
  }

  function freshEntry(jobDescription: string, locale: Locale): CacheEntry | undefined {
    const entry = cache.get(cacheKey(jobDescription, locale));
    return entry && (!entry.settled || entry.expiresAt > now()) ? entry : undefined;
  }

  return {
    hasCached(jobDescription, locale) {
      return freshEntry(jobDescription, locale) !== undefined;
    },

    analyzeJob(jobDescription, locale, signal) {
      const existing = freshEntry(jobDescription, locale);
      if (existing) return untilAborted(existing.value, signal);
      prune();
      const key = cacheKey(jobDescription, locale);
      const entry: CacheEntry = { expiresAt: Number.POSITIVE_INFINITY, settled: false, value: analyzeShared(jobDescription, locale) };
      cache.set(key, entry);
      entry.value.then(
        () => {
          entry.settled = true;
          entry.expiresAt = now() + options.cacheTtlMs;
        },
        () => {
          // Only remove this entry, never a newer one stored under the same key.
          if (cache.get(key) === entry) cache.delete(key);
        },
      );
      return untilAborted(entry.value, signal);
    },

    async suggest(input, signal, budgetMs = suggestionBudgetMs) {
      const rules = suggestRules(input.jobContext, input.observations, input.locale);
      const fallback = () => filterRecommendations(rules, input.jobContext, input.observations);
      if (!ai || budgetMs <= 0) return fallback();
      try {
        const budget = AbortSignal.timeout(Math.min(budgetMs, suggestionBudgetMs));
        const written = await ai.suggest(input, AbortSignal.any([signal, budget]));
        const free = filterRecommendations(
          written.filter((rec) => !TEMPLATE_ONLY.has(rec.category)),
          input.jobContext,
          input.observations,
        );
        if (free.length > 0) {
          const templated = rules.filter((rec) => TEMPLATE_ONLY.has(rec.category));
          return filterRecommendations([...free, ...templated], input.jobContext, input.observations);
        }
        logger.log({ level: "warn", event: "ai_fallback", operation: "suggestions", reason: "nothing_usable" });
      } catch (error) {
        // Only the caller's own cancellation stops here; an AI timeout or failure falls back.
        if (signal.aborted) throw signal.reason;
        logger.log({ level: "warn", event: "ai_fallback", operation: "suggestions", reason: failureKind(error) });
      }
      return fallback();
    },
  };
}
