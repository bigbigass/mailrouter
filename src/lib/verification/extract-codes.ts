export type VerificationCodeInput = {
  subject: string;
  textBody: string;
};

export type VerificationCodeCandidate = {
  code: string;
  confidence: number;
  context: string;
};

const CONTEXT_PATTERNS = [
  /验证码/iu,
  /驗證碼/iu,
  /校验码/iu,
  /动态码/iu,
  /认证码/iu,
  /登录码/iu,
  /一次性密码/iu,
  /verification\s+code/iu,
  /verify\s+code/iu,
  /security\s+code/iu,
  /login\s+code/iu,
  /authentication\s+code/iu,
  /\bcode\b/iu,
  /\botp\b/iu,
  /one[-\s]?time\s+password/iu,
  /\bpasscode\b/iu,
  /\bpin\b/iu,
  /\b2fa\b/iu,
  /two[-\s]?factor/iu,
  /to\s+verify/iu,
];

const MAX_CANDIDATES = 5;
const MIN_CONFIDENCE = 40;
const CODE_PATTERN = /\b[A-Z0-9]{4,8}\b/giu;
const SEPARATED_DIGIT_PATTERN = /\b\d{3,4}-\d{3,4}\b/gu;
const DIGIT_PATTERN = /\b\d{4,8}\b/gu;

export function extractVerificationCodes(input: VerificationCodeInput): VerificationCodeCandidate[] {
  const combined = `${input.subject}\n${input.textBody}`.replace(/\s+/g, " ").trim();
  const candidates = new Map<string, VerificationCodeCandidate>();

  if (!combined) {
    return [];
  }

  addCandidates(candidates, combined, CODE_PATTERN, true);
  addCandidates(candidates, combined, SEPARATED_DIGIT_PATTERN, false);
  addCandidates(candidates, combined, DIGIT_PATTERN, false);

  return Array.from(candidates.values())
    .filter((candidate) => candidate.confidence >= MIN_CONFIDENCE)
    .sort((a, b) => b.confidence - a.confidence || a.code.localeCompare(b.code))
    .slice(0, MAX_CANDIDATES);
}

function addCandidates(
  candidates: Map<string, VerificationCodeCandidate>,
  text: string,
  pattern: RegExp,
  allowAlpha: boolean,
) {
  for (const match of text.matchAll(pattern)) {
    const rawCode = match[0];
    const code = rawCode.replace("-", "").toUpperCase();

    if (!isValidCode(code, allowAlpha)) {
      continue;
    }

    if (/^\d{4}$/.test(code) && looksLikeYear(code)) {
      continue;
    }

    const index = match.index ?? 0;
    const start = Math.max(0, index - 60);
    const end = Math.min(text.length, index + rawCode.length + 60);
    const context = text.slice(start, end).trim();
    const confidence = scoreCandidate(code, context, index - start, rawCode.length, index);
    const existing = candidates.get(code);

    if (!existing || confidence > existing.confidence) {
      candidates.set(code, { code, confidence, context });
    }
  }
}

function scoreCandidate(
  code: string,
  context: string,
  contextIndex: number,
  rawCodeLength: number,
  index: number,
): number {
  const contextDistance = getNearbyContextDistance(context, contextIndex, rawCodeLength);

  if (contextDistance === null) {
    return 0;
  }

  const lengthScore = code.length === 6 ? 20 : code.length >= 4 && code.length <= 8 ? 10 : 0;
  const contextScore = 60;
  const proximityScore = contextDistance <= 8 ? 10 : contextDistance <= 16 ? 5 : 0;
  const positionScore = index < 160 ? 10 : 0;

  return Math.max(0, Math.min(100, contextScore + lengthScore + proximityScore + positionScore));
}

function isValidCode(code: string, allowAlpha: boolean): boolean {
  if (!/^[A-Z0-9]{4,8}$/.test(code)) {
    return false;
  }

  if (/^\d+$/.test(code)) {
    return true;
  }

  return allowAlpha && /[A-Z]/.test(code) && /\d/.test(code);
}

function looksLikeYear(code: string): boolean {
  const year = Number(code);
  return year >= 1990 && year <= 2099;
}

function getNearbyContextDistance(context: string, codeIndex: number, codeLength: number): number | null {
  const codeEnd = codeIndex + codeLength;
  let nearestDistance: number | null = null;

  for (const pattern of CONTEXT_PATTERNS) {
    const globalPattern = new RegExp(
      pattern.source,
      pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`,
    );

    for (const match of context.matchAll(globalPattern)) {
      const matchStart = match.index ?? 0;
      const matchEnd = matchStart + match[0].length;
      const distance =
        matchEnd <= codeIndex
          ? codeIndex - matchEnd
          : matchStart >= codeEnd
            ? matchStart - codeEnd
            : 0;

      if (distance <= 24) {
        nearestDistance = nearestDistance === null ? distance : Math.min(nearestDistance, distance);
      }
    }
  }

  return nearestDistance;
}
