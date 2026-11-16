import {
  citableJobIds,
  passesContentPolicy,
  type JobContext,
  type JobCue,
  type JobInsightPoint,
  type Locale,
  type Observation,
  type ObservationCategory,
  type Recommendation,
} from "../../../../packages/contracts/src/index.ts";
import { cuePhrase, type CueId } from "./jobCues.ts";

const MAX_RECOMMENDATIONS = 8;

interface Tip {
  adjustment: string;
  /** Lower-case clause that completes a rationale sentence. */
  why: string;
}

type AttireKind = "formal" | "business-casual" | "creative" | "casual";

interface Copy {
  /** Rationale citing cues, then the reason. */
  cites: (mention: string, reason: string) => string;
  /** Rationale without a cue. */
  plain: (reason: string) => string;
  join: (parts: string[]) => string;
  quote: (phrase: string, evidence: string) => string;
  tips: Partial<Record<ObservationCategory, Tip>>;
  /** Skin-prep tips keyed by concern; each adjustable concern gets its own suggestion. */
  prepTips: Record<string, Tip>;
  attire: Record<AttireKind, { adjustment: string; setting: string }>;
  /** Rationale for attire: what the posting says, then the setting. */
  attireRationale: (mention: string, setting: string) => string;
}

const COPY: Record<Locale, Copy> = {
  en: {
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
    prepTips: {
      oiliness: {
        adjustment: "Consider blotting paper or a translucent powder just before the interview to reduce shine.",
        why: "less shine keeps the picture even under bright light",
      },
      moisture: {
        adjustment: "Consider a light moisturizer before the interview.",
        why: "it helps the picture look even under strong light",
      },
      redness: {
        adjustment: "Consider neutral white light or daylight from a window instead of warm-colored light.",
        why: "neutral light shows colors more naturally on camera",
      },
      texture: {
        adjustment: "Consider soft, diffused light from the front rather than strong light from the side.",
        why: "diffused front light makes the picture look more even",
      },
    },
    attire: {
      formal: {
        adjustment: "Consider a structured layer such as a blazer, if that feels comfortable for you.",
        setting: "where business attire is common",
      },
      "business-casual": {
        adjustment: "Consider a collared shirt or a neat blouse, with an optional light jacket.",
        setting: "where business-casual clothing is common",
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
    attireRationale: (mention, setting) => `The posting mentions ${mention}, ${setting}.`,
  },
  ko: {
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
    prepTips: {
      oiliness: {
        adjustment: "면접 직전에 기름종이나 투명 파우더로 번들거림을 정리하는 것을 고려해 보세요.",
        why: "번들거림이 적으면 밝은 조명 아래에서도 화면이 고르게 보여요",
      },
      moisture: {
        adjustment: "면접 전에 가벼운 보습제를 바르는 것을 고려해 보세요.",
        why: "강한 조명 아래에서도 화면이 고르게 보이는 데 도움이 돼요",
      },
      redness: {
        adjustment: "따뜻한 색 조명 대신 흰색에 가까운 조명이나 창가의 자연광을 고려해 보세요.",
        why: "중성적인 빛은 카메라에 색을 더 자연스럽게 담아요",
      },
      texture: {
        adjustment: "옆에서 비추는 강한 빛보다 정면에서 부드럽게 퍼지는 빛을 고려해 보세요.",
        why: "정면의 부드러운 빛은 화면을 더 고르게 보이게 해요",
      },
    },
    attire: {
      formal: {
        adjustment: "편하게 느껴진다면 블레이저 같은 구조감 있는 겉옷을 고려해 보세요.",
        setting: "이런 환경에서는 비즈니스 복장이 흔해요",
      },
      "business-casual": {
        adjustment: "칼라가 있는 셔츠나 단정한 블라우스에, 원한다면 가벼운 재킷을 더하는 것을 고려해 보세요.",
        setting: "이런 환경에서는 비즈니스 캐주얼이 흔해요",
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
    attireRationale: (mention, setting) => `공고에서 ${mention} 내용을 확인했어요. ${setting}.`,
  },
};

/** Cues that explain an attire suggestion, in citation order. */
const ATTIRE_CUES: readonly CueId[] = ["formal-industry", "client-facing", "creative-industry", "technical-role", "casual-workplace"];

function attireKind(context: JobContext, cueIds: Set<string>): AttireKind | null {
  switch (context.formality) {
    case "formal":
      return "formal";
    case "business-casual":
      return "business-casual";
    case "smart-casual":
    case "casual":
      return cueIds.has("creative-industry") ? "creative" : "casual";
    case "unknown":
      return null;
  }
}

/** A citable item: a catalog cue or a job-analysis point with evidence. */
interface Citation {
  id: string;
  phrase: string;
  evidence: string;
}

function cueCitation(cue: JobCue, locale: Locale): Citation {
  return { id: cue.id, phrase: cuePhrase(cue, locale), evidence: cue.evidence };
}

function pointCitation(point: JobInsightPoint, locale: Locale): Citation | null {
  if (point.value === null || point.evidence === null) return null;
  return { id: point.id, phrase: locale === "ko" ? point.value : point.value.toLowerCase(), evidence: point.evidence };
}

/** Deterministic suggestions from the job analysis and neutral observations; no model involved. */
export function suggestRules(context: JobContext, observations: Observation[], locale: Locale = "en"): Recommendation[] {
  const copy = COPY[locale];
  const byId = new Map(context.cues.map((cue) => [cue.id, cue]));
  const points = new Map(context.points.map((point) => [point.id, point]));
  const mention = (cited: Citation[]) => copy.join(cited.map((item) => copy.quote(item.phrase, item.evidence)));
  const cameraCue = byId.get("video-interview") ?? byId.get("remote-work");
  const camera = cameraCue ? cueCitation(cameraCue, locale) : null;
  const recommendations: Recommendation[] = [];
  const covered = new Set<ObservationCategory>();

  for (const observation of observations) {
    if (observation.assessment !== "adjustable") continue;
    if (observation.category === "skin-prep") {
      // One optional tip per concern, chosen from the observation ID (obs_prep_<concern>).
      const concern = observation.id.replace(/^obs_prep_/, "");
      const prep = copy.prepTips[concern];
      if (!prep) continue;
      recommendations.push({
        id: `rec_prep_${concern}`,
        category: "skin-prep",
        observationId: observation.id,
        adjustment: prep.adjustment,
        rationale: camera ? copy.cites(mention([camera]), prep.why) : copy.plain(prep.why),
        cueIds: camera ? [camera.id] : [],
      });
      continue;
    }
    const tip = copy.tips[observation.category];
    if (!tip || covered.has(observation.category)) continue;
    covered.add(observation.category);
    recommendations.push({
      id: `rec_${observation.category.replace("-", "_")}`,
      category: observation.category,
      observationId: observation.id,
      adjustment: tip.adjustment,
      rationale: camera ? copy.cites(mention([camera]), tip.why) : copy.plain(tip.why),
      cueIds: camera ? [camera.id] : [],
    });
  }

  const kind = attireKind(context, new Set(byId.keys()));
  if (kind) {
    // Cite the posting's own dress code first, then the cues behind the formality.
    const dressCode = pointCitation(points.get("dress-code")!, locale);
    const cueCitations = ATTIRE_CUES.flatMap((id) => (byId.has(id) ? [cueCitation(byId.get(id)!, locale)] : []));
    const fallback = [points.get("atmosphere")!, points.get("industry")!]
      .map((point) => pointCitation(point, locale))
      .filter((item): item is Citation => item !== null)
      .slice(0, 1);
    const cited = dressCode ? [dressCode] : cueCitations.length > 0 ? cueCitations.slice(0, 2) : fallback;
    if (cited.length > 0) {
      const { adjustment, setting } = copy.attire[kind];
      recommendations.push({
        id: "rec_attire",
        category: "attire",
        observationId: null,
        adjustment,
        rationale: copy.attireRationale(mention(cited), setting),
        cueIds: cited.map((item) => item.id),
      });
    }
  }

  if (camera && !covered.has("background")) {
    const tip = copy.tips.background!;
    recommendations.push({
      id: "rec_background",
      category: "background",
      observationId: null,
      adjustment: tip.adjustment,
      rationale: copy.cites(mention([camera]), tip.why),
      cueIds: [camera.id],
    });
  }

  return recommendations;
}

/**
 * Applies the content policy and citation rules to suggestions from any writer
 * (rules or AI): every kept suggestion passes the policy (R5.3), cites an existing
 * cue, job-analysis point, or observation (R5.1), and IDs are unique.
 */
export function filterRecommendations(
  raw: Recommendation[],
  context: JobContext,
  observations: Observation[],
): Recommendation[] {
  const citable = citableJobIds(context);
  const observationIds = new Set(observations.map((observation) => observation.id));
  const seen = new Set<string>();

  return raw
    .map((rec) => ({ ...rec, cueIds: [...new Set(rec.cueIds.filter((id) => citable.has(id)))] }))
    .filter((rec) => {
      if (seen.has(rec.id)) return false;
      seen.add(rec.id);
      const cited = rec.cueIds.length > 0 || (rec.observationId !== null && observationIds.has(rec.observationId));
      const knownObservation = rec.observationId === null || observationIds.has(rec.observationId);
      return cited && knownObservation && passesContentPolicy(rec.adjustment) && passesContentPolicy(rec.rationale);
    })
    .slice(0, MAX_RECOMMENDATIONS);
}
