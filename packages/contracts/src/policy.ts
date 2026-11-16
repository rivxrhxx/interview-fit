/**
 * Content policy for every user-visible generated string (R5.3, security-privacy
 * steering). Checked on the backend before results are stored and again on the
 * desktop before rendering. Patterns are deliberately broad: a blocked neutral
 * sentence costs one suggestion, while a missed claim harms the user.
 */
export type PolicyCategory =
  | "protected-trait"
  | "medical"
  | "attractiveness"
  | "personality"
  | "emotion"
  | "hiring";

// Order matters: protected traits are checked before medical so "skin tone" is reported as a trait.
const RULES: ReadonlyArray<[PolicyCategory, RegExp]> = [
  [
    "protected-trait",
    /\b(rac(e|es|ial)|ethnic\w*|skin (tone|colou?r)|religio\w*|gender\w*|sex|sexual\w*|male|female|wom[ae]n|men|man|girl|boy|disab\w*|pregnan\w*|nationality|age|ages|aged|years old|\d{2}s|young\w*|elderly|old|older)\b/i,
  ],
  [
    "medical",
    /\b(acne|wrinkl\w*|blemish\w*|rosacea|eczema|psoriasis|skin|pores?|dark circles|dermatolog\w*|diagnos\w*|disease\w*|illness\w*|sick\w*|symptom\w*|medical\w*|health\w*|tired|unwell|weight|overweight|obes\w*|bmi)\b/i,
  ],
  [
    "attractiveness",
    /\b(attractiv\w*|beaut\w*|ugly|pretty|handsome|hot|sexy|good-looking|gorgeous|flatter\w*|score\w*|symmetr\w*|proportion\w*|golden ratio|face shape|facial (ratio|feature|structure)s?)\b|\b\d+\s*(\/|out of)\s*10\b/i,
  ],
  [
    "personality",
    /\b(personality|introvert\w*|extrovert\w*|trustworth\w*|honest\w*|dishonest\w*|competen\w*|intelligen\w*|confiden\w*|charisma\w*|likeab\w*)\b/i,
  ],
  ["emotion", /\b(emotion\w*|nervous\w*|anxi\w*|happy|happiness|sad|sadness|angry|anger|stress\w*|mood|upset|fear\w*)\b/i],
  [
    "hiring",
    /\b(hire[ds]?|hiring|hireab\w*|employab\w*|get (the|this) job|land (the|this) job|chances? of (success|being|getting)|top candidate\w*|rank(ed|ing|s)?|interview success|succeed\w*|(recruiters|interviewers|employers) will)\b/i,
  ],
];

export function findPolicyViolation(text: string): PolicyCategory | null {
  for (const [category, pattern] of RULES) if (pattern.test(text)) return category;
  return null;
}

export function passesContentPolicy(text: string): boolean {
  return findPolicyViolation(text) === null;
}
