import type { Observation } from "../../../../../packages/contracts/src/index.ts";

/**
 * Translates YouCam face-attribute task output into neutral capture
 * observations. Only the `face_quality` block is read; every facial attribute
 * (shape, ratios, colors, age, gender) is ignored and never leaves this module.
 */
const GOOD = "good";

type QualityField = "lighting" | "frontal" | "faceangle" | "area";

const QUALITY_TEXT: Record<QualityField, { id: string; category: Observation["category"]; good: string; adjust: string }> = {
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

/** Framing checks that YouCam reports as task errors; for guidance they are observations, not failures. */
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
export function faceQualityObservations(results: unknown): Observation[] | null {
  if (typeof results !== "object" || results === null) return null;
  const quality = (results as { face_quality?: unknown }).face_quality;
  if (typeof quality !== "object" || quality === null) return null;
  const fields = quality as Record<string, unknown>;

  if (fields.has_face === false) {
    return [{ id: "obs_face_presence", category: "framing", assessment: "adjustable", text: FRAMING_ERRORS.error_no_face }];
  }
  if (fields.has_face !== true) return null;

  const observations: Observation[] = [];
  for (const field of Object.keys(QUALITY_TEXT) as QualityField[]) {
    const value = fields[field];
    if (typeof value !== "string") continue;
    const copy = QUALITY_TEXT[field];
    const ok = value === GOOD;
    observations.push({ id: copy.id, category: copy.category, assessment: ok ? "ok" : "adjustable", text: ok ? copy.good : copy.adjust });
  }
  return observations.length > 0 ? observations : null;
}
