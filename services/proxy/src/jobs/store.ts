import type { AnalysisJobId, AnalysisResult, ErrorCode, JobState } from "../../../../packages/contracts/src/index.ts";
import type { ImageInfo } from "../imageInspect.ts";

export interface AnalysisJobRecord {
  id: AnalysisJobId;
  state: JobState;
  createdAt: number;
  expiresAt: number;
  correlationId: string;
  /** Untrusted job text; cleared as soon as processing ends. */
  jobDescription: string | null;
  /** Temporary normalized image; zeroed and cleared on failure, cancellation, or expiry. */
  image: Uint8Array | null;
  imageInfo: ImageInfo | null;
  result: AnalysisResult | null;
  error: ErrorCode | null;
  abort: AbortController | null;
}

export interface JobStore {
  add(record: AnalysisJobRecord): void;
  /** Returns a live (unexpired) job. */
  get(id: string): AnalysisJobRecord | undefined;
  /** Test and diagnostics access that ignores expiry. */
  peek(id: string): AnalysisJobRecord | undefined;
  /** Test and diagnostics access to every stored record. */
  list(): AnalysisJobRecord[];
  size(): number;
  wipeImage(record: AnalysisJobRecord): void;
  sweep(): void;
  clear(): void;
}

export function createJobStore(now: () => number): JobStore {
  const jobs = new Map<string, AnalysisJobRecord>();

  function wipeImage(record: AnalysisJobRecord) {
    record.image?.fill(0);
    record.image = null;
    record.imageInfo = null;
  }

  function remove(record: AnalysisJobRecord) {
    record.abort?.abort();
    wipeImage(record);
    record.jobDescription = null;
    jobs.delete(record.id);
  }

  return {
    add(record) {
      jobs.set(record.id, record);
    },
    get(id) {
      const record = jobs.get(id);
      if (!record) return undefined;
      if (record.expiresAt <= now()) {
        remove(record);
        return undefined;
      }
      return record;
    },
    peek: (id) => jobs.get(id),
    list: () => [...jobs.values()],
    size: () => jobs.size,
    wipeImage,
    sweep() {
      const current = now();
      for (const record of [...jobs.values()]) if (record.expiresAt <= current) remove(record);
    },
    clear() {
      for (const record of [...jobs.values()]) remove(record);
    },
  };
}
