import {
  JOB_INSIGHT_FIELDS,
  passesContentPolicy,
  type Formality,
  type JobContext,
  type JobCue,
  type JobInsightField,
  type JobInsightPoint,
  type Locale,
} from "../../../../packages/contracts/src/index.ts";
import { cuePhrase, extractJobCues } from "./jobCues.ts";

/**
 * Deterministic job and company-atmosphere analysis (R1.4). Every finding is a
 * fixed catalog label backed by a verbatim excerpt of the posting, so job text
 * can only be searched, never followed as instructions (R1.3). This is also the
 * fallback whenever the AI provider is unavailable or rejected (R1.6).
 */

interface CatalogEntry {
  id: string;
  label: Record<Locale, string>;
  /** English patterns use word boundaries; Korean patterns cannot (Hangul has no \b). */
  patterns: RegExp[];
  formality?: Exclude<Formality, "unknown">;
}

const MAX_VALUE_LENGTH = 60;
const MAX_EVIDENCE_LENGTH = 120;

const INDUSTRIES: readonly CatalogEntry[] = [
  {
    id: "finance",
    label: { en: "Finance", ko: "금융" },
    patterns: [/\b(bank(?:ing)?|financ(?:e|ial)|investment|asset management|insurance|fintech|securities)\b/i, /(은행|금융|증권|보험|자산운용|투자|핀테크|카드사)/],
    formality: "formal",
  },
  {
    id: "legal",
    label: { en: "Legal", ko: "법률" },
    patterns: [/\b(law firm|legal|attorneys?|lawyers?)\b/i, /(법무|법률|로펌)/],
    formality: "formal",
  },
  {
    id: "consulting",
    label: { en: "Consulting", ko: "컨설팅" },
    patterns: [/\b(consulting|consultancy|advisory)\b/i, /(컨설팅|자문)/],
    formality: "formal",
  },
  {
    id: "accounting",
    label: { en: "Accounting", ko: "회계·세무" },
    patterns: [/\b(accounting|audit(?:ing)?|tax advisory)\b/i, /(회계|세무)/],
    formality: "formal",
  },
  {
    id: "public",
    label: { en: "Public sector", ko: "공공기관" },
    patterns: [/\b(government|public sector|civil service)\b/i, /(공공기관|공기업|공무원|정부)/],
    formality: "formal",
  },
  {
    id: "creative",
    label: { en: "Design and media", ko: "디자인·미디어" },
    patterns: [/\b(agency|design studio|advertising|media|fashion|brand(?:ing)?|entertainment)\b/i, /(에이전시|광고|미디어|패션|브랜드|엔터테인먼트|콘텐츠)/],
    formality: "smart-casual",
  },
  {
    id: "technology",
    label: { en: "Technology", ko: "IT·소프트웨어" },
    patterns: [/\b(software|saas|tech company|technology company|platform)\b/i, /\bIT\b/, /(소프트웨어|플랫폼|테크|SaaS|IT\s*기업|IT\s*서비스)/],
    formality: "smart-casual",
  },
  {
    id: "healthcare",
    label: { en: "Hospitals and pharma", ko: "병원·제약" },
    patterns: [/\b(hospitals?|clinics?|pharma\w*|biotech)\b/i, /(병원|의원|제약|바이오)/],
  },
  {
    id: "retail",
    label: { en: "Retail and hospitality", ko: "유통·서비스" },
    patterns: [/\b(retail|hotels?|hospitality|restaurants?|airlines?)\b/i, /(유통|리테일|호텔|항공사|외식)/],
  },
  {
    id: "education",
    label: { en: "Education", ko: "교육" },
    patterns: [/\b(schools?|universit(?:y|ies)|education|tutoring)\b/i, /(학교|대학교|교육|학원)/],
  },
  {
    id: "manufacturing",
    label: { en: "Manufacturing", ko: "제조" },
    patterns: [/\b(manufactur\w*|factory|semiconductors?|automotive)\b/i, /(제조|반도체|자동차|공장)/],
  },
];

