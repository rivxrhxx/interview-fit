import { loadConfig } from "./config.ts";
import { stdoutLogger } from "./logger.ts";
import { createSimulatorProvider } from "./providers/simulator.ts";
import { createProxy } from "./server.ts";

const config = loadConfig(process.env);
const provider = createSimulatorProvider(config.simulator);
const proxy = createProxy({ config, provider, logger: stdoutLogger });

proxy.server.listen(config.port, config.host, () => {
  stdoutLogger.log({ level: "info", event: "proxy_listening", host: config.host, port: config.port, provider: config.provider });
});

function stop() {
  proxy.shutdown();
  proxy.server.close(() => process.exit(0));
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
