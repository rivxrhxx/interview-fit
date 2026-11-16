/**
 * Structured log entries carry only whitelisted primitive fields. Request
 * bodies, headers, job IDs, job text, and image bytes are never logged.
 */
export interface LogEntry {
  level: "info" | "warn" | "error";
  event: string;
  [field: string]: string | number | boolean;
}

export interface Logger {
  log(entry: LogEntry): void;
}

export const stdoutLogger: Logger = {
  log(entry) {
    process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), ...entry })}\n`);
  },
};