const ATMOSPHERES: readonly CatalogEntry[] = [
  {
    id: "relaxed",
    label: { en: "Relaxed and startup-like", ko: "자유롭고 수평적인 분위기" },
    patterns: [
      /\b(start-?ups?|early-stage|casual|relaxed|laid-back|flat (?:organization|structure|hierarchy)|flexible (?:hours|culture))\b/i,
      /(스타트업|수평적|자율적|캐주얼|유연한|자유로운|편안한)/,
    ],
    formality: "casual",
  },
  {
    id: "creative",
    label: { en: "Creative", ko: "창의적인 분위기" },
    patterns: [/\b(creative|innovative|design-led)\b/i, /(크리에이티브|창의적|창의)/],
    formality: "smart-casual",
  },
  {
    id: "formal",
    label: { en: "Formal and professional", ko: "격식 있는 분위기" },
    patterns: [/\b(formal|corporate|conservative|professional services|established firm)\b/i, /(격식|보수적|대기업|금융권)/],
    formality: "formal",
  },
  {
    id: "collaborative",
    label: { en: "Collaborative", ko: "협업 중심 분위기" },
    patterns: [/\b(collaborat\w*|team-oriented|cross-functional)\b/i, /(협업|팀워크)/],
  },
];

const INTERVIEW_FORMATS: readonly CatalogEntry[] = [
  {
    id: "video",
    label: { en: "Video interview", ko: "화상 면접" },
    patterns: [
      /\b(video (?:calls?|interviews?|meetings?)|(?:over|on|via) video|zoom|google meet|microsoft teams|webex|virtual interviews?|remote interviews?)\b/i,
      /(화상\s*(?:면접|통화|회의|미팅|인터뷰)|비대면\s*(?:면접|인터뷰)|줌\s*(?:면접|미팅))/,
    ],
  },
  {
    id: "in-person",
    label: { en: "In-person interview", ko: "대면 면접" },
    patterns: [/\b(on-?site interviews?|in[- ]person(?: interviews?)?|in the office)\b/i, /((?<!비)대면\s*면접|오프라인\s*면접|방문\s*면접)/],
  },
  {
    id: "phone",
    label: { en: "Phone interview", ko: "전화 면접" },
    patterns: [/\b(phone (?:interviews?|screens?|calls?))\b/i, /(전화\s*(?:면접|인터뷰))/],
  },
];

const DRESS_CODES: readonly CatalogEntry[] = [
  {
    id: "formal",
    label: { en: "Business formal", ko: "정장" },
    patterns: [/\b(business (?:formal|attire|professional)|formal (?:attire|dress)|suit and tie|wear a suit)\b/i, /(비즈니스\s*정장|정장|포멀)/],
    formality: "formal",
  },
  {
    id: "business-casual",
    label: { en: "Business casual", ko: "비즈니스 캐주얼" },
    patterns: [/\bbusiness casual\b/i, /(비즈니스\s*캐주얼|세미\s*정장)/],
    formality: "business-casual",
  },
  {
    id: "smart-casual",
    label: { en: "Smart casual", ko: "스마트 캐주얼" },
    patterns: [/\bsmart[- ]casual\b/i, /(스마트\s*캐주얼)/],
    formality: "smart-casual",
  },
  {
    id: "casual",
    label: { en: "Casual dress", ko: "자율 복장" },
    patterns: [
      /\b(casual dress(?: code)?|dress code:?\s*casual|relaxed dress(?: code)?|no dress code|jeans)\b/i,
      /(자율\s*복장|복장\s*자율|자유\s*복장|복장\s*자유|캐주얼\s*복장|편한\s*복장)/,
    ],
    formality: "casual",
  },
];

const TITLE_NOUNS =
  "engineer|developer|designer|manager|consultant|analyst|scientist|specialist|associate|coordinator|director|accountant|marketer|teller|nurse|lawyer|attorney|recruiter|representative|architect|researcher|writer|editor|producer|planner|administrator|officer|assistant|intern|teacher|practitioner|ambassador";
