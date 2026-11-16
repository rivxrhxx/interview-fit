import type { Locale, Observation } from "../../../../../packages/contracts/src/index.ts";

/**
 * Translates YouCam skin-analysis output into optional, camera-focused prep
 * observations (R5.4). Only four camera-visible concerns are requested (the 1-4
 * concern price tier). Each `raw_score` (1-100, higher means less pronounced) is
 * reduced to "ok" or "adjustable" and then discarded: scores, skin age, skin
 * type, and masks never leave this module. The text describes how the camera and
 * light may render the photo and never names a condition.
 */
export const SKIN_TOOL = "skin-analysis";
export const SKIN_CONCERNS = ["oiliness", "moisture", "redness", "texture"] as const;
export type SkinConcern = (typeof SKIN_CONCERNS)[number];
export const SKIN_TASK_OPTIONS = { dst_actions: [...SKIN_CONCERNS], format: "json" } as const;

/** Below this raw score a concern gets an optional prep tip. */
export const ADJUSTABLE_BELOW = 60;

type ConcernCopy = Record<SkinConcern, { ok: string; adjust: string }>;

const CONCERN_TEXT: Record<Locale, ConcernCopy> = {
  en: {
    oiliness: {
      ok: "Shine under the light is not very noticeable.",
      adjust: "Under bright light, some shine may show on the forehead and nose.",
    },
    moisture: {
      ok: "Dryness is not very noticeable on camera.",
      adjust: "Strong light can make dry areas show on camera.",
    },
    redness: {
      ok: "Red tones are not strongly emphasized on camera.",
      adjust: "Warm-colored light can make red tones look stronger on camera.",
    },
    texture: {
      ok: "Surface texture looks even on camera.",
      adjust: "Strong side light can make surface texture stand out on camera.",
    },
  },
  ko: {
    oiliness: {
      ok: "조명 아래 빛 반사가 크게 눈에 띄지 않아요.",
      adjust: "밝은 조명 아래에서 이마와 코 주변에 빛 반사가 생길 수 있어요.",
    },
    moisture: {
      ok: "화면에서 건조함이 크게 드러나지 않아요.",
      adjust: "조명이 강하면 건조한 부분이 화면에 드러날 수 있어요.",
    },
    redness: {
      ok: "카메라에서 붉은 톤이 크게 강조되지 않아요.",
      adjust: "따뜻한 색 조명에서는 붉은 톤이 더 강조되어 보일 수 있어요.",
    },
    texture: {
      ok: "카메라에 결이 고르게 담겨요.",
      adjust: "옆에서 비추는 강한 빛은 결을 도드라져 보이게 할 수 있어요.",
    },
  },
};

/** Observation ID for a concern; the rules engine picks the matching tip from it. */
export const prepObservationId = (concern: SkinConcern) => `obs_prep_${concern}`;

/** Skin-analysis errors that mean "retake closer or brighter", not a failed analysis (R5.5). */
const RETAKE_ERRORS: Record<string, "framing" | "lighting"> = {
  error_src_face_too_small: "framing",
  error_src_face_out_of_bound: "framing",
  error_below_min_image_size: "framing",
  error_lighting_dark: "lighting",
};

const RETAKE_TEXT: Record<Locale, Record<"framing" | "lighting", string>> = {
  en: {
    framing: "For lighting and grooming prep tips, take the photo closer so your face fills more than half the frame width.",
    lighting: "For lighting and grooming prep tips, take the photo in a brighter place.",
  },
  ko: {
    framing: "얼굴이 사진 폭의 절반 이상을 채우도록 가까이에서 찍으면 조명·그루밍 준비 팁도 받을 수 있어요.",
    lighting: "더 밝은 곳에서 찍으면 조명·그루밍 준비 팁도 받을 수 있어요.",
  },
};

/** One retake hint for a skin-analysis framing or lighting error, or null for other errors. */
export function prepRetakeObservation(code: string, locale: Locale = "en"): Observation | null {
  const kind = RETAKE_ERRORS[code];
  if (!kind) return null;
  return { id: `obs_prep_${kind}`, category: kind, assessment: "adjustable", text: RETAKE_TEXT[locale][kind] };
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Null when the result has none of the requested concerns (treated as "no prep tips"). */
export function skinPrepObservations(results: unknown, locale: Locale = "en"): Observation[] | null {
  const output = record(results)?.output;
  if (!Array.isArray(output)) return null;
  const observations: Observation[] = [];
  for (const concern of SKIN_CONCERNS) {
    const item = output.map(record).find((entry) => entry?.type === concern);
    const score = item?.raw_score;
    if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 100) continue;
    const adjustable = score < ADJUSTABLE_BELOW;
    observations.push({
      id: prepObservationId(concern),
      category: "skin-prep",
      assessment: adjustable ? "adjustable" : "ok",
      text: adjustable ? CONCERN_TEXT[locale][concern].adjust : CONCERN_TEXT[locale][concern].ok,
    });
  }
  return observations.length > 0 ? observations : null;
}
