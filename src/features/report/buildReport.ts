import type { AnalysisResult, TryOnStyleId } from "../../lib/api/contracts";
import { MESSAGES, type Locale } from "../../lib/i18n";
import { filterGuidance } from "../recommendation";

export type TryOnReportStatus = "created" | "not-created" | "unavailable";

export interface ReportInput {
  result: AnalysisResult;
  tryOn: TryOnReportStatus;
  /** The previewed style's name goes into the report; never the image (R7.1, R7.2). */
  tryOnStyleId?: TryOnStyleId | null;
  generatedAt: Date;
  /** Language of the report's own headings and notices (defaults to English). */
  locale?: Locale;
}

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
export function buildReport({ result, tryOn, tryOnStyleId = null, generatedAt, locale = "en" }: ReportInput): string {
  const m = MESSAGES[locale];
  const copy = m.report.document;
  const safe = filterGuidance(result);
  const observations = new Map(safe.observations.map((observation) => [observation.id, observation.text]));
  const lines: string[] = [
    `# ${escapeMarkdown(copy.title)}`,
    "",
    `${copy.generated}: ${formatGenerated(generatedAt)}`,
    "",
    `## ${escapeMarkdown(copy.jobContext)}`,
    "",
  ];

  lines.push(escapeMarkdown(safe.jobContext.summary || copy.noSummary), "");
  for (const point of safe.jobContext.points) {
    const field = m.insight.fields[point.id];
    if (point.value === null || point.evidence === null) {
      lines.push(`- ${escapeMarkdown(field)}: ${escapeMarkdown(m.insight.notStated)}`);
      continue;
    }
    const quote = point.evidence === point.value ? "" : ` (“${escapeMarkdown(point.evidence)}”)`;
    lines.push(`- ${escapeMarkdown(field)}: ${escapeMarkdown(point.value)}${quote}`);
  }
  lines.push(`- ${escapeMarkdown(m.insight.formalityTitle)}: ${escapeMarkdown(m.insight.formality[safe.jobContext.formality])}`, "");
  for (const cue of safe.jobContext.cues) {
    const same = cue.label.replace(/\s/g, "").toLowerCase() === cue.evidence.replace(/\s/g, "").toLowerCase();
    lines.push(same ? `- ${escapeMarkdown(cue.label)}` : `- ${escapeMarkdown(cue.label)}: “${escapeMarkdown(cue.evidence)}”`);
  }
  if (safe.jobContext.cues.length > 0) lines.push("");

  lines.push(`## ${escapeMarkdown(m.review.title)}`, "");
  if (safe.observations.length === 0) lines.push(escapeMarkdown(m.review.empty), "");
  for (const observation of safe.observations) {
    const assessment = observation.assessment === "ok" ? m.review.ok : m.review.adjustable;
    lines.push(`- ${escapeMarkdown(m.categories[observation.category])}: ${escapeMarkdown(observation.text)} (${escapeMarkdown(assessment)})`);
  }
  if (safe.observations.length > 0) lines.push("");

  lines.push(`## ${escapeMarkdown(copy.guidance)}`, "");
  lines.push(escapeMarkdown(copy.optional), "");
  if (safe.recommendations.length === 0) lines.push(escapeMarkdown(copy.noRecommendations), "");
  for (const rec of safe.recommendations) {
    const noticed = (rec.observationId && observations.get(rec.observationId)) || m.guidance.fromJob;
    lines.push(
      `### ${escapeMarkdown(m.categories[rec.category])}`,
      "",
      `- ${m.guidance.noticed}: ${escapeMarkdown(noticed)}`,
      `- ${m.guidance.adjustment}: ${escapeMarkdown(rec.adjustment)}`,
      `- ${m.guidance.why}: ${escapeMarkdown(rec.rationale)}`,
      "",
    );
  }

  const styleLabel = tryOnStyleId ? m.tryOn.styles[tryOnStyleId].label : m.tryOn.pickerLabel;
  lines.push(`## ${escapeMarkdown(copy.tryOn)}`, "", `${copy.status}: ${escapeMarkdown(copy.tryOnStatus[tryOn](styleLabel))}`, "");
  lines.push(`## ${escapeMarkdown(copy.privacy)}`, "", ...copy.privacyLines.flatMap((sentence) => [escapeMarkdown(sentence), ""]));
  return `${lines.join("\n").trimEnd()}\n`;
}
