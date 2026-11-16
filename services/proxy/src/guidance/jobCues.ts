import type { JobCue, Locale } from "../../../../packages/contracts/src/index.ts";

interface CueEntry {
  id: string;
  /** Display label per locale. */
  label: Record<Locale, string>;
  /** Prose form used inside rationale sentences. */
  phrase: Record<Locale, string>;
  /** English patterns use word boundaries; Korean patterns cannot (Hangul has no \b). */
  patterns: RegExp[];
}

/**
 * Fixed catalog of presentation-relevant job cues, matched in English and Korean
 * postings alike. Job text is only searched with these patterns; nothing in it is
 * ever interpreted as an instruction (R1.3).
 */
export const CUE_CATALOG: readonly CueEntry[] = [
  {
    id: "video-interview",
    label: { en: "Video interview", ko: "화상 면접" },
    phrase: { en: "a video interview", ko: "화상 면접" },
    patterns: [
      /\b(video (?:calls?|interviews?|meetings?|conferenc\w*)|(?:over|on|via) video|zoom|google meet|microsoft teams|webex|virtual interviews?|remote interviews?)\b/i,
      /(화상\s*(?:면접|통화|회의|미팅|인터뷰)|비대면\s*(?:면접|인터뷰)|줌\s*(?:면접|미팅))/,
    ],
  },
  {
    id: "remote-work",
    label: { en: "Remote work", ko: "원격 근무" },
    phrase: { en: "remote work", ko: "원격 근무" },
    patterns: [/\b(remote|work from home|distributed team|hybrid)\b/i, /(재택\s*근무|재택|원격\s*근무|리모트|하이브리드)/],
  },
  {
    id: "client-facing",
    label: { en: "Client-facing work", ko: "고객 응대 업무" },
    phrase: { en: "client-facing work", ko: "고객 응대 업무" },
    patterns: [/\b(client[- ]facing|customer[- ]facing|clients?|customers?)\b/i, /(고객사|고객|클라이언트)/],
  },
  {
    id: "presenting",
    label: { en: "Presenting", ko: "발표" },
    phrase: { en: "presenting", ko: "발표" },
    patterns: [
      /\b(presentations?|presenting|present (?:findings|results|to)|public speaking|pitch(?:es|ing)?)\b/i,
      /(발표|프레젠테이션|피칭)/,
    ],
  },
  {
    id: "formal-industry",
    label: { en: "Formal industry setting", ko: "격식 있는 업계" },
    phrase: { en: "a formal industry setting", ko: "격식 있는 업계" },
    patterns: [
      /\b(bank(?:ing)?|financ(?:e|ial)|law firm|legal|attorneys?|consulting|consultancy|investment|insurance|accounting|audit)\b/i,
      /(은행|금융|증권|보험|법무|법률|회계|컨설팅|투자)/,
    ],
  },
  {
    id: "creative-industry",
    label: { en: "Creative setting", ko: "크리에이티브 환경" },
    phrase: { en: "a creative setting", ko: "크리에이티브 환경" },
    patterns: [
      /\b(creative|design(?:er|ers)?|agency|brand(?:ing)?|fashion|media|art director|portfolio)\b/i,
      /(디자이너|디자인|크리에이티브|에이전시|브랜딩|브랜드|패션|미디어|포트폴리오)/,
    ],
  },
  {
    id: "technical-role",
    label: { en: "Technical role", ko: "기술 직무" },
    phrase: { en: "a technical role", ko: "기술 직무" },
    patterns: [
      /\b(software|engineer(?:ing)?|developers?|programming|devops|data scientists?)\b/i,
      /(개발자|엔지니어|소프트웨어|프로그래밍|데브옵스|데이터\s*사이언티스트)/,
    ],
  },
  {
    id: "casual-workplace",
    label: { en: "Casual workplace", ko: "캐주얼한 근무 환경" },
    phrase: { en: "a casual workplace", ko: "캐주얼한 근무 환경" },
    patterns: [/\b(start-?ups?|early-stage|casual|relaxed dress)\b/i, /(스타트업|자율\s*복장|캐주얼|편한\s*복장)/],
  },
  {
    id: "in-person",
    label: { en: "In-person meetings", ko: "대면 미팅" },
    phrase: { en: "in-person meetings", ko: "대면 미팅" },
    // `(?<!비)대면` keeps 비대면 (remote) from counting as in-person.
    patterns: [/\b(on-?site|in[- ]person|in the office)\b/i, /((?<!비)대면|오프라인\s*(?:면접|미팅)|사무실\s*출근)/],
  },
];

export type CueId = string;

/** Prose form of a cue for rationale sentences, e.g. "a video interview". */
export function cuePhrase(cue: JobCue, locale: Locale = "en"): string {
  return CUE_CATALOG.find((entry) => entry.id === cue.id)?.phrase[locale] ?? cue.label.toLowerCase();
}

/** Returns catalog cues found in the text; `evidence` is the earliest matched phrase, copied verbatim. */
export function extractJobCues(jobDescription: string, locale: Locale = "en"): JobCue[] {
  const cues: JobCue[] = [];
  for (const entry of CUE_CATALOG) {
    const matches = entry.patterns
      .map((pattern) => pattern.exec(jobDescription))
      .filter((match): match is RegExpExecArray => match !== null)
      .sort((a, b) => a.index - b.index);
    if (matches.length > 0) cues.push({ id: entry.id, label: entry.label[locale], evidence: matches[0][0] });
  }
  return cues;
}
