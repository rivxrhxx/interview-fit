import type { Locale, Observation } from "../../../../../packages/contracts/src/index.ts";
import type { Logger } from "../../logger.ts";
import { captureBasics } from "../captureBasics.ts";
import { ProviderError, type AnalysisProvider, type ProviderImage } from "../types.ts";
import { createYouCamClient, type YouCamClient } from "./client.ts";
import type { YouCamConfig } from "./config.ts";
import { INVALID_IMAGE_ERRORS, faceQualityObservations, framingErrorText } from "./faceQuality.ts";
import { SKIN_TASK_OPTIONS, SKIN_TOOL, prepRetakeObservation, skinPrepObservations } from "./skinPrep.ts";

const FACE_TOOL = "face-attr-analysis";

/**
 * The tool requires at least one attribute feature. `hairColor` is the least
 * sensitive option; its value is discarded. "flexible" angle strictness turns
 * fewer photos into hard rejections so users get guidance instead.
 */
const FACE_TASK_OPTIONS = { features: ["hairColor"], face_angle_strictness_level: "flexible" } as const;

/**
 * Skin prep is optional (R5.5): an error or an unusable result yields a retake
 * hint or nothing, never a failed analysis. Cancellation still propagates.
 */
async function skinPrep(
  client: YouCamClient,
  image: ProviderImage,
  signal: AbortSignal,
  locale: Locale,
  logger: Logger,
): Promise<Observation[]> {
  try {
    // A separate upload: reusing one file ID across tools is not documented.
    const fileId = await client.uploadImage(image, signal);
    const taskId = await client.createTask(SKIN_TOOL, { src_file_id: fileId, ...SKIN_TASK_OPTIONS }, signal);
    const outcome = await client.waitForTask(SKIN_TOOL, taskId, signal);
    if (outcome.status === "error") {
      const retake = prepRetakeObservation(outcome.code, locale);
      logger.log({ level: "info", event: "skin_prep_skipped", reason: retake ? "retake" : "provider_error" });
      return retake ? [retake] : [];
    }
    const observations = skinPrepObservations(outcome.results, locale);
    if (!observations) logger.log({ level: "warn", event: "skin_prep_skipped", reason: "malformed" });
    return observations ?? [];
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    logger.log({ level: "warn", event: "skin_prep_skipped", reason: error instanceof ProviderError ? error.kind : "unknown" });
    return [];
  }
}

/** How long skin prep may keep running after the required photo-quality result is in (R5.5). */
const DEFAULT_SKIN_GRACE_MS = 10_000;
const SKIN_SLOW = Symbol("skin-slow");

export function createYouCamAnalysisProvider(options: {
  config: YouCamConfig;
  logger: Logger;
  fetch?: typeof fetch;
  skinGraceMs?: number;
}): AnalysisProvider {
  const client = createYouCamClient(options);
  const skinGraceMs = options.skinGraceMs ?? DEFAULT_SKIN_GRACE_MS;

  async function faceQuality(image: ProviderImage, signal: AbortSignal, locale: Locale): Promise<Observation[]> {
    const fileId = await client.uploadImage(image, signal);
    const taskId = await client.createTask(FACE_TOOL, { src_file_id: fileId, ...FACE_TASK_OPTIONS }, signal);
    const outcome = await client.waitForTask(FACE_TOOL, taskId, signal);
    if (outcome.status === "error") {
      const framing = framingErrorText(outcome.code, locale);
      if (framing) return [{ id: "obs_face_position", category: "framing", assessment: "adjustable", text: framing }];
      throw new ProviderError(INVALID_IMAGE_ERRORS.has(outcome.code) ? "invalid-image" : "unavailable");
    }
    const quality = faceQualityObservations(outcome.results, locale);
    if (!quality) throw new ProviderError("malformed-response");
    return quality;
  }

  return {
    async analyze(image, signal, locale = "en") {
      // When the required photo-quality task fails, stop the optional skin task too.
      const local = new AbortController();
      const skin = new AbortController();
      const forward = () => local.abort(signal.reason);
      const stopSkin = () => skin.abort(local.signal.reason);
      if (signal.aborted) forward();
      signal.addEventListener("abort", forward, { once: true });
      local.signal.addEventListener("abort", stopSkin, { once: true });
      const prep = skinPrep(client, image, skin.signal, locale, options.logger);
      prep.catch(() => undefined);
      let grace: ReturnType<typeof setTimeout> | undefined;
      try {
        const quality = await faceQuality(image, local.signal, locale);
        // A slow skin task never holds up or fails the analysis; it is stopped and skipped.
        const extra = await Promise.race([
          prep,
          new Promise<typeof SKIN_SLOW>((resolve) => (grace = setTimeout(() => resolve(SKIN_SLOW), skinGraceMs))),
        ]);
        if (extra === SKIN_SLOW) {
          skin.abort(new Error("skin prep too slow"));
          options.logger.log({ level: "info", event: "skin_prep_skipped", reason: "slow" });
          return [...captureBasics(image, locale), ...quality];
        }
        return [...captureBasics(image, locale), ...quality, ...extra];
      } catch (error) {
        local.abort(error);
        throw error;
      } finally {
        clearTimeout(grace);
        signal.removeEventListener("abort", forward);
      }
    },
  };
}
