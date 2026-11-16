import { useMemo, useState } from "react";
import { useAdapters } from "../../lib/adapters";
import { useI18n } from "../../lib/i18n";
import type { AnalysisResult, TryOnStyleId } from "../../lib/api/contracts";
import { buildReport, reportFileName, type TryOnReportStatus } from "./buildReport";

interface ReportStepProps {
  result: AnalysisResult;
  tryOn: TryOnReportStatus;
  tryOnStyleId?: TryOnStyleId | null;
  generatedAt: string;
  onBack: () => void;
  onStartOver: () => void;
}

type SaveState = { status: "idle" } | { status: "saving" } | { status: "saved" } | { status: "cancelled" } | { status: "failed" };

export function ReportStep({ result, tryOn, tryOnStyleId = null, generatedAt, onBack, onStartOver }: ReportStepProps) {
  const { report: exporter } = useAdapters();
  const { m, locale } = useI18n();
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const date = useMemo(() => new Date(generatedAt), [generatedAt]);
  const contents = useMemo(
    () => buildReport({ result, tryOn, tryOnStyleId, generatedAt: date, locale }),
    [result, tryOn, tryOnStyleId, date, locale],
  );

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
      <p className="hint">{m.report.hint}</p>
      <pre className="report-preview" role="region" tabIndex={0} aria-label={m.report.previewLabel}>
        {contents}
      </pre>
      <div className="actions">
        <button type="button" className="button button-primary" onClick={handleSave} disabled={save.status === "saving"}>
          {m.report.save}
        </button>
        <button type="button" className="button button-secondary" onClick={onBack}>
          {m.report.back}
        </button>
        <button type="button" className="button button-text" onClick={onStartOver}>
          {m.report.startOver}
        </button>
        {save.status === "saved" && (
          <p className="notice" role="status">
            {m.report.saved}
          </p>
        )}
        {save.status === "cancelled" && (
          <p className="status-text" role="status">
            {m.report.cancelled}
          </p>
        )}
        {save.status === "failed" && (
          <p className="notice notice-danger" role="alert">
            {m.report.failed}
          </p>
        )}
      </div>
    </div>
  );
}
