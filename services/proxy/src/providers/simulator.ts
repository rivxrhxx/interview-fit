import type { Observation } from "../../../../packages/contracts/src/index.ts";
import { ProviderError, type AnalysisProvider, type ProviderImage } from "./types.ts";

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

/** Deterministic observations derived only from image dimensions (R9.2 demo fixtures). */
export function simulatedObservations(image: ProviderImage): Observation[] {
  const { width, height } = image;
  const megapixels = (width * height) / 1_000_000;
  const orientation = width > height ? "landscape" : width < height ? "portrait" : "square";
  return [
    {
      id: "obs_clarity",
      category: "image-clarity",
      text:
        megapixels >= 0.9
          ? `The photo resolution (${width}×${height}) is enough for a clear video preview.`
          : `The photo resolution (${width}×${height}) is lower than a typical HD video frame.`,
    },
    {
      id: "obs_framing",
      category: "framing",
      text:
        orientation === "landscape"
          ? "The photo is in landscape orientation, like a typical video call frame."
          : `The photo is in ${orientation} orientation, while video calls usually show a landscape frame.`,
    },
    {
      id: "obs_lighting",
      category: "lighting",
      text: "Front lighting could not be confirmed from this photo.",
    },
  ];
}

/** Local stand-in for the image provider. It never contacts a network service. */
export function createSimulatorProvider(options: { delayMs: number; scenario: SimulatorScenario }): AnalysisProvider {
  return {
    async analyze(image, signal) {
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
          return simulatedObservations(image);
      }
    },
  };
}