const ROLE_PATTERNS = [
  new RegExp(`\\b(?:[a-z][a-z+#./-]*\\s+){0,2}?(?:${TITLE_NOUNS})s?\\b`, "i"),
  /(?:[A-Za-z가-힣]+\s?)?(?:개발자|엔지니어|디자이너|매니저|컨설턴트|애널리스트|분석가|마케터|기획자|연구원|회계사|변호사|세무사|상담원|간호사|교사|강사|영업\s*담당자?)/,
];
/** Leading words that are part of a sentence, not of a job title. */
const ROLE_STOPWORDS = new Set([
  "a", "an", "the", "our", "we", "for", "as", "to", "of", "and", "with", "is", "are", "be", "join", "hiring", "seeking",
  "looking", "new", "your", "in", "at", "on", "now", "you", "i", "this", "that", "who", "will", "can", "by", "from",
]);

interface Match {
  text: string;
  index: number;
}

function earliest(text: string, patterns: RegExp[]): Match | null {
  let best: Match | null = null;
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match && (best === null || match.index < best.index)) best = { text: match[0], index: match.index };
  }
  return best;
}

function findEntry(text: string, catalog: readonly CatalogEntry[]): { entry: CatalogEntry; match: Match } | null {
  let best: { entry: CatalogEntry; match: Match } | null = null;
  for (const entry of catalog) {
    const match = earliest(text, entry.patterns);
    if (match && (best === null || match.index < best.match.index)) best = { entry, match };
  }
  return best;
}

function findRole(text: string): JobInsightPoint {
  const match = earliest(text, ROLE_PATTERNS);
  if (!match) return notStated("role");
  // Drop leading sentence words; what remains is still a verbatim slice of the posting.
  const words = match.text.split(/(\s+)/);
  let start = 0;
  while (start < words.length - 1 && (words[start].trim() === "" || ROLE_STOPWORDS.has(words[start].toLowerCase()))) start += 1;
  const title = words.slice(start).join("").trim();
  return title ? { id: "role", value: title, evidence: title } : notStated("role");
}

function notStated(id: JobInsightField): JobInsightPoint {
  return { id, value: null, evidence: null };
}

function catalogPoint(id: JobInsightField, found: { entry: CatalogEntry; match: Match } | null, locale: Locale): JobInsightPoint {
  return found ? { id, value: found.entry.label[locale], evidence: found.match.text } : notStated(id);
}

const CUE_FORMALITY: ReadonlyArray<[string, Exclude<Formality, "unknown">]> = [
  ["formal-industry", "formal"],
  ["client-facing", "business-casual"],
  ["casual-workplace", "casual"],
  ["creative-industry", "smart-casual"],
  ["technical-role", "smart-casual"],
];

function resolveFormality(
  dressCode: CatalogEntry | undefined,
  atmosphere: CatalogEntry | undefined,
  industry: CatalogEntry | undefined,
  cues: JobCue[],
): Formality {
  const explicit = dressCode?.formality ?? atmosphere?.formality ?? industry?.formality;
  if (explicit) return explicit;
  const ids = new Set(cues.map((cue) => cue.id));
  return CUE_FORMALITY.find(([id]) => ids.has(id))?.[1] ?? "unknown";
}

const SUMMARY: Record<Locale, { none: string; found: (parts: string[]) => string; cuesOnly: (phrases: string[]) => string }> = {
  en: {
    none: "No specific presentation cues were found in the job description.",
    found: (parts) => `The posting points to ${joinEnglish(parts)}.`,
    cuesOnly: (phrases) => `The job description mentions ${joinEnglish(phrases)}.`,
  },
  ko: {
    none: "공고에서 특별한 단서를 찾지 못했어요.",
    found: (parts) => `공고에서 ${parts.join(", ")} 내용을 읽었어요.`,
    cuesOnly: (phrases) => `공고에서 ${phrases.join(", ")} 내용을 확인했어요.`,
  },
};

