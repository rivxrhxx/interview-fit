import { passesContentPolicy, type AnalysisResult } from "../../lib/api/contracts";

/**
 * Desktop-side defense in depth: anything that fails the shared content policy
 * is dropped before rendering, even if the backend sent it (R5.3).
 */
export function filterGuidance(result: AnalysisResult): AnalysisResult {
  const cues = result.jobContext.cues.filter((cue) => passesContentPolicy(cue.label) && passesContentPolicy(cue.evidence));
  return {
    ...result,
    jobContext: {
      summary: passesContentPolicy(result.jobContext.summary) ? result.jobContext.summary : "",
      cues,
    },
    observations: result.observations.filter((observation) => passesContentPolicy(observation.text)),
    recommendations: result.recommendations.filter(
      (rec) => passesContentPolicy(rec.adjustment) && passesContentPolicy(rec.rationale),
    ),
  };
}
