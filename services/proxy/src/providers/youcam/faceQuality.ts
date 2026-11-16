import type { Locale, Observation } from "../../../../../packages/contracts/src/index.ts";

/**
 * Translates YouCam face-attribute task output into neutral capture
 * observations. Only the `face_quality` block is read; every facial attribute
 * (shape, ratios, colors, age, gender) is ignored and never leaves this module.
 */
const GOOD = "good";

type QualityField = "lighting" | "frontal" | "faceangle" | "area";

type QualityCopy = Record<QualityField, { id: string; category: Observation["category"]; good: string; adjust: string }>;

const QUALITY_TEXT: QualityCopy = {
  lighting: {
    id: "obs_lighting",
    category: "lighting",
    good: "The light on your face looks even.",
    adjust: "The light on your face could be brighter or more even.",
  },
  frontal: {
    id: "obs_facing",
    category: "framing",
    good: "You are facing the camera.",
    adjust: "You appear turned away from the camera.",
  },
  faceangle: {
    id: "obs_head_angle",
    category: "framing",
    good: "Your head looks level.",
    adjust: "Your head appears tilted.",
  },
  area: {
    id: "obs_face_size",
    category: "framing",
    good: "Your face is a comfortable size in the frame.",
    adjust: "Your face's size in the frame could be adjusted.",
  },
};

const QUALITY_TEXT_KO: QualityCopy = {
  lighting: {
    id: "obs_lighting",
    category: "lighting",
    good: "얼굴에 빛이 고르게 비쳐요.",
    adjust: "얼굴의 빛을 조금 더 밝거나 고르게 할 수 있어요.",
  },
  frontal: { id: "obs_facing", category: "framing", good: "카메라를 정면으로 보고 있어요.", adjust: "카메라에서 몸이 돌아가 보여요." },
  faceangle: { id: "obs_head_angle", category: "framing", good: "머리가 수평이에요.", adjust: "머리가 기울어져 보여요." },
  area: {
    id: "obs_face_size",
    category: "framing",
    good: "얼굴이 화면에 알맞은 크기예요.",
    adjust: "화면 속 얼굴 크기를 조정해 볼 수 있어요.",
  },
};

/** Framing checks that YouCam reports as task errors; for guidance they are observations, not failures. */
export const FRAMING_ERRORS_KO: Record<string, string> = {
  error_no_face: "사진에서 얼굴이 뚜렷하게 보이지 않아요.",
  error_pose: "머리와 어깨가 뚜렷하게 보이지 않아요.",
  error_face_position_invalid: "얼굴이 전부 보이지 않거나 화면 가운데에 있지 않아요.",
  error_face_position_too_small: "화면 속 얼굴이 작아 보여요.",
  error_face_position_out_of_boundary: "얼굴 일부가 화면 밖에 있어요.",
  error_face_not_forward_facing: "카메라에서 몸이 돌아가 보여요.",
  error_face_angle_upward: "머리가 위로 기울어져 보여요.",
  error_face_angle_downward: "머리가 아래로 기울어져 보여요.",
  error_face_angle_leftward: "머리가 한쪽으로 돌아가 보여요.",
  error_face_angle_rightward: "머리가 한쪽으로 돌아가 보여요.",
  error_face_angle_left_tilt: "머리가 기울어져 보여요.",
  error_face_angle_right_tilt: "머리가 기울어져 보여요.",
};

export const FRAMING_ERRORS: Record<string, string> = {
  error_no_face: "No face was clearly detected in the photo.",
  error_pose: "Your head and shoulders could not be clearly detected.",
  error_face_position_invalid: "Your face is not fully visible or centered in the frame.",
  error_face_position_too_small: "Your face appears small in the frame.",
  error_face_position_out_of_boundary: "Part of your face is outside the frame.",
  error_face_not_forward_facing: "You appear turned away from the camera.",
  error_face_angle_upward: "Your head appears angled upward.",
  error_face_angle_downward: "Your head appears angled downward.",
  error_face_angle_leftward: "Your head appears turned to one side.",
  error_face_angle_rightward: "Your head appears turned to one side.",
  error_face_angle_left_tilt: "Your head appears tilted.",
  error_face_angle_right_tilt: "Your head appears tilted.",
};

/** Task errors that mean the image itself cannot be used. */
export const INVALID_IMAGE_ERRORS = new Set([
  "error_decode_image",
  "error_nsfw_content_detected",
  "exceed_nsfw_retry_limits",
  "exceed_max_filesize",
  "error_exceed_max_image_size",
  "error_below_min_image_size",
]);

/** Returns observations, or null when the results do not contain a usable face_quality block. */
export function framingErrorText(code: string, locale: Locale = "en"): string | undefined {
  return (locale === "ko" ? FRAMING_ERRORS_KO : FRAMING_ERRORS)[code];
}

export function faceQualityObservations(results: unknown, locale: Locale = "en"): Observation[] | null {
  if (typeof results !== "object" || results === null) return null;
  const quality = (results as { face_quality?: unknown }).face_quality;
  if (typeof quality !== "object" || quality === null) return null;
  const fields = quality as Record<string, unknown>;

  if (fields.has_face === false) {
    return [
      { id: "obs_face_presence", category: "framing", assessment: "adjustable", text: framingErrorText("error_no_face", locale)! },
    ];
  }
  if (fields.has_face !== true) return null;

  const observations: Observation[] = [];
  for (const field of Object.keys(QUALITY_TEXT) as QualityField[]) {
    const value = fields[field];
    if (typeof value !== "string") continue;
    const copy = (locale === "ko" ? QUALITY_TEXT_KO : QUALITY_TEXT)[field];
    const ok = value === GOOD;
    observations.push({ id: copy.id, category: copy.category, assessment: ok ? "ok" : "adjustable", text: ok ? copy.good : copy.adjust });
  }
  return observations.length > 0 ? observations : null;
}
