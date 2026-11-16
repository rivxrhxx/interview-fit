import type { Observation } from "../../../../packages/contracts/src/index.ts";
import { captureBasics } from "./captureBasics.ts";
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

/** Deterministic observations for demos and tests (R9.2). */
export function simulatedObservations(image: ProviderImage): Observation[] {
  return [
    ...captureBasics(image),
    {
      id: "obs_lighting",
      category: "lighting",
      assessment: "adjustable",
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
