import type { JobContext, Locale, Observation, Recommendation } from "../../../packages/contracts/src/index.ts";

/**
 * Builds job context and recommendations from untrusted job text and neutral
 * observations. Implementations must treat the job text as data only.
 */
export interface GuidanceEngine {
  build(
    jobDescription: string,
    observations: Observation[],
    locale?: Locale,
  ): { jobContext: JobContext; recommendations: Recommendation[] };
}
