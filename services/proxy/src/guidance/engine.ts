import {
  passesContentPolicy,
  type JobCue,
  type Locale,
  type ObservationCategory,
  type Recommendation,
} from "../../../../packages/contracts/src/index.ts";
import type { GuidanceEngine } from "../guidance.ts";
import { cuePhrase, extractJobCues, type CueId } from "./jobCues.ts";

const MAX_RECOMMENDATIONS = 6;

interface Tip {
  adjustment: string;
  /** Lower-case clause that completes a rationale sentence. */
  why: string;
}

interface Copy {
  noCues: string;
  summary: (list: string) => string;
  /** Rationale citing cues, then the reason. */
  cites: (mention: string, reason: string) => string;
  /** Rationale without a cue. */
  plain: (reason: string) => string;
  join: (parts: string[]) => string;
  quote: (phrase: string, evidence: string) => string;
  tips: Partial<Record<ObservationCategory, Tip>>;
  attire: Record<"formal" | "creative" | "casual", { adjustment: string; setting: string }>;
}

const COPY: Record<Locale, Copy> = {
  en: {
    noCues: "No specific presentation cues were found in the job description.",
    summary: (list) => `The job description mentions ${list}.`,
    cites: (mention, reason) => `The posting mentions ${mention}; ${reason}.`,
    plain: (reason) => `${reason.charAt(0).toUpperCase()}${reason.slice(1)}.`,
    join: (parts) =>
      parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`,
    quote: (phrase, evidence) => (phrase.toLowerCase() === evidence.toLowerCase() ? phrase : `${phrase} (“${evidence}”)`),
    tips: {
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
    },
    attire: {
      formal: {
        adjustment: "Consider a structured layer such as a blazer, if that feels comfortable for you.",
        setting: "where business attire is common",
      },
      creative: {
        adjustment: "Consider an outfit that feels polished and true to your personal style.",
        setting: "where individual style is often welcome",
      },
      casual: {
        adjustment: "Consider neat, comfortable smart-casual clothing; full business attire is often optional.",
        setting: "where smart-casual clothing is common",
      },
    },
  },
  ko: {
    noCues: "공고에서 특별한 단서를 찾지 못했어요.",
    summary: (list) => `공고에서 ${list} 내용을 확인했어요.`,
    cites: (mention, reason) => `공고에서 ${mention} 내용을 확인했어요. ${reason}.`,
    plain: (reason) => `${reason}.`,
    join: (parts) => parts.join(", "),
    quote: (phrase, evidence) => (phrase.replace(/\s/g, "") === evidence.replace(/\s/g, "") ? phrase : `${phrase}(“${evidence}”)`),
    tips: {
      lighting: {
        adjustment: "창문을 마주 보거나, 눈높이보다 조금 위에 부드러운 조명을 앞쪽에 두는 것을 고려해 보세요.",
        why: "정면에서 고르게 비추는 빛은 화면 너머 상대가 나를 또렷하게 보는 데 도움이 돼요",
      },
      framing: {
        adjustment: "카메라를 눈높이에 두고 머리와 어깨가 화면 가운데에 오도록 앉는 것을 고려해 보세요.",
        why: "안정적으로 가운데에 맞춘 화면은 말하는 내용에 집중하게 해 줘요",
      },
      "image-clarity": {
        adjustment: "기기의 메인 카메라를 쓰고 렌즈를 닦아 더 선명하게 찍는 것을 고려해 보세요.",
        why: "선명한 화면은 상대가 내 이야기를 따라오기 쉽게 해 줘요",
      },
      background: {
        adjustment: "정돈된 배경이나 단색 벽을 뒤에 두는 것을 고려해 보세요.",
        why: "단순한 배경은 대화에 집중하게 해 줘요",
      },
    },
    attire: {
      formal: {
        adjustment: "편하게 느껴진다면 블레이저 같은 구조감 있는 겉옷을 고려해 보세요.",
        setting: "이런 환경에서는 비즈니스 복장이 흔해요",
      },
      creative: {
        adjustment: "단정하면서도 나다운 스타일의 옷차림을 고려해 보세요.",
        setting: "이런 환경에서는 개성 있는 스타일을 반기는 경우가 많아요",
      },
      casual: {
        adjustment: "깔끔하고 편안한 스마트 캐주얼을 고려해 보세요. 정장까지는 필요 없는 경우가 많아요.",
        setting: "이런 환경에서는 스마트 캐주얼이 흔해요",
      },
    },
  },
};

const ATTIRE_RULES: ReadonlyArray<{ cues: CueId[]; kind: keyof Copy["attire"] }> = [
  { cues: ["formal-industry", "client-facing"], kind: "formal" },
  { cues: ["creative-industry"], kind: "creative" },
  { cues: ["technical-role", "casual-workplace"], kind: "casual" },
];

function summarize(cues: JobCue[], locale: Locale): string {
  const copy = COPY[locale];
  return cues.length === 0 ? copy.noCues : copy.summary(copy.join(cues.map((cue) => cuePhrase(cue, locale))));
}

/** Deterministic rules: no model, so job text cannot steer the output. */
export const rulesGuidance: GuidanceEngine = {
  build(jobDescription, observations, locale = "en") {
    const copy = COPY[locale];
    const cues = extractJobCues(jobDescription, locale);
    const byId = new Map(cues.map((cue) => [cue.id, cue]));
    const mention = (cited: JobCue[]) => copy.join(cited.map((cue) => copy.quote(cuePhrase(cue, locale), cue.evidence)));
    const cameraCue = byId.get("video-interview") ?? byId.get("remote-work");
    const recommendations: Recommendation[] = [];
    const covered = new Set<ObservationCategory>();

    for (const observation of observations) {
      const tip = copy.tips[observation.category];
      if (observation.assessment !== "adjustable" || !tip || covered.has(observation.category)) continue;
      covered.add(observation.category);
      recommendations.push({
        id: `rec_${observation.category.replace("-", "_")}`,
        category: observation.category,
        observationId: observation.id,
        adjustment: tip.adjustment,
        rationale: cameraCue ? copy.cites(mention([cameraCue]), tip.why) : copy.plain(tip.why),
        cueIds: cameraCue ? [cameraCue.id] : [],
      });
    }

    const attire = ATTIRE_RULES.find((rule) => rule.cues.some((id) => byId.has(id)));
    if (attire) {
      const cited = attire.cues.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
      const { adjustment, setting } = copy.attire[attire.kind];
      recommendations.push({
        id: "rec_attire",
        category: "attire",
        observationId: null,
        adjustment,
        rationale:
          locale === "ko"
            ? copy.cites(mention(cited), setting)
            : `The posting mentions ${mention(cited)}, ${setting}.`,
        cueIds: cited.map((cue) => cue.id),
      });
    }

    if (cameraCue && !covered.has("background")) {
      const tip = copy.tips.background!;
      recommendations.push({
        id: "rec_background",
        category: "background",
        observationId: null,
        adjustment: tip.adjustment,
        rationale: copy.cites(mention([cameraCue]), tip.why),
        cueIds: [cameraCue.id],
      });
    }

    return { jobContext: { summary: summarize(cues, locale), cues }, recommendations };
  },
};

/**
 * Wraps any generator (rules today, possibly a model later) with the content
 * policy and citation rules: every kept suggestion passes the policy (R5.3) and
 * cites an existing cue or observation (R5.1). The policy covers English and Korean.
 */
export function createPolicyGuidance(generator: GuidanceEngine): GuidanceEngine {
  return {
    build(jobDescription, observations, locale = "en") {
      const raw = generator.build(jobDescription, observations, locale);
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

      const summary = passesContentPolicy(raw.jobContext.summary) ? raw.jobContext.summary : summarize(cues, locale);
      return { jobContext: { summary, cues }, recommendations };
    },
  };
}

export const defaultGuidance: GuidanceEngine = createPolicyGuidance(rulesGuidance);
