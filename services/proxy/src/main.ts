import { loadConfig } from "./config.ts";
import { stdoutLogger } from "./logger.ts";
import { createSimulatorProvider, createSimulatorTryOnProvider } from "./providers/simulator.ts";
import type { AnalysisProvider, TryOnProvider } from "./providers/types.ts";
import { createYouCamAnalysisProvider } from "./providers/youcam/analysisProvider.ts";
import { loadYouCamConfig } from "./providers/youcam/config.ts";
import { createYouCamTryOnProvider } from "./providers/youcam/tryOnProvider.ts";
import { createProxy } from "./server.ts";

const config = loadConfig(process.env);
// Provider secrets are read from the backend environment here and nowhere else.
const youcam = config.provider === "youcam" ? loadYouCamConfig(process.env) : null;
const provider: AnalysisProvider = youcam
  ? createYouCamAnalysisProvider({ config: youcam, logger: stdoutLogger })
  : createSimulatorProvider(config.simulator);
const tryOnProvider: TryOnProvider = youcam
  ? createYouCamTryOnProvider({ config: youcam, logger: stdoutLogger })
  : createSimulatorTryOnProvider(config.simulator);
const proxy = createProxy({ config, provider, tryOnProvider, logger: stdoutLogger });

proxy.server.listen(config.port, config.host, () => {
  stdoutLogger.log({ level: "info", event: "proxy_listening", host: config.host, port: config.port, provider: config.provider });
});

function stop() {
  proxy.shutdown();
  proxy.server.close(() => process.exit(0));
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