function joinEnglish(parts: string[]): string {
  return parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function summaryPart(point: JobInsightPoint, locale: Locale): string | null {
  if (point.value === null) return null;
  if (locale === "ko") return point.value;
  const value = point.value.toLowerCase();
  switch (point.id) {
    case "role":
      return `a ${point.value} role`.replace(/^a ([aeiou])/i, "an $1");
    case "industry":
      return `the ${value} industry`;
    case "atmosphere":
      return `a ${value} atmosphere`;
    case "interview-format":
      return `an ${value}`.replace(/^an ([^aeiou])/i, "a $1");
    case "dress-code":
      return `${value} attire`;
  }
}

/** Summary sentence built only from catalog labels and verbatim titles. */
export function summarizeJobContext(points: JobInsightPoint[], cues: JobCue[], locale: Locale): string {
  const copy = SUMMARY[locale];
  const parts = points.map((point) => summaryPart(point, locale)).filter((part): part is string => part !== null);
  if (parts.length > 0) return copy.found(parts);
  if (cues.length > 0) return copy.cuesOnly(cues.map((cue) => cuePhrase(cue, locale)));
  return copy.none;
}

export function analyzeJobRules(jobDescription: string, locale: Locale = "en"): JobContext {
  const cues = extractJobCues(jobDescription, locale);
  const industry = findEntry(jobDescription, INDUSTRIES);
  const atmosphere = findEntry(jobDescription, ATMOSPHERES);
  const format = findEntry(jobDescription, INTERVIEW_FORMATS);
  const dressCode = findEntry(jobDescription, DRESS_CODES);

  const points: JobInsightPoint[] = [
    findRole(jobDescription),
    catalogPoint("industry", industry, locale),
    catalogPoint("atmosphere", atmosphere, locale),
    catalogPoint("interview-format", format, locale),
    catalogPoint("dress-code", dressCode, locale),
  ];
  return checkJobContext(
    {
      summary: "",
      source: "rules",
      formality: resolveFormality(dressCode?.entry, atmosphere?.entry, industry?.entry, cues),
      points,
      cues,
    },
    jobDescription,
    locale,
  );
}

const collapse = (text: string) => text.replace(/\s+/g, " ").trim();

/** True when `evidence` appears in the posting, ignoring whitespace differences. */
export function isVerbatim(evidence: string, jobDescription: string): boolean {
  const needle = collapse(evidence);
  return needle.length > 0 && collapse(jobDescription).toLowerCase().includes(needle.toLowerCase());
}

/**
 * Applies the content policy and evidence rules to any job analysis, rules or
 * AI: a point survives only with a verbatim quote and policy-compliant text;
 * otherwise it becomes "not stated". An unusable summary is rebuilt from what
 * survived (R1.4, R5.3).
 */
export function checkJobContext(raw: JobContext, jobDescription: string, locale: Locale): JobContext {
  const points = JOB_INSIGHT_FIELDS.map((id): JobInsightPoint => {
    const point = raw.points.find((candidate) => candidate.id === id);
    if (!point || point.value === null || point.evidence === null) return notStated(id);
    const value = collapse(point.value);
    const evidence = collapse(point.evidence);
    const usable =
      value.length > 0 &&
      value.length <= MAX_VALUE_LENGTH &&
      evidence.length <= MAX_EVIDENCE_LENGTH &&
      isVerbatim(evidence, jobDescription) &&
      passesContentPolicy(value) &&
      passesContentPolicy(evidence);
    return usable ? { id, value, evidence } : notStated(id);
  });
  const cues = raw.cues.filter(
    (cue) => passesContentPolicy(cue.label) && passesContentPolicy(cue.evidence) && isVerbatim(cue.evidence, jobDescription),
  );
  const summary = raw.summary && passesContentPolicy(raw.summary) ? raw.summary : summarizeJobContext(points, cues, locale);
  return { summary, source: raw.source, formality: raw.formality, points, cues };
}
