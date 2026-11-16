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
// Each category has an English pattern (word boundaries) and a Korean pattern (Hangul has no \b).
const RULES: ReadonlyArray<[PolicyCategory, RegExp[]]> = [
  [
    "protected-trait",
    [
      /\b(rac(e|es|ial)|ethnic\w*|skin (tone|colou?r)|religio\w*|gender\w*|sex|sexual\w*|male|female|wom[ae]n|men|man|girl|boy|feminine|masculine|lad(y|ies)|gentlem[ae]n|he|she|his|her|hers|disab\w*|pregnan\w*|nationality|age|ages|aged|years old|\d{2}s|young\w*|elderly|old|older)\b/i,
      /(인종|민족|피부\s*(톤|색)|종교|성별|남성|여성|남자|여자|숙녀|젠틀맨|장애|임신|국적|나이|연령|젊|늙|노인|\d+\s*세|\d+대)/,
    ],
  ],
  [
    "medical",
    [
      /\b(acne|wrinkl\w*|blemish\w*|rosacea|eczema|psoriasis|skin|pores?|dark circles|under-?eyes?|spots?|pimples?|breakouts?|blackheads?|scars?|redness|oily|complexion|dermatolog\w*|diagnos\w*|disease\w*|illness\w*|sick\w*|symptom\w*|medical\w*|health\w*|tired|unwell|weight|overweight|obes\w*|bmi)\b/i,
      /(여드름|주름|잡티|기미|피부|모공|다크서클|홍조|트러블(?!\s*슈팅)|각질|피지|뾰루지|흉터|진단|질환|질병|증상|의학|의료|건강|피곤|체중|비만)/,
    ],
  ],
  [
    "attractiveness",
    [
      /\b(attractiv\w*|beaut\w*|ugly|pretty|handsome|hot|sexy|good-looking|gorgeous|flatter\w*|score\w*|symmetr\w*|proportion\w*|golden ratio|face shape|facial (ratio|feature|structure)s?)\b|\b\d+\s*(\/|out of)\s*10\b/i,
      /(매력|아름답|아름다운|예쁘|예쁜|못생|잘생|섹시|외모|점수|대칭|황금비|얼굴형|이목구비|\d+\s*점)/,
    ],
  ],
  [
    "personality",
    [
      /\b(personality|introvert\w*|extrovert\w*|trustworth\w*|honest\w*|dishonest\w*|competen\w*|intelligen\w*|confiden\w*|charisma\w*|likeab\w*)\b/i,
      /(성격|내향|외향|신뢰감|믿음직|정직|유능|지적인|자신감|카리스마|호감)/,
    ],
  ],
  [
    "emotion",
    [
      /\b(emotion\w*|nervous\w*|anxi\w*|happy|happiness|sad|sadness|angry|anger|stress\w*|mood|upset|fear\w*)\b/i,
      /(감정|긴장|불안|행복|슬퍼|슬픈|화나|화난|스트레스|기분|두려|초조)/,
    ],
  ],
  [
    "hiring",
    [
      /\b(hire[ds]?|hiring|hireab\w*|employab\w*|get (the|this) job|land (the|this) job|chances? of (success|being|getting)|top candidate\w*|rank(ed|ing|s)?|interview success|succeed\w*|(recruiters|interviewers|employers) will)\b/i,
      /(채용|합격|불합격|고용|취업\s*가능|면접\s*성공|순위|등수|상위\s*후보|뽑힐)/,
    ],
  ],
];

export function findPolicyViolation(text: string): PolicyCategory | null {
  for (const [category, patterns] of RULES) if (patterns.some((pattern) => pattern.test(text))) return category;
  return null;
}

export function passesContentPolicy(text: string): boolean {
  return findPolicyViolation(text) === null;
}
