import { useMemo, useState } from "react";
import { useAdapters } from "../../lib/adapters";
import type { AnalysisResult } from "../../lib/api/contracts";
import { buildReport, reportFileName, type TryOnReportStatus } from "./buildReport";

interface ReportStepProps {
  result: AnalysisResult;
  tryOn: TryOnReportStatus;
  generatedAt: string;
  onBack: () => void;
  onStartOver: () => void;
}

type SaveState = { status: "idle" } | { status: "saving" } | { status: "saved" } | { status: "cancelled" } | { status: "failed" };

export function ReportStep({ result, tryOn, generatedAt, onBack, onStartOver }: ReportStepProps) {
  const { report: exporter } = useAdapters();
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const date = useMemo(() => new Date(generatedAt), [generatedAt]);
  const contents = useMemo(() => buildReport({ result, tryOn, generatedAt: date }), [result, tryOn, date]);

  async function handleSave() {
    setSave({ status: "saving" });
    try {
      const outcome = await exporter.save({ suggestedName: reportFileName(date), contents });
      setSave({ status: outcome });
    } catch {
      setSave({ status: "failed" });
    }
  }

  return (
    <div className="step-stack">
      <p className="hint">Your photo is not included. Saving creates a text file only where you choose.</p>
      <pre className="report-preview" role="region" tabIndex={0} aria-label="Report preview">
        {contents}
      </pre>
      <div className="actions">
        <button type="button" className="button button-primary" onClick={handleSave} disabled={save.status === "saving"}>
          Save report…
        </button>
        <button type="button" className="button button-secondary" onClick={onBack}>
          Back to guidance
        </button>
        <button type="button" className="button button-text" onClick={onStartOver}>
          Start over
        </button>
        {save.status === "saved" && (
          <p className="notice" role="status">
            Report saved.
          </p>
        )}
        {save.status === "cancelled" && (
          <p className="status-text" role="status">
            Save cancelled. Nothing was written.
          </p>
        )}
        {save.status === "failed" && (
          <p className="notice notice-danger" role="alert">
            The report could not be saved. Choose another location and try again.
          </p>
        )}
      </div>
    </div>
  );
}
