import type { AnalysisResult, ObservationCategory } from "../../lib/api/contracts";
import { filterGuidance } from "../recommendation";

export type TryOnReportStatus = "created" | "not-created" | "unavailable";

export interface ReportInput {
  result: AnalysisResult;
  tryOn: TryOnReportStatus;
  generatedAt: Date;
}

const CATEGORY_LABELS: Record<ObservationCategory, string> = {
  lighting: "Lighting",
  framing: "Framing",
  background: "Background",
  "image-clarity": "Image clarity",
  attire: "Attire",
};

const TRY_ON_STATUS: Record<TryOnReportStatus, string> = {
  created: "A navy blazer preview was created during this session. It is not included in this report.",
  "not-created": "No try-on preview was created.",
  unavailable: "A try-on preview could not be created.",
};

const PRIVACY_NOTICE = [
  "This report contains text only. It does not include your photo, the try-on preview, or any image data.",
  "Interview Fit offers optional, neutral suggestions. It does not assess appearance, infer personal traits, or predict interview outcomes.",
  "Temporary copies held by the Interview Fit backend are deleted when you start over or when they expire, by default within 15 minutes. The image provider's own retention terms apply to its processing.",
];

/** Escapes Markdown syntax so untrusted text cannot form images, links, HTML, or headings. */
export function escapeMarkdown(text: string): string {
  return text.replace(/\s*\n\s*/g, " ").replace(/[\\`*_{}[\]()#+\-!|<>]/g, (character) => `\\${character}`);
}

function formatGenerated(date: Date): string {
  const iso = date.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

export function reportFileName(date: Date): string {
  return `interview-fit-report-${date.toISOString().slice(0, 10)}.md`;
}

/**
 * Builds the text report (R7.1). It never embeds the source photo, the try-on
 * preview, or any image data (R7.2), and it applies the shared content policy.
 */
export function buildReport({ result, tryOn, generatedAt }: ReportInput): string {
  const safe = filterGuidance(result);
  const observations = new Map(safe.observations.map((observation) => [observation.id, observation.text]));
  const lines: string[] = ["# Interview Fit report", "", `Generated: ${formatGenerated(generatedAt)}`, "", "## Job context", ""];

  lines.push(escapeMarkdown(safe.jobContext.summary || "No job-context summary is available."), "");
  for (const cue of safe.jobContext.cues) lines.push(`- ${escapeMarkdown(cue.label)}: “${escapeMarkdown(cue.evidence)}”`);
  if (safe.jobContext.cues.length > 0) lines.push("");

  lines.push("## Presentation guidance", "");
  lines.push(escapeMarkdown("These suggestions are optional."), "");
  if (safe.recommendations.length === 0) {
    lines.push(escapeMarkdown("No adjustments were suggested for this photo and job description."), "");
  }
  for (const rec of safe.recommendations) {
    const noticed = (rec.observationId && observations.get(rec.observationId)) || "From the job description";
    lines.push(
      `### ${escapeMarkdown(CATEGORY_LABELS[rec.category])}`,
      "",
      `- What we noticed: ${escapeMarkdown(noticed)}`,
      `- Optional adjustment: ${escapeMarkdown(rec.adjustment)}`,
      `- Why: ${escapeMarkdown(rec.rationale)}`,
      "",
    );
  }

  lines.push(`## ${escapeMarkdown("Virtual try-on")}`, "", `Status: ${escapeMarkdown(TRY_ON_STATUS[tryOn])}`, "");
  lines.push("## Privacy", "", ...PRIVACY_NOTICE.flatMap((sentence) => [escapeMarkdown(sentence), ""]));
  return `${lines.join("\n").trimEnd()}\n`;
}
