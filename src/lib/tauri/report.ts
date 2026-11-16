import { invoke, isTauri } from "@tauri-apps/api/core";

export type ReportSaveResult = "saved" | "cancelled";
export type ReportExportErrorCode = "REPORT_INVALID" | "REPORT_SAVE_FAILED";

export class ReportExportError extends Error {
  readonly code: ReportExportErrorCode;

  constructor(code: ReportExportErrorCode) {
    super(code);
    this.name = "ReportExportError";
    this.code = code;
  }
}

export interface ReportPayload {
  suggestedName: string;
  /** Text only. Images are never part of an export payload (R7.2). */
  contents: string;
}

/** Explicit, user-initiated export. Nothing is written unless the user confirms a location. */
export interface ReportExporter {
  save(report: ReportPayload): Promise<ReportSaveResult>;
}

function toExportError(error: unknown): ReportExportError {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  return new ReportExportError(code === "REPORT_INVALID" ? "REPORT_INVALID" : "REPORT_SAVE_FAILED");
}

/** Desktop: the Rust `save_report` command opens the native save dialog and writes the chosen file. */
export const nativeReportExporter: ReportExporter = {
  async save({ suggestedName, contents }) {
    try {
      const outcome = await invoke<{ status: ReportSaveResult }>("save_report", { suggestedName, contents });
      return outcome.status === "saved" ? "saved" : "cancelled";
    } catch (error) {
      throw toExportError(error);
    }
  },
};

/** Browser-only development fallback: a user-initiated download of the text file. */
export const browserReportExporter: ReportExporter = {
  async save({ suggestedName, contents }) {
    const url = URL.createObjectURL(new Blob([contents], { type: "text/markdown;charset=utf-8" }));
    try {
      const link = document.createElement("a");
      link.href = url;
      link.download = suggestedName;
      link.click();
      return "saved";
    } finally {
      URL.revokeObjectURL(url);
    }
  },
};

export function createReportExporter(): ReportExporter {
  return isTauri() ? nativeReportExporter : browserReportExporter;
}
