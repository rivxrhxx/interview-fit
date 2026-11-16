import type { Locale, Observation, TryOnStyleId } from "../../../../packages/contracts/src/index.ts";
import { encodePng } from "../png.ts";
import { captureBasics } from "./captureBasics.ts";
import { skinPrepObservations } from "./youcam/skinPrep.ts";
import { ProviderError, type AnalysisProvider, type ProviderImage, type TryOnProvider } from "./types.ts";

export type SimulatorScenario = "success" | "timeout" | "unavailable" | "rate-limited" | "malformed";

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

/** Deterministic observations for demos and tests (R9.2). */
export function simulatedObservations(image: ProviderImage, locale: Locale = "en"): Observation[] {
  // Fixed demo scores; the live adapter reads them from YouCam and discards them.
  const prep = skinPrepObservations(
    { output: [{ type: "oiliness", raw_score: 52 }, { type: "moisture", raw_score: 74 }, { type: "redness", raw_score: 81 }, { type: "texture", raw_score: 66 }] },
    locale,
  );
  return [
    ...captureBasics(image, locale),
    {
      id: "obs_lighting",
      category: "lighting",
      assessment: "adjustable",
      text:
        locale === "ko"
          ? "이 사진에서는 정면 조명을 확인할 수 없었어요."
          : "Front lighting could not be confirmed from this photo.",
    },
    ...(prep ?? []),
  ];
}

/** Local stand-in for the image provider. It never contacts a network service. */
export function createSimulatorProvider(options: { delayMs: number; scenario: SimulatorScenario }): AnalysisProvider {
  return {
    async analyze(image, signal, locale = "en") {
      if (options.scenario === "timeout") {
        await new Promise<never>((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason)));
      }
      await delay(options.delayMs, signal);
      switch (options.scenario) {
        case "unavailable":
          throw new ProviderError("unavailable");
        case "rate-limited":
          throw new ProviderError("rate-limited");
        case "malformed":
          return [{ unexpected: true }] as unknown as Observation[];
        default:
          return simulatedObservations(image, locale);
      }
    },
  };
}

const HAIR = [58, 46, 40];
const FACE = [196, 184, 172];
const TOP = [70, 86, 120];
const BACKDROP = [214, 219, 228];

type Shape = (dx: number, dy: number, r: number) => boolean;

/** Hair silhouettes per curated style, relative to the head center and radius. */
const HAIR_SHAPES: Record<TryOnStyleId, Shape> = {
  // Long styles: a cap over the crown plus side lengths that start at the temples.
  "sleek-middle-part": (dx, dy, r) => cap(dx, dy, r, -0.15) || side(dx, dy, r, 0.72, 1.12, 1.7),
  "neat-updo": (dx, dy, r) => cap(dx, dy, r, -0.25) || dx * dx + (dy + 1.2 * r) ** 2 < 0.16 * r * r,
  "side-swept-cut": (dx, dy, r) => dy < -0.2 * r + dx * 0.35 && dx * dx + dy * dy < 1.1 * r * r,
  "side-part-straight": (dx, dy, r) =>
    (dy < -0.1 * r - dx * 0.2 && dx * dx + dy * dy < 1.12 * r * r) || side(dx, dy, r, 0.72, 1.14, 1.8),
  "short-bob": (dx, dy, r) => cap(dx, dy, r, -0.2) || side(dx, dy, r, 0.72, 1.15, 0.8),
  "textured-comma": (dx, dy, r) =>
    dy < -0.35 * r + Math.abs(Math.sin(dx / (0.18 * r))) * 0.12 * r && dx * dx + dy * dy < 1.08 * r * r,
};

function cap(dx: number, dy: number, r: number, below: number): boolean {
  return dy < below * r && dx * dx + dy * dy < 1.12 * r * r;
}

/** Hair falling at both sides of the face, from the temples down to `bottom` (in head radii). */
function side(dx: number, dy: number, r: number, inner: number, outer: number, bottom: number): boolean {
  const x = Math.abs(dx);
  return x > inner * r && x < outer * r && dy > -0.55 * r && dy < bottom * r;
}

/**
 * Draws an illustrated head-and-shoulders figure with the chosen hairstyle (no user
 * pixels, no licensed assets). Used for deterministic demos and thumbnails; the live
 * provider returns a real try-on.
 */
function renderHairIllustration(width: number, height: number, style: TryOnStyleId): Uint8Array {
  const rgb = new Uint8Array(width * height * 3);
  const cx = width / 2;
  const r = Math.min(width, height) * 0.17;
  const headY = height * 0.4;
  const shoulderY = headY + r * 1.55;
  const hair = HAIR_SHAPES[style];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - headY;
      let color = BACKDROP;
      if (y >= shoulderY && Math.abs(dx) < width * 0.24 + (y - shoulderY) * 0.4) color = TOP;
      else if (y > headY && y < shoulderY && Math.abs(dx) < r * 0.42) color = FACE;
      if (dx * dx + (dy * dy) / 1.25 <= r * r) color = FACE;
      if (hair(dx, dy, r) && !(dx * dx + (dy * dy) / 1.25 <= r * r * 0.7 && dy > -0.2 * r)) color = HAIR;
      rgb.set(color, (y * width + x) * 3);
    }
  }
  return rgb;
}

export function createSimulatorTryOnProvider(options: { delayMs: number }): TryOnProvider {
  return {
    async tryOn(image, style, signal) {
      await delay(options.delayMs, signal);
      const width = 480;
      const height = Math.max(240, Math.min(960, Math.round((width * image.height) / image.width)));
      return { bytes: encodePng(width, height, renderHairIllustration(width, height, style)), mimeType: "image/png" };
    },
    async thumbnail(style) {
      return { bytes: encodePng(160, 160, renderHairIllustration(160, 160, style)), mimeType: "image/png" };
    },
  };
}
