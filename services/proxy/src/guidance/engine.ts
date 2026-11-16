import {
  passesContentPolicy,
  type JobCue,
  type ObservationCategory,
  type Recommendation,
} from "../../../../packages/contracts/src/index.ts";
import type { GuidanceEngine } from "../guidance.ts";
import { cuePhrase, extractJobCues, type CueId } from "./jobCues.ts";

const MAX_RECOMMENDATIONS = 6;
const NO_CUES_SUMMARY = "No specific presentation cues were found in the job description.";

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function mention(cues: JobCue[]): string {
  return joinList(cues.map((cue) => `${cuePhrase(cue)} (“${cue.evidence}”)`));
}

function summarize(cues: JobCue[]): string {
  if (cues.length === 0) return NO_CUES_SUMMARY;
  return `The job description mentions ${joinList(cues.map(cuePhrase))}.`;
}

/** Capture tips for observations marked adjustable; rationale cites a camera-related cue when present. */
const CAPTURE_TIPS: Partial<Record<ObservationCategory, { adjustment: string; why: string }>> = {
  lighting: {
    adjustment: "Consider facing a window or adding a soft lamp in front of you, slightly above eye level.",
    why: "even front lighting helps the other person see you clearly on camera",
  },
  framing: {
    adjustment: "Consider placing the camera at eye level and centering your head and shoulders in the frame.",
    why: "a steady, centered frame keeps attention on what you say",
  },
  "image-clarity": {
    adjustment: "Consider using your device's main camera and wiping the lens for a sharper picture.",
    why: "a sharp picture makes it easier to follow you on screen",
  },
  background: {
    adjustment: "Consider a tidy, uncluttered background or a plain wall behind you.",
    why: "a simple background keeps the focus on the conversation",
  },
};

const ATTIRE_RULES: ReadonlyArray<{ cues: CueId[]; adjustment: string; setting: string }> = [
  {
    cues: ["formal-industry", "client-facing"],
    adjustment: "Consider a structured layer such as a blazer, if that feels comfortable for you.",
    setting: "where business attire is common",
  },
  {
    cues: ["creative-industry"],
    adjustment: "Consider an outfit that feels polished and true to your personal style.",
    setting: "where individual style is often welcome",
  },
  {
    cues: ["technical-role", "casual-workplace"],
    adjustment: "Consider neat, comfortable smart-casual clothing; full business attire is often optional.",
    setting: "where smart-casual clothing is common",
  },
];

/** Deterministic rules: no model, so job text cannot steer the output. */
export const rulesGuidance: GuidanceEngine = {
  build(jobDescription, observations) {
    const cues = extractJobCues(jobDescription);
    const byId = new Map(cues.map((cue) => [cue.id, cue]));
    const cameraCue = byId.get("video-interview") ?? byId.get("remote-work");
    const recommendations: Recommendation[] = [];
    const covered = new Set<ObservationCategory>();

    for (const observation of observations) {
      const tip = CAPTURE_TIPS[observation.category];
      if (observation.assessment !== "adjustable" || !tip || covered.has(observation.category)) continue;
      covered.add(observation.category);
      const why = `${tip.why.charAt(0).toUpperCase()}${tip.why.slice(1)}.`;
      recommendations.push({
        id: `rec_${observation.category.replace("-", "_")}`,
        category: observation.category,
        observationId: observation.id,
        adjustment: tip.adjustment,
        rationale: cameraCue ? `The posting mentions ${mention([cameraCue])}; ${tip.why}.` : why,
        cueIds: cameraCue ? [cameraCue.id] : [],
      });
    }

    const attire = ATTIRE_RULES.find((rule) => rule.cues.some((id) => byId.has(id)));
    if (attire) {
      const cited = attire.cues.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
      recommendations.push({
        id: "rec_attire",
        category: "attire",
        observationId: null,
        adjustment: attire.adjustment,
        rationale: `The posting mentions ${mention(cited)}, ${attire.setting}.`,
        cueIds: cited.map((cue) => cue.id),
      });
    }

    if (cameraCue && !covered.has("background")) {
      const tip = CAPTURE_TIPS.background!;
      recommendations.push({
        id: "rec_background",
        category: "background",
        observationId: null,
        adjustment: tip.adjustment,
        rationale: `The posting mentions ${mention([cameraCue])}; ${tip.why}.`,
        cueIds: [cameraCue.id],
      });
    }

    return { jobContext: { summary: summarize(cues), cues }, recommendations };
  },
};

/**
 * Wraps any generator (rules today, possibly a model later) with the content
 * policy and citation rules: every kept suggestion passes the policy (R5.3) and
 * cites an existing cue or observation (R5.1).
 */
export function createPolicyGuidance(generator: GuidanceEngine): GuidanceEngine {
  return {
    build(jobDescription, observations) {
      const raw = generator.build(jobDescription, observations);
      const cues = raw.jobContext.cues.filter((cue) => passesContentPolicy(cue.label) && passesContentPolicy(cue.evidence));
      const cueIds = new Set(cues.map((cue) => cue.id));
      const observationIds = new Set(observations.map((observation) => observation.id));
      const seen = new Set<string>();

      const recommendations = raw.recommendations
        .map((rec) => ({ ...rec, cueIds: rec.cueIds.filter((id) => cueIds.has(id)) }))
        .filter((rec) => {
          if (seen.has(rec.id)) return false;
          seen.add(rec.id);
          const cited = rec.cueIds.length > 0 || (rec.observationId !== null && observationIds.has(rec.observationId));
          const knownObservation = rec.observationId === null || observationIds.has(rec.observationId);
          return cited && knownObservation && passesContentPolicy(rec.adjustment) && passesContentPolicy(rec.rationale);
        })
        .slice(0, MAX_RECOMMENDATIONS);

      const summary = passesContentPolicy(raw.jobContext.summary) ? raw.jobContext.summary : summarize(cues);
      return { jobContext: { summary, cues }, recommendations };
    },
  };
}

export const defaultGuidance: GuidanceEngine = createPolicyGuidance(rulesGuidance);
