import type { Locale, Observation } from "../../../../packages/contracts/src/index.ts";
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

const NAVY = [31, 45, 82];
const SHIRT = [236, 238, 242];
const FIGURE = [150, 156, 168];
const BACKDROP = [214, 219, 228];

/**
 * Draws an illustrative mannequin in a navy blazer (no user pixels, no licensed
 * assets). Used for deterministic demos; the live provider returns a real try-on.
 */
function renderBlazerIllustration(width: number, height: number): Uint8Array {
  const rgb = new Uint8Array(width * height * 3);
  const cx = width / 2;
  const headR = height * 0.12;
  const headY = height * 0.3;
  const shoulderY = height * 0.52;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let color = BACKDROP;
      const dx = x - cx;
      if (dx * dx + (y - headY) ** 2 <= headR * headR) color = FIGURE;
      else if (y > headY + headR * 0.8 && y < shoulderY && Math.abs(dx) < headR * 0.45) color = FIGURE;
      else if (y >= shoulderY) {
        const halfWidth = width * 0.22 + (y - shoulderY) * 0.35;
        if (Math.abs(dx) < halfWidth) {
          // A V-shaped shirt opening between the lapels.
          const opening = Math.max(0, headR * 0.9 - (y - shoulderY) * 0.45);
          color = Math.abs(dx) < opening ? SHIRT : NAVY;
        }
      }
      rgb.set(color, (y * width + x) * 3);
    }
  }
  return rgb;
}

export function createSimulatorTryOnProvider(options: { delayMs: number }): TryOnProvider {
  return {
    async tryOn(image, _style, signal) {
      await delay(options.delayMs, signal);
      const width = 480;
      const height = Math.max(240, Math.min(960, Math.round((width * image.height) / image.width)));
      return { bytes: encodePng(width, height, renderBlazerIllustration(width, height)), mimeType: "image/png" };
    },
  };
}
