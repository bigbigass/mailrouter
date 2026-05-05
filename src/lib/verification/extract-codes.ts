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
  /verification\s+code/iu,
  /verify\s+code/iu,
  /\bcode\b/iu,
  /\botp\b/iu,
  /one[-\s]?time\s+password/iu,
];

const CODE_PATTERN = /\b[A-Z0-9]{4,8}\b/giu;
const DIGIT_PATTERN = /\b\d{4,8}\b/gu;

export function extractVerificationCodes(input: VerificationCodeInput): VerificationCodeCandidate[] {
  const combined = `${input.subject}\n${input.textBody}`.replace(/\s+/g, " ").trim();
  const candidates = new Map<string, VerificationCodeCandidate>();

  addCandidates(candidates, combined, CODE_PATTERN, true);
  addCandidates(candidates, combined, DIGIT_PATTERN, false);

  return Array.from(candidates.values())
    .filter((candidate) => candidate.confidence >= 40)
    .sort((a, b) => b.confidence - a.confidence || a.code.localeCompare(b.code));
}

function addCandidates(
  candidates: Map<string, VerificationCodeCandidate>,
  text: string,
  pattern: RegExp,
  allowAlpha: boolean,
) {
  for (const match of text.matchAll(pattern)) {
    const code = match[0].toUpperCase();

    if (!allowAlpha && !/^\d+$/.test(code)) {
      continue;
    }

    if (/^\d{4}$/.test(code) && looksLikeYear(code)) {
      continue;
    }

    const index = match.index ?? 0;
    const start = Math.max(0, index - 60);
    const end = Math.min(text.length, index + code.length + 60);
    const context = text.slice(start, end).trim();
    const confidence = scoreCandidate(code, context, index - start, index);
    const existing = candidates.get(code);

    if (!existing || confidence > existing.confidence) {
      candidates.set(code, { code, confidence, context });
    }
  }
}

function scoreCandidate(code: string, context: string, contextIndex: number, index: number): number {
  const hasContext = hasNearbyContext(context, contextIndex, code.length);
  const isDigits = /^\d+$/.test(code);
  const lengthScore = code.length === 6 ? 20 : code.length >= 4 && code.length <= 8 ? 10 : 0;
  const contextScore = hasContext ? 70 : isDigits ? 35 : 0;
  const positionScore = index < 160 ? 10 : 0;
  const alphaPenalty = !isDigits && !hasContext ? 50 : 0;

  return Math.max(0, Math.min(100, contextScore + lengthScore + positionScore - alphaPenalty));
}

function looksLikeYear(code: string): boolean {
  const year = Number(code);
  return year >= 1990 && year <= 2099;
}

function hasNearbyContext(context: string, codeIndex: number, codeLength: number): boolean {
  const codeEnd = codeIndex + codeLength;

  return CONTEXT_PATTERNS.some((pattern) => {
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

      if (distance <= 16) {
        return true;
      }
    }

    return false;
  });
}
