import type { JobCue } from "../../../../packages/contracts/src/index.ts";

/**
 * Fixed catalog of presentation-relevant job cues. Job text is only searched
 * with these patterns; nothing in it is ever interpreted as an instruction (R1.3).
 */
export const CUE_CATALOG = [
  {
    id: "video-interview",
    phrase: "a video interview",
    label: "Video interview",
    pattern:
      /\b(video (?:calls?|interviews?|meetings?|conferenc\w*)|(?:over|on|via) video|zoom|google meet|microsoft teams|webex|virtual interviews?|remote interviews?)\b/i,
  },
  { id: "remote-work",
    phrase: "remote work", label: "Remote work", pattern: /\b(remote|work from home|distributed team|hybrid)\b/i },
  { id: "client-facing",
    phrase: "client-facing work", label: "Client-facing work", pattern: /\b(client[- ]facing|customer[- ]facing|clients?|customers?)\b/i },
  {
    id: "presenting",
    phrase: "presenting",
    label: "Presenting",
    pattern: /\b(presentations?|presenting|present (?:findings|results|to)|public speaking|pitch(?:es|ing)?)\b/i,
  },
  {
    id: "formal-industry",
    phrase: "a formal industry setting",
    label: "Formal industry setting",
    pattern: /\b(bank(?:ing)?|financ(?:e|ial)|law firm|legal|attorneys?|consulting|consultancy|investment|insurance|accounting|audit)\b/i,
  },
  {
    id: "creative-industry",
    phrase: "a creative setting",
    label: "Creative setting",
    pattern: /\b(creative|design(?:er|ers)?|agency|brand(?:ing)?|fashion|media|art director|portfolio)\b/i,
  },
  {
    id: "technical-role",
    phrase: "a technical role",
    label: "Technical role",
    pattern: /\b(software|engineer(?:ing)?|developers?|programming|devops|data scientists?)\b/i,
  },
  { id: "casual-workplace",
    phrase: "a casual workplace", label: "Casual workplace", pattern: /\b(start-?ups?|early-stage|casual|relaxed dress)\b/i },
  { id: "in-person",
    phrase: "in-person meetings", label: "In-person meetings", pattern: /\b(on-?site|in[- ]person|in the office)\b/i },
] as const;

export type CueId = (typeof CUE_CATALOG)[number]["id"];

/** Prose form of a cue for rationale sentences, e.g. "a video interview". */
export function cuePhrase(cue: JobCue): string {
  return CUE_CATALOG.find((entry) => entry.id === cue.id)?.phrase ?? cue.label.toLowerCase();
}

/** Returns catalog cues found in the text; `evidence` is the matched phrase, copied verbatim. */
export function extractJobCues(jobDescription: string): JobCue[] {
  const cues: JobCue[] = [];
  for (const entry of CUE_CATALOG) {
    const match = entry.pattern.exec(jobDescription);
    if (match) cues.push({ id: entry.id, label: entry.label, evidence: match[0] });
  }
  return cues;
}
