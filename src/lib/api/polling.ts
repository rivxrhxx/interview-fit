/** Raised when a polling loop is cancelled by its AbortSignal. */
export class PollCancelled extends Error {
  constructor() {
    super("cancelled");
    this.name = "PollCancelled";
  }
}

export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new PollCancelled());
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new PollCancelled());
      },
      { once: true },
    );
  });
}
