import type { JobContext, Observation, Recommendation } from "../../../packages/contracts/src/index.ts";

/** Builds job context and policy-constrained recommendations from job text and observations. */
export interface GuidanceEngine {
  build(jobDescription: string, observations: Observation[]): { jobContext: JobContext; recommendations: Recommendation[] };
}

/**
 * Observation-only guidance: reports observations without job-context cues or
 * recommendations. Used until a recommendation engine is configured.
 */
export const observationOnlyGuidance: GuidanceEngine = {
  build() {
    return {
      jobContext: { summary: "Job description received. Job-context cues are not available.", cues: [] },
      recommendations: [],
    };
  },
};
