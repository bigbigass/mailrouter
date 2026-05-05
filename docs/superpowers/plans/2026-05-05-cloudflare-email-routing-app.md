# Cloudflare Email Routing Verification App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js web app where users can create long-lived Cloudflare Email Routing addresses, receive verification emails through an Email Worker, and view extracted verification codes.

**Architecture:** The Next.js app owns authentication, PostgreSQL persistence, Cloudflare Email Routing rule management, verification-code extraction, and user-facing pages. A Cloudflare Email Worker receives routed mail, parses message fields, signs an ingest request, and posts it to the app. The app stores messages and extracted code candidates in PostgreSQL; Cloudflare is used for routing, not message storage.

**Tech Stack:** Next.js App Router, TypeScript, PostgreSQL, Prisma, Vitest, Zod, bcryptjs, jose, Cloudflare Workers, Wrangler, postal-mime.

---

## Source References

- Cloudflare Email Routing Rules API: `https://developers.cloudflare.com/api/resources/email_routing/subresources/rules/`
- Cloudflare Email Workers overview: `https://developers.cloudflare.com/email-routing/email-workers/`
- Cloudflare Workers EmailMessage runtime API: `https://developers.cloudflare.com/workers/runtime-apis/email/`

## Scope Check

The spec contains two tightly coupled parts: the web app and the Email Worker. They are planned together because the MVP is only useful when a real routed email reaches the Worker and appears in the user mailbox UI. Each task still has a narrow boundary and its own verification command.

## File Structure

Create this structure:

```text
.
├── .env.example
├── .gitignore
├── package.json
├── prisma/
│   └── schema.prisma
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   ├── login/route.ts
│   │   │   │   ├── logout/route.ts
│   │   │   │   └── register/route.ts
│   │   │   ├── email/ingest/route.ts
│   │   │   ├── mailboxes/[id]/messages/route.ts
│   │   │   ├── mailboxes/[id]/route.ts
│   │   │   ├── mailboxes/route.ts
│   │   │   └── messages/[id]/route.ts
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   ├── mailboxes/[id]/page.tsx
│   │   ├── mailboxes/page.tsx
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── auth-form.tsx
│   │   ├── copy-button.tsx
│   │   ├── mailbox-create-form.tsx
│   │   ├── mailbox-list.tsx
│   │   └── message-list.tsx
│   └── lib/
│       ├── auth/
│       │   ├── current-user.ts
│       │   ├── password.ts
│       │   └── session.ts
│       ├── cloudflare/
│       │   └── email-routing-client.ts
│       ├── email/
│       │   ├── ingest-service.ts
│       │   └── ingest-signature.ts
│       ├── mailboxes/
│       │   └── mailbox-service.ts
│       ├── validation/
│       │   └── mailbox.ts
│       ├── verification/
│       │   └── extract-codes.ts
│       ├── db.ts
│       └── env.ts
├── tests/
│   ├── cloudflare/email-routing-client.test.ts
│   ├── email/ingest-service.test.ts
│   ├── email/ingest-signature.test.ts
│   ├── mailboxes/mailbox-service.test.ts
│   └── verification/extract-codes.test.ts
├── vitest.config.ts
├── vitest.setup.ts
└── worker/
    ├── package.json
    ├── src/
    │   ├── index.ts
    │   ├── parse-email.ts
    │   └── sign-ingest.ts
    ├── tests/
    │   ├── parse-email.test.ts
    │   └── sign-ingest.test.ts
    ├── tsconfig.json
    ├── vitest.config.ts
    └── wrangler.toml
```

Responsibilities:

- `src/lib/verification/extract-codes.ts`: deterministic verification-code extraction only.
- `src/lib/cloudflare/email-routing-client.ts`: typed Cloudflare Email Routing Rules API calls only.
- `src/lib/mailboxes/mailbox-service.ts`: mailbox validation, quota, Cloudflare rule creation, and database state transitions.
- `src/lib/email/ingest-signature.ts`: HMAC validation for Worker-to-app ingest only.
- `src/lib/email/ingest-service.ts`: recipient lookup, message storage, code extraction, and audit logging.
- `src/app/api/**/route.ts`: thin HTTP adapters around library functions.
- `worker/src/**`: Cloudflare Email Worker parsing and signed ingest forwarding.

---

### Task 1: Initialize The Project

**Files:**
- Create: `.gitignore`
- Create: `.env.example`
- Create: `package.json`
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`

- [ ] **Step 1: Initialize git and Next.js**

Run:

```powershell
git init
npx create-next-app@latest . --typescript --eslint --app --src-dir --no-tailwind --use-npm --import-alias "@/*"
```

Expected:

```text
Initialized empty Git repository
Success! Created email
```

- [ ] **Step 2: Install runtime dependencies**

Run:

```powershell
npm install @prisma/client bcryptjs jose zod
npm install -D prisma vitest @vitest/coverage-v8 @testing-library/react @testing-library/jest-dom jsdom
```

Expected: npm exits with code 0 and updates `package-lock.json`.

- [ ] **Step 3: Replace `package.json` scripts**

Modify `package.json` so the scripts section is:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "prisma generate && next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "worker:test": "npm --prefix worker test"
  }
}
```

Keep the dependency sections generated by npm.

- [ ] **Step 4: Add `.gitignore` entries**

Ensure `.gitignore` contains:

```gitignore
node_modules
.next
out
.vercel
.env
.env.local
.env.*.local
coverage
worker/dist
worker/.wrangler
```

- [ ] **Step 5: Add `.env.example`**

Create `.env.example`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/email_app?schema=public"
APP_BASE_URL="http://localhost:3000"
SESSION_SECRET="replace-with-32-byte-random-secret"
INGEST_SECRET="replace-with-separate-32-byte-random-secret"
CLOUDFLARE_API_TOKEN="replace-with-cloudflare-token"
CLOUDFLARE_ACCOUNT_ID="replace-with-account-id"
CLOUDFLARE_ZONE_ID="replace-with-zone-id"
EMAIL_DOMAIN="example.com"
MAX_ACTIVE_MAILBOXES_PER_USER="5"
MAX_INGEST_BODY_BYTES="1048576"
```

- [ ] **Step 6: Add Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
});
```

Create `vitest.setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 7: Verify base project**

Run:

```powershell
npm run test
npm run build
```

Expected:

```text
No test files found
Compiled successfully
```

The exact test command may exit with no tests found. If Vitest exits non-zero because no tests exist, add Task 2 tests before re-running.

- [ ] **Step 8: Commit**

Run:

```powershell
git add .
git commit -m "chore: initialize next app"
```

Expected: git creates the initial commit.

---

### Task 2: Add Environment Validation And Database Client

**Files:**
- Create: `src/lib/env.ts`
- Create: `src/lib/db.ts`
- Test: `tests/env.test.ts`

- [ ] **Step 1: Write failing env tests**

Create `tests/env.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

describe("parseEnv", () => {
  it("parses valid environment variables", () => {
    const env = parseEnv({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/email_app",
      APP_BASE_URL: "https://app.example.com",
      SESSION_SECRET: "a".repeat(32),
      INGEST_SECRET: "b".repeat(32),
      CLOUDFLARE_API_TOKEN: "token",
      CLOUDFLARE_ACCOUNT_ID: "account",
      CLOUDFLARE_ZONE_ID: "zone",
      EMAIL_DOMAIN: "example.com",
      MAX_ACTIVE_MAILBOXES_PER_USER: "5",
      MAX_INGEST_BODY_BYTES: "1048576",
    });

    expect(env.EMAIL_DOMAIN).toBe("example.com");
    expect(env.MAX_ACTIVE_MAILBOXES_PER_USER).toBe(5);
  });

  it("rejects short secrets", () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/email_app",
        APP_BASE_URL: "https://app.example.com",
        SESSION_SECRET: "short",
        INGEST_SECRET: "b".repeat(32),
        CLOUDFLARE_API_TOKEN: "token",
        CLOUDFLARE_ACCOUNT_ID: "account",
        CLOUDFLARE_ZONE_ID: "zone",
        EMAIL_DOMAIN: "example.com",
        MAX_ACTIVE_MAILBOXES_PER_USER: "5",
        MAX_INGEST_BODY_BYTES: "1048576",
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm run test -- tests/env.test.ts
```

Expected: FAIL because `src/lib/env.ts` does not exist.

- [ ] **Step 3: Implement environment parsing**

Create `src/lib/env.ts`:

```ts
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  APP_BASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  INGEST_SECRET: z.string().min(32),
  CLOUDFLARE_API_TOKEN: z.string().min(1),
  CLOUDFLARE_ACCOUNT_ID: z.string().min(1),
  CLOUDFLARE_ZONE_ID: z.string().min(1),
  EMAIL_DOMAIN: z
    .string()
    .min(3)
    .regex(/^[a-z0-9.-]+$/),
  MAX_ACTIVE_MAILBOXES_PER_USER: z.coerce.number().int().min(1).max(200),
  MAX_INGEST_BODY_BYTES: z.coerce.number().int().min(1024).max(5 * 1024 * 1024),
});

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(input: NodeJS.ProcessEnv): AppEnv {
  return envSchema.parse(input);
}

export const env = parseEnv(process.env);
```

Create `src/lib/db.ts`:

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
npm run test -- tests/env.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/lib/env.ts src/lib/db.ts tests/env.test.ts
git commit -m "chore: validate app environment"
```

Expected: git creates the commit.

---

### Task 3: Add Prisma Schema

**Files:**
- Create: `prisma/schema.prisma`

- [ ] **Step 1: Write Prisma schema**

Create `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum UserRole {
  USER
  ADMIN
}

enum MailboxStatus {
  ACTIVE
  DISABLING
  DISABLED
}

enum AuditEventType {
  USER_REGISTERED
  LOGIN_FAILED
  MAILBOX_CREATED
  MAILBOX_CREATE_FAILED
  MAILBOX_DISABLE_STARTED
  MAILBOX_DISABLED
  MAILBOX_DISABLE_FAILED
  INGEST_SIGNATURE_FAILED
  INGEST_UNKNOWN_RECIPIENT
  INGEST_MESSAGE_STORED
}

model User {
  id           String    @id @default(cuid())
  email        String    @unique
  passwordHash String
  role         UserRole  @default(USER)
  createdAt    DateTime  @default(now())
  disabledAt   DateTime?

  mailboxes Mailbox[]
  auditLogs AuditLog[]

  @@map("users")
}

model Mailbox {
  id               String        @id @default(cuid())
  userId           String
  localPart        String
  domain           String
  address          String        @unique
  status           MailboxStatus @default(ACTIVE)
  cloudflareRuleId String?
  createdAt        DateTime      @default(now())
  disabledAt       DateTime?

  user              User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages          Message[]
  verificationCodes VerificationCode[]

  @@index([userId, status])
  @@index([address])
  @@map("mailboxes")
}

model Message {
  id          String   @id @default(cuid())
  mailboxId   String
  messageId   String?
  fromAddress String
  toAddress   String
  subject     String
  textBody    String   @db.Text
  htmlBody    String?  @db.Text
  receivedAt  DateTime @default(now())
  rawSize     Int

  mailbox           Mailbox            @relation(fields: [mailboxId], references: [id], onDelete: Cascade)
  verificationCodes VerificationCode[]

  @@index([mailboxId, receivedAt])
  @@index([messageId])
  @@map("messages")
}

model VerificationCode {
  id        String   @id @default(cuid())
  messageId String
  mailboxId String
  code      String
  confidence Int
  context   String
  createdAt DateTime @default(now())

  message Message @relation(fields: [messageId], references: [id], onDelete: Cascade)
  mailbox Mailbox @relation(fields: [mailboxId], references: [id], onDelete: Cascade)

  @@index([mailboxId, createdAt])
  @@index([messageId, confidence])
  @@map("verification_codes")
}

model AuditLog {
  id        String         @id @default(cuid())
  userId    String?
  eventType AuditEventType
  message   String
  metadata  Json?
  createdAt DateTime       @default(now())

  user User? @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([userId, createdAt])
  @@index([eventType, createdAt])
  @@map("audit_logs")
}
```

- [ ] **Step 2: Generate Prisma client**

Run:

```powershell
npm run prisma:generate
```

Expected: Prisma Client is generated successfully.

- [ ] **Step 3: Run migration**

Run this after `DATABASE_URL` points at a local PostgreSQL database:

```powershell
npm run prisma:migrate -- --name init
```

Expected: Prisma creates a migration under `prisma/migrations` and applies it to the local database.

- [ ] **Step 4: Commit**

Run:

```powershell
git add prisma/schema.prisma prisma/migrations package-lock.json package.json
git commit -m "feat: add database schema"
```

Expected: git creates the commit.

---

### Task 4: Add Mailbox Validation

**Files:**
- Create: `src/lib/validation/mailbox.ts`
- Test: `tests/mailboxes/mailbox-validation.test.ts`

- [ ] **Step 1: Write failing validation tests**

Create `tests/mailboxes/mailbox-validation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildMailboxAddress, validateLocalPart } from "@/lib/validation/mailbox";

describe("validateLocalPart", () => {
  it("accepts lowercase letters, digits, and hyphens", () => {
    expect(validateLocalPart("user-123")).toEqual({ ok: true, value: "user-123" });
  });

  it("normalizes uppercase input", () => {
    expect(validateLocalPart("User-123")).toEqual({ ok: true, value: "user-123" });
  });

  it("rejects reserved local parts", () => {
    expect(validateLocalPart("admin")).toEqual({
      ok: false,
      error: "This address name is reserved.",
    });
  });

  it("rejects invalid characters", () => {
    expect(validateLocalPart("bad.name")).toEqual({
      ok: false,
      error: "Use lowercase letters, numbers, and hyphens only.",
    });
  });
});

describe("buildMailboxAddress", () => {
  it("builds a full address", () => {
    expect(buildMailboxAddress("user-123", "example.com")).toBe("user-123@example.com");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm run test -- tests/mailboxes/mailbox-validation.test.ts
```

Expected: FAIL because the validation module does not exist.

- [ ] **Step 3: Implement validation**

Create `src/lib/validation/mailbox.ts`:

```ts
const RESERVED_LOCAL_PARTS = new Set(["admin", "root", "postmaster", "abuse", "support"]);

export type LocalPartValidationResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

export function validateLocalPart(input: string): LocalPartValidationResult {
  const value = input.trim().toLowerCase();

  if (value.length < 3 || value.length > 32) {
    return { ok: false, error: "Use 3 to 32 characters." };
  }

  if (!/^[a-z0-9-]+$/.test(value)) {
    return { ok: false, error: "Use lowercase letters, numbers, and hyphens only." };
  }

  if (value.startsWith("-") || value.endsWith("-") || value.includes("--")) {
    return { ok: false, error: "Hyphens cannot start, end, or repeat." };
  }

  if (RESERVED_LOCAL_PARTS.has(value)) {
    return { ok: false, error: "This address name is reserved." };
  }

  return { ok: true, value };
}

export function buildMailboxAddress(localPart: string, domain: string): string {
  return `${localPart}@${domain}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
npm run test -- tests/mailboxes/mailbox-validation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/lib/validation/mailbox.ts tests/mailboxes/mailbox-validation.test.ts
git commit -m "feat: validate mailbox addresses"
```

Expected: git creates the commit.

---

### Task 5: Add Verification-Code Extraction

**Files:**
- Create: `src/lib/verification/extract-codes.ts`
- Test: `tests/verification/extract-codes.test.ts`

- [ ] **Step 1: Write failing extraction tests**

Create `tests/verification/extract-codes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { extractVerificationCodes } from "@/lib/verification/extract-codes";

describe("extractVerificationCodes", () => {
  it("extracts a Chinese verification code", () => {
    const codes = extractVerificationCodes({
      subject: "登录验证码",
      textBody: "您的验证码是 438921，请在 10 分钟内使用。",
    });

    expect(codes[0]).toMatchObject({ code: "438921" });
    expect(codes[0].confidence).toBeGreaterThanOrEqual(90);
  });

  it("extracts an English OTP code", () => {
    const codes = extractVerificationCodes({
      subject: "Your verification code",
      textBody: "Use verification code 827364 to continue.",
    });

    expect(codes[0]).toMatchObject({ code: "827364" });
  });

  it("prefers code context over an order number", () => {
    const codes = extractVerificationCodes({
      subject: "Receipt 123456",
      textBody: "Order 123456 is paid. Your login code is 991244.",
    });

    expect(codes[0].code).toBe("991244");
  });

  it("supports alphanumeric codes when context is strong", () => {
    const codes = extractVerificationCodes({
      subject: "One-time password",
      textBody: "Your OTP is AB12CD.",
    });

    expect(codes[0].code).toBe("AB12CD");
  });

  it("returns an empty list when no candidate exists", () => {
    const codes = extractVerificationCodes({
      subject: "Welcome",
      textBody: "Thanks for signing up.",
    });

    expect(codes).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm run test -- tests/verification/extract-codes.test.ts
```

Expected: FAIL because the extraction module does not exist.

- [ ] **Step 3: Implement extraction**

Create `src/lib/verification/extract-codes.ts`:

```ts
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
    const confidence = scoreCandidate(code, context, index);
    const existing = candidates.get(code);

    if (!existing || confidence > existing.confidence) {
      candidates.set(code, { code, confidence, context });
    }
  }
}

function scoreCandidate(code: string, context: string, index: number): number {
  const hasContext = CONTEXT_PATTERNS.some((pattern) => pattern.test(context));
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
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
npm run test -- tests/verification/extract-codes.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/lib/verification/extract-codes.ts tests/verification/extract-codes.test.ts
git commit -m "feat: extract verification codes"
```

Expected: git creates the commit.

---

### Task 6: Add Password And Session Utilities

**Files:**
- Create: `src/lib/auth/password.ts`
- Create: `src/lib/auth/session.ts`
- Test: `tests/auth/password.test.ts`
- Test: `tests/auth/session.test.ts`

- [ ] **Step 1: Write failing auth utility tests**

Create `tests/auth/password.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("password utilities", () => {
  it("hashes and verifies a password", async () => {
    const hash = await hashPassword("correct horse battery staple");

    expect(hash).not.toBe("correct horse battery staple");
    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong password", hash)).resolves.toBe(false);
  });
});
```

Create `tests/auth/session.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createSessionToken, verifySessionToken } from "@/lib/auth/session";

describe("session utilities", () => {
  const secret = "s".repeat(32);

  it("creates and verifies a session token", async () => {
    const token = await createSessionToken({ userId: "user_1", role: "USER" }, secret);
    const payload = await verifySessionToken(token, secret);

    expect(payload).toEqual({ userId: "user_1", role: "USER" });
  });

  it("rejects invalid tokens", async () => {
    await expect(verifySessionToken("bad-token", secret)).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm run test -- tests/auth/password.test.ts tests/auth/session.test.ts
```

Expected: FAIL because auth utility files do not exist.

- [ ] **Step 3: Implement password utilities**

Create `src/lib/auth/password.ts`:

```ts
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
```

Create `src/lib/auth/session.ts`:

```ts
import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE_NAME = "app_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type SessionRole = "USER" | "ADMIN";

export type SessionPayload = {
  userId: string;
  role: SessionRole;
};

export async function createSessionToken(payload: SessionPayload, secret: string): Promise<string> {
  const key = new TextEncoder().encode(secret);

  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(key);
}

export async function verifySessionToken(token: string, secret: string): Promise<SessionPayload | null> {
  try {
    const key = new TextEncoder().encode(secret);
    const result = await jwtVerify(token, key);
    const userId = result.payload.userId;
    const role = result.payload.role;

    if (typeof userId !== "string" || (role !== "USER" && role !== "ADMIN")) {
      return null;
    }

    return { userId, role };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
npm run test -- tests/auth/password.test.ts tests/auth/session.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/lib/auth/password.ts src/lib/auth/session.ts tests/auth/password.test.ts tests/auth/session.test.ts
git commit -m "feat: add auth primitives"
```

Expected: git creates the commit.

---

### Task 7: Add Cloudflare Email Routing Client

**Files:**
- Create: `src/lib/cloudflare/email-routing-client.ts`
- Test: `tests/cloudflare/email-routing-client.test.ts`

- [ ] **Step 1: Write failing Cloudflare client tests**

Create `tests/cloudflare/email-routing-client.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { CloudflareEmailRoutingClient } from "@/lib/cloudflare/email-routing-client";

describe("CloudflareEmailRoutingClient", () => {
  it("creates an email routing rule for a worker action", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          errors: [],
          messages: [],
          result: { id: "rule_123", enabled: true },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const client = new CloudflareEmailRoutingClient({
      apiToken: "token",
      zoneId: "zone",
      fetchFn: fetchMock,
    });

    const result = await client.createWorkerRule({
      address: "user@example.com",
      workerName: "email-worker",
    });

    expect(result).toEqual({ id: "rule_123" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/zones/zone/email/routing/rules",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
      }),
    );
  });

  it("throws a readable error when Cloudflare rejects the request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          errors: [{ code: 1000, message: "bad request" }],
          messages: [],
          result: null,
        }),
        { status: 400, headers: { "content-type": "application/json" } },
      ),
    );

    const client = new CloudflareEmailRoutingClient({
      apiToken: "token",
      zoneId: "zone",
      fetchFn: fetchMock,
    });

    await expect(
      client.createWorkerRule({ address: "user@example.com", workerName: "email-worker" }),
    ).rejects.toThrow("Cloudflare Email Routing API failed: 1000 bad request");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm run test -- tests/cloudflare/email-routing-client.test.ts
```

Expected: FAIL because the Cloudflare client does not exist.

- [ ] **Step 3: Implement Cloudflare client**

Create `src/lib/cloudflare/email-routing-client.ts`:

```ts
type FetchFn = typeof fetch;

type CloudflareClientOptions = {
  apiToken: string;
  zoneId: string;
  fetchFn?: FetchFn;
};

type CreateWorkerRuleInput = {
  address: string;
  workerName: string;
};

type CloudflareEnvelope<T> = {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: unknown[];
  result: T;
};

type CloudflareRuleResult = {
  id: string;
  enabled: boolean;
};

export class CloudflareEmailRoutingClient {
  private readonly apiToken: string;
  private readonly zoneId: string;
  private readonly fetchFn: FetchFn;

  constructor(options: CloudflareClientOptions) {
    this.apiToken = options.apiToken;
    this.zoneId = options.zoneId;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async createWorkerRule(input: CreateWorkerRuleInput): Promise<{ id: string }> {
    const envelope = await this.request<CloudflareRuleResult>("POST", "/email/routing/rules", {
      enabled: true,
      name: `Route ${input.address} to ${input.workerName}`,
      matchers: [
        {
          type: "literal",
          field: "to",
          value: input.address,
        },
      ],
      actions: [
        {
          type: "worker",
          value: [input.workerName],
        },
      ],
    });

    return { id: envelope.result.id };
  }

  async disableRule(ruleId: string): Promise<void> {
    await this.request<CloudflareRuleResult>("PATCH", `/email/routing/rules/${ruleId}`, {
      enabled: false,
    });
  }

  private async request<T>(method: string, path: string, body: unknown): Promise<CloudflareEnvelope<T>> {
    const response = await this.fetchFn(
      `https://api.cloudflare.com/client/v4/zones/${this.zoneId}${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    const envelope = (await response.json()) as CloudflareEnvelope<T>;

    if (!response.ok || !envelope.success) {
      const details = envelope.errors.map((error) => `${error.code} ${error.message}`).join("; ");
      throw new Error(`Cloudflare Email Routing API failed: ${details || response.statusText}`);
    }

    return envelope;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
npm run test -- tests/cloudflare/email-routing-client.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/lib/cloudflare/email-routing-client.ts tests/cloudflare/email-routing-client.test.ts
git commit -m "feat: add cloudflare email routing client"
```

Expected: git creates the commit.

---

### Task 8: Add Mailbox Service

**Files:**
- Create: `src/lib/mailboxes/mailbox-service.ts`
- Test: `tests/mailboxes/mailbox-service.test.ts`

- [ ] **Step 1: Write failing mailbox service tests**

Create `tests/mailboxes/mailbox-service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMailbox } from "@/lib/mailboxes/mailbox-service";

const db = {
  mailbox: {
    count: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
};

const cloudflare = {
  createWorkerRule: vi.fn(),
};

describe("createMailbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a mailbox after creating the Cloudflare rule", async () => {
    db.mailbox.count.mockResolvedValue(0);
    db.mailbox.findUnique.mockResolvedValue(null);
    cloudflare.createWorkerRule.mockResolvedValue({ id: "rule_123" });
    db.mailbox.create.mockResolvedValue({
      id: "mailbox_1",
      address: "user-123@example.com",
      cloudflareRuleId: "rule_123",
    });

    const mailbox = await createMailbox({
      userId: "user_1",
      requestedLocalPart: "User-123",
      domain: "example.com",
      maxActiveMailboxes: 5,
      workerName: "email-worker",
      db,
      cloudflare,
    });

    expect(mailbox.address).toBe("user-123@example.com");
    expect(cloudflare.createWorkerRule).toHaveBeenCalledWith({
      address: "user-123@example.com",
      workerName: "email-worker",
    });
  });

  it("rejects when the user has reached quota", async () => {
    db.mailbox.count.mockResolvedValue(5);

    await expect(
      createMailbox({
        userId: "user_1",
        requestedLocalPart: "user-123",
        domain: "example.com",
        maxActiveMailboxes: 5,
        workerName: "email-worker",
        db,
        cloudflare,
      }),
    ).rejects.toThrow("Mailbox quota reached.");
  });

  it("does not write an active mailbox when Cloudflare fails", async () => {
    db.mailbox.count.mockResolvedValue(0);
    db.mailbox.findUnique.mockResolvedValue(null);
    cloudflare.createWorkerRule.mockRejectedValue(new Error("Cloudflare failed"));

    await expect(
      createMailbox({
        userId: "user_1",
        requestedLocalPart: "user-123",
        domain: "example.com",
        maxActiveMailboxes: 5,
        workerName: "email-worker",
        db,
        cloudflare,
      }),
    ).rejects.toThrow("Mailbox creation failed.");

    expect(db.mailbox.create).not.toHaveBeenCalled();
    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: "MAILBOX_CREATE_FAILED" }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm run test -- tests/mailboxes/mailbox-service.test.ts
```

Expected: FAIL because the mailbox service does not exist.

- [ ] **Step 3: Implement mailbox service**

Create `src/lib/mailboxes/mailbox-service.ts`:

```ts
import { buildMailboxAddress, validateLocalPart } from "@/lib/validation/mailbox";

type MailboxDb = {
  mailbox: {
    count(args: unknown): Promise<number>;
    findUnique(args: unknown): Promise<unknown | null>;
    create(args: unknown): Promise<{ id: string; address: string; cloudflareRuleId: string | null }>;
    update?(args: unknown): Promise<unknown>;
  };
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
};

type CloudflareClient = {
  createWorkerRule(input: { address: string; workerName: string }): Promise<{ id: string }>;
  disableRule?(ruleId: string): Promise<void>;
};

type CreateMailboxInput = {
  userId: string;
  requestedLocalPart: string;
  domain: string;
  maxActiveMailboxes: number;
  workerName: string;
  db: MailboxDb;
  cloudflare: CloudflareClient;
};

export async function createMailbox(input: CreateMailboxInput) {
  const validation = validateLocalPart(input.requestedLocalPart);

  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const activeCount = await input.db.mailbox.count({
    where: { userId: input.userId, status: "ACTIVE" },
  });

  if (activeCount >= input.maxActiveMailboxes) {
    throw new Error("Mailbox quota reached.");
  }

  const address = buildMailboxAddress(validation.value, input.domain);
  const existing = await input.db.mailbox.findUnique({ where: { address } });

  if (existing) {
    throw new Error("Address is unavailable.");
  }

  let ruleId: string;

  try {
    const rule = await input.cloudflare.createWorkerRule({
      address,
      workerName: input.workerName,
    });
    ruleId = rule.id;
  } catch (error) {
    await input.db.auditLog.create({
      data: {
        userId: input.userId,
        eventType: "MAILBOX_CREATE_FAILED",
        message: "Cloudflare rule creation failed.",
        metadata: {
          address,
          error: error instanceof Error ? error.message : String(error),
        },
      },
    });
    throw new Error("Mailbox creation failed.");
  }

  const mailbox = await input.db.mailbox.create({
    data: {
      userId: input.userId,
      localPart: validation.value,
      domain: input.domain,
      address,
      status: "ACTIVE",
      cloudflareRuleId: ruleId,
    },
  });

  await input.db.auditLog.create({
    data: {
      userId: input.userId,
      eventType: "MAILBOX_CREATED",
      message: "Mailbox created.",
      metadata: { address, ruleId },
    },
  });

  return mailbox;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
npm run test -- tests/mailboxes/mailbox-service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/lib/mailboxes/mailbox-service.ts tests/mailboxes/mailbox-service.test.ts
git commit -m "feat: create mailboxes through cloudflare"
```

Expected: git creates the commit.

---

### Task 9: Add Ingest Signature Validation

**Files:**
- Create: `src/lib/email/ingest-signature.ts`
- Test: `tests/email/ingest-signature.test.ts`

- [ ] **Step 1: Write failing signature tests**

Create `tests/email/ingest-signature.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createIngestSignature, verifyIngestSignature } from "@/lib/email/ingest-signature";

describe("ingest signatures", () => {
  const secret = "i".repeat(32);
  const body = JSON.stringify({ to: "user@example.com" });

  it("verifies a valid signature", async () => {
    const timestamp = new Date().toISOString();
    const signature = await createIngestSignature({ timestamp, body, secret });

    await expect(
      verifyIngestSignature({
        timestamp,
        body,
        secret,
        signature,
        now: new Date(timestamp),
      }),
    ).resolves.toBe(true);
  });

  it("rejects an expired timestamp", async () => {
    const timestamp = "2026-05-05T00:00:00.000Z";
    const signature = await createIngestSignature({ timestamp, body, secret });

    await expect(
      verifyIngestSignature({
        timestamp,
        body,
        secret,
        signature,
        now: new Date("2026-05-05T00:06:01.000Z"),
      }),
    ).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm run test -- tests/email/ingest-signature.test.ts
```

Expected: FAIL because the signature module does not exist.

- [ ] **Step 3: Implement signature utilities**

Create `src/lib/email/ingest-signature.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_SKEW_MS = 5 * 60 * 1000;

type SignatureInput = {
  timestamp: string;
  body: string;
  secret: string;
};

export async function createIngestSignature(input: SignatureInput): Promise<string> {
  return createHmac("sha256", input.secret).update(`${input.timestamp}.${input.body}`).digest("hex");
}

type VerifySignatureInput = SignatureInput & {
  signature: string;
  now?: Date;
};

export async function verifyIngestSignature(input: VerifySignatureInput): Promise<boolean> {
  const timestampMs = Date.parse(input.timestamp);

  if (!Number.isFinite(timestampMs)) {
    return false;
  }

  const nowMs = (input.now ?? new Date()).getTime();

  if (Math.abs(nowMs - timestampMs) > MAX_SKEW_MS) {
    return false;
  }

  const expected = await createIngestSignature(input);
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(input.signature, "hex");

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
npm run test -- tests/email/ingest-signature.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/lib/email/ingest-signature.ts tests/email/ingest-signature.test.ts
git commit -m "feat: validate email ingest signatures"
```

Expected: git creates the commit.

---

### Task 10: Add Email Ingest Service

**Files:**
- Create: `src/lib/email/ingest-service.ts`
- Test: `tests/email/ingest-service.test.ts`

- [ ] **Step 1: Write failing ingest service tests**

Create `tests/email/ingest-service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ingestEmailMessage } from "@/lib/email/ingest-service";

const db = {
  mailbox: {
    findUnique: vi.fn(),
  },
  message: {
    create: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
};

describe("ingestEmailMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores a message and extracted code for an active mailbox", async () => {
    db.mailbox.findUnique.mockResolvedValue({
      id: "mailbox_1",
      address: "user@example.com",
      status: "ACTIVE",
      userId: "user_1",
    });
    db.message.create.mockResolvedValue({ id: "message_1" });

    const result = await ingestEmailMessage({
      db,
      payload: {
        toAddress: "user@example.com",
        fromAddress: "sender@example.net",
        subject: "Your verification code",
        textBody: "Use code 123456 to continue.",
        htmlBody: null,
        messageId: "message-id",
        receivedAt: "2026-05-05T12:00:00.000Z",
        rawSize: 1024,
      },
    });

    expect(result).toEqual({ stored: true, messageId: "message_1" });
    expect(db.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mailboxId: "mailbox_1",
          verificationCodes: {
            create: [expect.objectContaining({ code: "123456" })],
          },
        }),
      }),
    );
  });

  it("rejects unknown recipients", async () => {
    db.mailbox.findUnique.mockResolvedValue(null);

    const result = await ingestEmailMessage({
      db,
      payload: {
        toAddress: "missing@example.com",
        fromAddress: "sender@example.net",
        subject: "Code",
        textBody: "123456",
        htmlBody: null,
        messageId: null,
        receivedAt: "2026-05-05T12:00:00.000Z",
        rawSize: 1024,
      },
    });

    expect(result).toEqual({ stored: false, reason: "unknown_recipient" });
    expect(db.message.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm run test -- tests/email/ingest-service.test.ts
```

Expected: FAIL because the ingest service does not exist.

- [ ] **Step 3: Implement ingest service**

Create `src/lib/email/ingest-service.ts`:

```ts
import { z } from "zod";
import { extractVerificationCodes } from "@/lib/verification/extract-codes";

export const ingestPayloadSchema = z.object({
  toAddress: z.string().email().transform((value) => value.toLowerCase()),
  fromAddress: z.string().min(1),
  subject: z.string().default(""),
  textBody: z.string().default(""),
  htmlBody: z.string().nullable().default(null),
  messageId: z.string().nullable().default(null),
  receivedAt: z.string().datetime(),
  rawSize: z.number().int().min(0),
});

export type IngestPayload = z.infer<typeof ingestPayloadSchema>;

type IngestDb = {
  mailbox: {
    findUnique(args: unknown): Promise<{ id: string; address: string; status: string; userId: string } | null>;
  };
  message: {
    create(args: unknown): Promise<{ id: string }>;
  };
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
};

export async function ingestEmailMessage(input: { db: IngestDb; payload: IngestPayload }) {
  const payload = ingestPayloadSchema.parse(input.payload);
  const mailbox = await input.db.mailbox.findUnique({ where: { address: payload.toAddress } });

  if (!mailbox || mailbox.status !== "ACTIVE") {
    await input.db.auditLog.create({
      data: {
        userId: mailbox?.userId ?? null,
        eventType: "INGEST_UNKNOWN_RECIPIENT",
        message: "Received email for unknown or inactive mailbox.",
        metadata: { toAddress: payload.toAddress },
      },
    });
    return { stored: false as const, reason: "unknown_recipient" as const };
  }

  const candidates = extractVerificationCodes({
    subject: payload.subject,
    textBody: payload.textBody,
  });

  const message = await input.db.message.create({
    data: {
      mailboxId: mailbox.id,
      messageId: payload.messageId,
      fromAddress: payload.fromAddress,
      toAddress: payload.toAddress,
      subject: payload.subject,
      textBody: payload.textBody,
      htmlBody: payload.htmlBody,
      receivedAt: new Date(payload.receivedAt),
      rawSize: payload.rawSize,
      verificationCodes: {
        create: candidates.map((candidate) => ({
          mailboxId: mailbox.id,
          code: candidate.code,
          confidence: candidate.confidence,
          context: candidate.context,
        })),
      },
    },
  });

  await input.db.auditLog.create({
    data: {
      userId: mailbox.userId,
      eventType: "INGEST_MESSAGE_STORED",
      message: "Stored inbound email message.",
      metadata: { mailboxId: mailbox.id, messageId: message.id, codeCount: candidates.length },
    },
  });

  return { stored: true as const, messageId: message.id };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
npm run test -- tests/email/ingest-service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/lib/email/ingest-service.ts tests/email/ingest-service.test.ts
git commit -m "feat: store ingested verification emails"
```

Expected: git creates the commit.

---

### Task 11: Add Auth API Routes

**Files:**
- Create: `src/app/api/auth/register/route.ts`
- Create: `src/app/api/auth/login/route.ts`
- Create: `src/app/api/auth/logout/route.ts`
- Create: `src/lib/auth/current-user.ts`

- [ ] **Step 1: Add current-user helper**

Create `src/lib/auth/current-user.ts`:

```ts
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const session = await verifySessionToken(token, env.SESSION_SECRET);

  if (!session) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, role: true, disabledAt: true },
  });

  if (!user || user.disabledAt) {
    return null;
  }

  return user;
}
```

- [ ] **Step 2: Add register route**

Create `src/app/api/auth/register/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword } from "@/lib/auth/password";
import { createSessionToken, sessionCookieOptions, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

const registerSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128),
});

export async function POST(request: Request) {
  const parsed = registerSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid registration input." }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });

  if (existing) {
    return NextResponse.json({ error: "Email is already registered." }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: {
      email: parsed.data.email,
      passwordHash: await hashPassword(parsed.data.password),
      auditLogs: {
        create: {
          eventType: "USER_REGISTERED",
          message: "User registered.",
        },
      },
    },
    select: { id: true, email: true, role: true },
  });

  const token = await createSessionToken({ userId: user.id, role: user.role }, env.SESSION_SECRET);
  const response = NextResponse.json({ user: { id: user.id, email: user.email, role: user.role } });
  response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
  return response;
}
```

- [ ] **Step 3: Add login route**

Create `src/app/api/auth/login/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionToken, sessionCookieOptions, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

const loginSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
});

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid login input." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });

  if (!user || user.disabledAt || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    await prisma.auditLog.create({
      data: {
        userId: user?.id ?? null,
        eventType: "LOGIN_FAILED",
        message: "Login failed.",
        metadata: { email: parsed.data.email },
      },
    });
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const token = await createSessionToken({ userId: user.id, role: user.role }, env.SESSION_SECRET);
  const response = NextResponse.json({ user: { id: user.id, email: user.email, role: user.role } });
  response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
  return response;
}
```

- [ ] **Step 4: Add logout route**

Create `src/app/api/auth/logout/route.ts`:

```ts
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
```

- [ ] **Step 5: Build check**

Run:

```powershell
npm run build
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/app/api/auth src/lib/auth/current-user.ts
git commit -m "feat: add user authentication routes"
```

Expected: git creates the commit.

---

### Task 12: Add Mailbox And Message API Routes

**Files:**
- Create: `src/app/api/mailboxes/route.ts`
- Create: `src/app/api/mailboxes/[id]/route.ts`
- Create: `src/app/api/mailboxes/[id]/messages/route.ts`
- Create: `src/app/api/messages/[id]/route.ts`
- Modify: `src/lib/mailboxes/mailbox-service.ts`

- [ ] **Step 1: Extend mailbox service with disablement**

Modify `src/lib/mailboxes/mailbox-service.ts` by adding:

```ts
export async function disableMailbox(input: {
  userId: string;
  mailboxId: string;
  db: MailboxDb;
  cloudflare: CloudflareClient;
}) {
  if (!input.db.mailbox.update || !input.cloudflare.disableRule) {
    throw new Error("Disable dependencies are missing.");
  }

  const mailbox = (await input.db.mailbox.findUnique({
    where: { id: input.mailboxId },
  })) as { id: string; userId: string; address: string; cloudflareRuleId: string | null } | null;

  if (!mailbox || mailbox.userId !== input.userId) {
    throw new Error("Mailbox not found.");
  }

  await input.db.mailbox.update({
    where: { id: input.mailboxId },
    data: { status: "DISABLING" },
  });

  await input.db.auditLog.create({
    data: {
      userId: input.userId,
      eventType: "MAILBOX_DISABLE_STARTED",
      message: "Mailbox disablement started.",
      metadata: { mailboxId: input.mailboxId, address: mailbox.address },
    },
  });

  try {
    if (mailbox.cloudflareRuleId) {
      await input.cloudflare.disableRule(mailbox.cloudflareRuleId);
    }

    const disabled = await input.db.mailbox.update({
      where: { id: input.mailboxId },
      data: { status: "DISABLED", disabledAt: new Date() },
    });

    await input.db.auditLog.create({
      data: {
        userId: input.userId,
        eventType: "MAILBOX_DISABLED",
        message: "Mailbox disabled.",
        metadata: { mailboxId: input.mailboxId, address: mailbox.address },
      },
    });

    return disabled;
  } catch (error) {
    await input.db.auditLog.create({
      data: {
        userId: input.userId,
        eventType: "MAILBOX_DISABLE_FAILED",
        message: "Cloudflare rule disablement failed.",
        metadata: {
          mailboxId: input.mailboxId,
          address: mailbox.address,
          error: error instanceof Error ? error.message : String(error),
        },
      },
    });
    throw new Error("Mailbox disablement failed.");
  }
}
```

- [ ] **Step 2: Add mailboxes collection route**

Create `src/app/api/mailboxes/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { CloudflareEmailRoutingClient } from "@/lib/cloudflare/email-routing-client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { createMailbox } from "@/lib/mailboxes/mailbox-service";

const createMailboxSchema = z.object({
  localPart: z.string().min(1).max(64),
});

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const mailboxes = await prisma.mailbox.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { messages: true } },
      messages: {
        orderBy: { receivedAt: "desc" },
        take: 1,
        select: { receivedAt: true },
      },
    },
  });

  return NextResponse.json({ mailboxes });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const parsed = createMailboxSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid mailbox input." }, { status: 400 });
  }

  try {
    const mailbox = await createMailbox({
      userId: user.id,
      requestedLocalPart: parsed.data.localPart,
      domain: env.EMAIL_DOMAIN,
      maxActiveMailboxes: env.MAX_ACTIVE_MAILBOXES_PER_USER,
      workerName: "email-worker",
      db: prisma,
      cloudflare: new CloudflareEmailRoutingClient({
        apiToken: env.CLOUDFLARE_API_TOKEN,
        zoneId: env.CLOUDFLARE_ZONE_ID,
      }),
    });

    return NextResponse.json({ mailbox }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Mailbox creation failed." },
      { status: 400 },
    );
  }
}
```

- [ ] **Step 3: Add mailbox detail and disable route**

Create `src/app/api/mailboxes/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { CloudflareEmailRoutingClient } from "@/lib/cloudflare/email-routing-client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { disableMailbox } from "@/lib/mailboxes/mailbox-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await context.params;
  const mailbox = await prisma.mailbox.findFirst({
    where: { id, userId: user.id },
  });

  if (!mailbox) {
    return NextResponse.json({ error: "Mailbox not found." }, { status: 404 });
  }

  return NextResponse.json({ mailbox });
}

export async function PATCH(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const mailbox = await disableMailbox({
      userId: user.id,
      mailboxId: id,
      db: prisma,
      cloudflare: new CloudflareEmailRoutingClient({
        apiToken: env.CLOUDFLARE_API_TOKEN,
        zoneId: env.CLOUDFLARE_ZONE_ID,
      }),
    });

    return NextResponse.json({ mailbox });
  } catch {
    return NextResponse.json({ error: "Mailbox disablement failed." }, { status: 400 });
  }
}
```

- [ ] **Step 4: Add mailbox messages route**

Create `src/app/api/mailboxes/[id]/messages/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await context.params;
  const mailbox = await prisma.mailbox.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });

  if (!mailbox) {
    return NextResponse.json({ error: "Mailbox not found." }, { status: 404 });
  }

  const messages = await prisma.message.findMany({
    where: { mailboxId: id },
    orderBy: { receivedAt: "desc" },
    take: 50,
    include: {
      verificationCodes: {
        orderBy: [{ confidence: "desc" }, { createdAt: "asc" }],
      },
    },
  });

  return NextResponse.json({ messages });
}
```

- [ ] **Step 5: Add message detail route**

Create `src/app/api/messages/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await context.params;
  const message = await prisma.message.findFirst({
    where: {
      id,
      mailbox: { userId: user.id },
    },
    include: {
      verificationCodes: {
        orderBy: [{ confidence: "desc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!message) {
    return NextResponse.json({ error: "Message not found." }, { status: 404 });
  }

  return NextResponse.json({ message });
}
```

- [ ] **Step 6: Build check**

Run:

```powershell
npm run build
```

Expected: build succeeds.

- [ ] **Step 7: Commit**

Run:

```powershell
git add src/app/api/mailboxes src/app/api/messages src/lib/mailboxes/mailbox-service.ts
git commit -m "feat: add mailbox and message api"
```

Expected: git creates the commit.

---

### Task 13: Add Worker Ingest API Route

**Files:**
- Create: `src/app/api/email/ingest/route.ts`

- [ ] **Step 1: Add ingest route**

Create `src/app/api/email/ingest/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { ingestEmailMessage, ingestPayloadSchema } from "@/lib/email/ingest-service";
import { verifyIngestSignature } from "@/lib/email/ingest-signature";

export async function POST(request: Request) {
  const body = await request.text();

  if (body.length > env.MAX_INGEST_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  const timestamp = request.headers.get("x-ingest-timestamp") ?? "";
  const signature = request.headers.get("x-ingest-signature") ?? "";
  const validSignature = await verifyIngestSignature({
    timestamp,
    signature,
    body,
    secret: env.INGEST_SECRET,
  });

  if (!validSignature) {
    await prisma.auditLog.create({
      data: {
        eventType: "INGEST_SIGNATURE_FAILED",
        message: "Worker ingest signature validation failed.",
        metadata: { timestamp },
      },
    });
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const parsedJson = JSON.parse(body) as unknown;
  const parsedPayload = ingestPayloadSchema.safeParse(parsedJson);

  if (!parsedPayload.success) {
    return NextResponse.json({ error: "Invalid ingest payload." }, { status: 400 });
  }

  const result = await ingestEmailMessage({ db: prisma, payload: parsedPayload.data });

  if (!result.stored) {
    return NextResponse.json(result, { status: 202 });
  }

  return NextResponse.json(result, { status: 201 });
}
```

- [ ] **Step 2: Build check**

Run:

```powershell
npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

Run:

```powershell
git add src/app/api/email/ingest/route.ts
git commit -m "feat: add signed email ingest endpoint"
```

Expected: git creates the commit.

---

### Task 14: Add User Interface Pages

**Files:**
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`
- Create: `src/app/login/page.tsx`
- Create: `src/app/register/page.tsx`
- Create: `src/app/mailboxes/page.tsx`
- Create: `src/app/mailboxes/[id]/page.tsx`
- Create: `src/components/auth-form.tsx`
- Create: `src/components/copy-button.tsx`
- Create: `src/components/mailbox-create-form.tsx`
- Create: `src/components/mailbox-list.tsx`
- Create: `src/components/message-list.tsx`

- [ ] **Step 1: Add global layout and styles**

Create `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Verification Mailboxes",
  description: "Manage Cloudflare-routed verification email addresses.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
```

Create `src/app/globals.css`:

```css
:root {
  color-scheme: light;
  --bg: #f7f7f4;
  --surface: #ffffff;
  --text: #1d1f23;
  --muted: #63666d;
  --line: #ddd8cf;
  --accent: #146c5c;
  --danger: #a13f32;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: Arial, Helvetica, sans-serif;
}

a {
  color: inherit;
}

button,
input {
  font: inherit;
}

.shell {
  width: min(1120px, calc(100vw - 32px));
  margin: 0 auto;
  padding: 32px 0;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
}

.panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 20px;
}

.stack {
  display: grid;
  gap: 16px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--line);
  padding: 14px 0;
}

.row:last-child {
  border-bottom: 0;
}

.muted {
  color: var(--muted);
}

.code {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 0 10px;
  background: #eef7f4;
  color: var(--accent);
  font-weight: 700;
  letter-spacing: 0;
}

.button {
  border: 1px solid var(--accent);
  border-radius: 6px;
  background: var(--accent);
  color: white;
  min-height: 36px;
  padding: 0 12px;
  cursor: pointer;
}

.button.secondary {
  background: white;
  color: var(--accent);
}

.button.danger {
  border-color: var(--danger);
  color: var(--danger);
  background: white;
}

.field {
  display: grid;
  gap: 6px;
}

.field input {
  min-height: 40px;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 0 10px;
  background: white;
}
```

- [ ] **Step 2: Add auth form component**

Create `src/components/auth-form.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type AuthFormProps = {
  mode: "login" | "register";
};

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
      }),
    });

    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      setError(body.error ?? "Authentication failed.");
      return;
    }

    router.push("/mailboxes");
    router.refresh();
  }

  return (
    <form className="panel stack" onSubmit={submit}>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          minLength={mode === "register" ? 12 : 1}
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          required
        />
      </div>
      {error ? <p className="muted">{error}</p> : null}
      <button className="button" type="submit">
        {mode === "register" ? "Create account" : "Log in"}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Add auth pages and home redirect page**

Create `src/app/login/page.tsx`:

```tsx
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export default function LoginPage() {
  return (
    <div className="stack">
      <h1>Log in</h1>
      <AuthForm mode="login" />
      <p className="muted">
        Need an account? <Link href="/register">Register</Link>
      </p>
    </div>
  );
}
```

Create `src/app/register/page.tsx`:

```tsx
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export default function RegisterPage() {
  return (
    <div className="stack">
      <h1>Register</h1>
      <AuthForm mode="register" />
      <p className="muted">
        Already registered? <Link href="/login">Log in</Link>
      </p>
    </div>
  );
}
```

Create `src/app/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/mailboxes");
}
```

- [ ] **Step 4: Add mailbox interaction components**

Create `src/components/copy-button.tsx`:

```tsx
"use client";

import { useState } from "react";

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <button className="button secondary" type="button" onClick={copy}>
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
```

Create `src/components/mailbox-create-form.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function MailboxCreateForm({ domain }: { domain: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/mailboxes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ localPart: String(formData.get("localPart") ?? "") }),
    });

    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      setError(body.error ?? "Mailbox creation failed.");
      return;
    }

    event.currentTarget.reset();
    router.refresh();
  }

  return (
    <form className="panel stack" onSubmit={submit}>
      <div className="field">
        <label htmlFor="localPart">New address</label>
        <input id="localPart" name="localPart" placeholder={`name@${domain}`} required />
      </div>
      {error ? <p className="muted">{error}</p> : null}
      <button className="button" type="submit">
        Create address
      </button>
    </form>
  );
}
```

Create `src/components/mailbox-list.tsx`:

```tsx
import Link from "next/link";
import { CopyButton } from "@/components/copy-button";

type MailboxListItem = {
  id: string;
  address: string;
  status: string;
  createdAt: Date;
  _count: { messages: number };
  messages: Array<{ receivedAt: Date }>;
};

export function MailboxList({ mailboxes }: { mailboxes: MailboxListItem[] }) {
  if (mailboxes.length === 0) {
    return <p className="muted">No addresses yet.</p>;
  }

  return (
    <div className="panel">
      {mailboxes.map((mailbox) => (
        <div className="row" key={mailbox.id}>
          <div>
            <Link href={`/mailboxes/${mailbox.id}`}>{mailbox.address}</Link>
            <div className="muted">
              {mailbox.status} · {mailbox._count.messages} messages · Latest{" "}
              {mailbox.messages[0]?.receivedAt
                ? new Date(mailbox.messages[0].receivedAt).toLocaleString()
                : "none"}
            </div>
          </div>
          <CopyButton value={mailbox.address} />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Add message list component**

Create `src/components/message-list.tsx`:

```tsx
type MessageListItem = {
  id: string;
  fromAddress: string;
  subject: string;
  textBody: string;
  receivedAt: Date;
  verificationCodes: Array<{ id: string; code: string; confidence: number }>;
};

export function MessageList({ messages }: { messages: MessageListItem[] }) {
  if (messages.length === 0) {
    return <p className="muted">No messages received yet.</p>;
  }

  return (
    <div className="panel">
      {messages.map((message) => {
        const code = message.verificationCodes[0];
        const summary = message.textBody.slice(0, 180);

        return (
          <div className="row" key={message.id}>
            <div>
              <strong>{message.subject || "(No subject)"}</strong>
              <div className="muted">
                From {message.fromAddress} · {new Date(message.receivedAt).toLocaleString()}
              </div>
              <div className="muted">{summary}</div>
            </div>
            {code ? <span className="code">{code.code}</span> : <span className="muted">No code</span>}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: Add mailbox pages**

Create `src/app/mailboxes/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { MailboxCreateForm } from "@/components/mailbox-create-form";
import { MailboxList } from "@/components/mailbox-list";

export default async function MailboxesPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const mailboxes = await prisma.mailbox.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { messages: true } },
      messages: {
        orderBy: { receivedAt: "desc" },
        take: 1,
        select: { receivedAt: true },
      },
    },
  });

  return (
    <div className="stack">
      <div className="topbar">
        <div>
          <h1>Mailboxes</h1>
          <p className="muted">Signed in as {user.email}</p>
        </div>
      </div>
      <MailboxCreateForm domain={env.EMAIL_DOMAIN} />
      <MailboxList mailboxes={mailboxes} />
    </div>
  );
}
```

Create `src/app/mailboxes/[id]/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import { CopyButton } from "@/components/copy-button";
import { MessageList } from "@/components/message-list";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";

type MailboxPageProps = {
  params: Promise<{ id: string }>;
};

export default async function MailboxPage({ params }: MailboxPageProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const { id } = await params;
  const mailbox = await prisma.mailbox.findFirst({
    where: { id, userId: user.id },
    include: {
      messages: {
        orderBy: { receivedAt: "desc" },
        take: 50,
        include: {
          verificationCodes: {
            orderBy: [{ confidence: "desc" }, { createdAt: "asc" }],
          },
        },
      },
    },
  });

  if (!mailbox) {
    notFound();
  }

  return (
    <div className="stack">
      <div className="topbar">
        <div>
          <h1>{mailbox.address}</h1>
          <p className="muted">{mailbox.status}</p>
        </div>
        <CopyButton value={mailbox.address} />
      </div>
      <MessageList messages={mailbox.messages} />
    </div>
  );
}
```

- [ ] **Step 7: Build check**

Run:

```powershell
npm run build
```

Expected: build succeeds.

- [ ] **Step 8: Commit**

Run:

```powershell
git add src/app src/components
git commit -m "feat: add mailbox management ui"
```

Expected: git creates the commit.

---

### Task 15: Add Cloudflare Email Worker

**Files:**
- Create: `worker/package.json`
- Create: `worker/tsconfig.json`
- Create: `worker/vitest.config.ts`
- Create: `worker/wrangler.toml`
- Create: `worker/src/sign-ingest.ts`
- Create: `worker/src/parse-email.ts`
- Create: `worker/src/index.ts`
- Test: `worker/tests/sign-ingest.test.ts`
- Test: `worker/tests/parse-email.test.ts`

- [ ] **Step 1: Create Worker package**

Create `worker/package.json`:

```json
{
  "name": "email-routing-worker",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "deploy": "wrangler deploy"
  },
  "dependencies": {
    "postal-mime": "^2.4.3"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20260427.0",
    "typescript": "^5.8.3",
    "vitest": "^3.1.2",
    "wrangler": "^4.14.0"
  }
}
```

Create `worker/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "types": ["@cloudflare/workers-types", "vitest/globals"],
    "noEmit": true
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

Create `worker/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
  },
});
```

Create `worker/wrangler.toml`:

```toml
name = "email-worker"
main = "src/index.ts"
compatibility_date = "2026-05-05"

[vars]
APP_INGEST_URL = "https://app.example.com/api/email/ingest"
```

- [ ] **Step 2: Install Worker dependencies**

Run:

```powershell
npm install --prefix worker
```

Expected: npm exits with code 0 and creates `worker/package-lock.json`.

- [ ] **Step 3: Write failing Worker tests**

Create `worker/tests/sign-ingest.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createIngestSignature } from "../src/sign-ingest";

describe("createIngestSignature", () => {
  it("creates a stable HMAC signature", async () => {
    const signature = await createIngestSignature({
      timestamp: "2026-05-05T12:00:00.000Z",
      body: "{\"ok\":true}",
      secret: "s".repeat(32),
    });

    expect(signature).toHaveLength(64);
  });
});
```

Create `worker/tests/parse-email.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseEmailMessage } from "../src/parse-email";

describe("parseEmailMessage", () => {
  it("parses a simple raw email", async () => {
    const raw = new TextEncoder().encode(
      [
        "From: Sender <sender@example.net>",
        "To: user@example.com",
        "Subject: Your code",
        "Message-ID: <message-1@example.net>",
        "Content-Type: text/plain; charset=utf-8",
        "",
        "Use code 123456 to continue.",
      ].join("\r\n"),
    );

    const parsed = await parseEmailMessage({
      raw,
      from: "sender@example.net",
      to: "user@example.com",
      rawSize: raw.byteLength,
    });

    expect(parsed).toMatchObject({
      toAddress: "user@example.com",
      fromAddress: "sender@example.net",
      subject: "Your code",
      textBody: "Use code 123456 to continue.",
      messageId: "<message-1@example.net>",
      rawSize: raw.byteLength,
    });
  });
});
```

- [ ] **Step 4: Run Worker tests to verify they fail**

Run:

```powershell
npm --prefix worker test
```

Expected: FAIL because Worker modules do not exist.

- [ ] **Step 5: Implement Worker signature and parser**

Create `worker/src/sign-ingest.ts`:

```ts
type SignatureInput = {
  timestamp: string;
  body: string;
  secret: string;
};

export async function createIngestSignature(input: SignatureInput): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(input.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${input.timestamp}.${input.body}`),
  );

  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
```

Create `worker/src/parse-email.ts`:

```ts
import PostalMime from "postal-mime";

export type ParseEmailInput = {
  raw: ReadableStream | Uint8Array | ArrayBuffer;
  from: string;
  to: string;
  rawSize: number;
};

export type IngestPayload = {
  toAddress: string;
  fromAddress: string;
  subject: string;
  textBody: string;
  htmlBody: string | null;
  messageId: string | null;
  receivedAt: string;
  rawSize: number;
};

export async function parseEmailMessage(input: ParseEmailInput): Promise<IngestPayload> {
  const parsed = await PostalMime.parse(input.raw);
  const headers = new Map(parsed.headers.map((header) => [header.key.toLowerCase(), header.value]));

  return {
    toAddress: input.to.toLowerCase(),
    fromAddress: input.from,
    subject: parsed.subject ?? "",
    textBody: parsed.text ?? "",
    htmlBody: parsed.html ?? null,
    messageId: headers.get("message-id") ?? null,
    receivedAt: new Date().toISOString(),
    rawSize: input.rawSize,
  };
}
```

- [ ] **Step 6: Implement Worker entrypoint**

Create `worker/src/index.ts`:

```ts
import { parseEmailMessage } from "./parse-email";
import { createIngestSignature } from "./sign-ingest";

export interface Env {
  APP_INGEST_URL: string;
  INGEST_SECRET: string;
}

export default {
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    const payload = await parseEmailMessage({
      raw: message.raw,
      from: message.from,
      to: message.to,
      rawSize: message.rawSize,
    });

    const body = JSON.stringify(payload);
    const timestamp = new Date().toISOString();
    const signature = await createIngestSignature({
      timestamp,
      body,
      secret: env.INGEST_SECRET,
    });

    const request = fetch(env.APP_INGEST_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ingest-timestamp": timestamp,
        "x-ingest-signature": signature,
      },
      body,
    });

    ctx.waitUntil(request);
  },
};
```

- [ ] **Step 7: Run Worker tests to verify they pass**

Run:

```powershell
npm --prefix worker test
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```powershell
git add worker
git commit -m "feat: add cloudflare email worker"
```

Expected: git creates the commit.

---

### Task 16: Add Deployment Documentation

**Files:**
- Create: `docs/deployment.md`

- [ ] **Step 1: Write deployment documentation**

Create `docs/deployment.md`:

```md
# Deployment

## App Environment

Set these variables on the HTTPS host running the Next.js app:

- `DATABASE_URL`
- `APP_BASE_URL`
- `SESSION_SECRET`
- `INGEST_SECRET`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_ZONE_ID`
- `EMAIL_DOMAIN`
- `MAX_ACTIVE_MAILBOXES_PER_USER`
- `MAX_INGEST_BODY_BYTES`

`SESSION_SECRET` and `INGEST_SECRET` must be different random values with at least 32 characters.

## Cloudflare Requirements

Enable Email Routing for the zone and configure the DNS records Cloudflare requires for inbound mail. Deploy the Email Worker named `email-worker`.

The Cloudflare API token used by the app needs permission to manage Email Routing for the configured zone.

## Worker Secrets

Set the Worker ingest secret:

```powershell
npx wrangler secret put INGEST_SECRET --config worker/wrangler.toml
```

The value must match the app's `INGEST_SECRET`.

## Database

Run migrations before starting the production app:

```powershell
npm run prisma:migrate -- --name init
```

## Manual Acceptance

1. Register a user.
2. Create a mailbox address.
3. Confirm the app stores a Cloudflare rule ID for the mailbox.
4. Send an email containing `Your verification code is 123456` to the mailbox address.
5. Open the mailbox detail page.
6. Confirm the message appears.
7. Confirm `123456` appears as the recommended code.
8. Disable the mailbox.
9. Send another test email.
10. Confirm the disabled mailbox does not store the new message.
```

- [ ] **Step 2: Build and test all code**

Run:

```powershell
npm run test
npm --prefix worker test
npm run build
```

Expected: all commands exit with code 0.

- [ ] **Step 3: Commit**

Run:

```powershell
git add docs/deployment.md
git commit -m "docs: add deployment guide"
```

Expected: git creates the commit.

---

### Task 17: End-To-End Local Verification

**Files:**
- Modify only if verification exposes a concrete defect.

- [ ] **Step 1: Start PostgreSQL**

Use an existing local PostgreSQL server or start one with Docker:

```powershell
docker run --name email-app-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=email_app -p 5432:5432 -d postgres:16
```

Expected: Docker prints a container ID.

- [ ] **Step 2: Create `.env.local`**

Create `.env.local` from `.env.example` with real local values:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/email_app?schema=public"
APP_BASE_URL="http://localhost:3000"
SESSION_SECRET="local-session-secret-value-32-chars"
INGEST_SECRET="local-ingest-secret-value-32-chars"
CLOUDFLARE_API_TOKEN="replace-with-cloudflare-token"
CLOUDFLARE_ACCOUNT_ID="replace-with-account-id"
CLOUDFLARE_ZONE_ID="replace-with-zone-id"
EMAIL_DOMAIN="example.com"
MAX_ACTIVE_MAILBOXES_PER_USER="5"
MAX_INGEST_BODY_BYTES="1048576"
```

- [ ] **Step 3: Run migration**

Run:

```powershell
npm run prisma:migrate -- --name init
```

Expected: migration applies successfully.

- [ ] **Step 4: Run full verification**

Run:

```powershell
npm run test
npm --prefix worker test
npm run build
```

Expected: all commands exit with code 0.

- [ ] **Step 5: Start development server**

Run:

```powershell
npm run dev
```

Expected:

```text
Local: http://localhost:3000
```

- [ ] **Step 6: Verify UI flow**

In a browser:

1. Open `http://localhost:3000/register`.
2. Register a user with a 12-character password.
3. Create a mailbox local part such as `test-123`.
4. Confirm it appears in the list as `test-123@example.com`, using the configured domain.

- [ ] **Step 7: Verify ingest without Cloudflare**

Generate a signed ingest request from a temporary Node script or API client. Use this payload:

```json
{
  "toAddress": "test-123@example.com",
  "fromAddress": "sender@example.net",
  "subject": "Your verification code",
  "textBody": "Use verification code 123456 to continue.",
  "htmlBody": null,
  "messageId": "manual-test-1",
  "receivedAt": "2026-05-05T12:00:00.000Z",
  "rawSize": 512
}
```

Expected: `POST /api/email/ingest` returns `201`, the mailbox detail page shows the message, and the recommended code is `123456`.

- [ ] **Step 8: Verify real Cloudflare flow**

After deploying the Worker and configuring real secrets:

1. Create a mailbox in the app.
2. Send a real email containing `Your verification code is 654321` to the created address.
3. Open the mailbox detail page.
4. Confirm the message appears and `654321` is shown as the recommended code.

- [ ] **Step 9: Final commit if verification fixes were needed**

If a verification defect required code changes, run:

```powershell
git add .
git commit -m "fix: resolve verification issues"
```

Expected: git creates a commit only when there are actual verification fixes.

---

## Plan Self-Review

Spec coverage:

- User registration and login: Task 6, Task 11, Task 14, Task 17.
- Long-lived mailbox creation: Task 4, Task 7, Task 8, Task 12, Task 14.
- Cloudflare Email Routing rule creation: Task 7 and Task 8.
- Message ingest through Email Worker: Task 9, Task 10, Task 13, Task 15.
- Verification-code extraction: Task 5 and Task 10.
- User mailbox and message UI: Task 14.
- Per-user authorization: Task 11 and Task 12.
- Audit logging: Task 8, Task 10, Task 11, Task 12, Task 13.
- Error handling for Cloudflare and ingest failures: Task 7, Task 8, Task 10, Task 12, Task 13.
- Deployment and manual acceptance: Task 16 and Task 17.

Type consistency:

- `VerificationCodeCandidate` fields are `code`, `confidence`, and `context` everywhere.
- Ingest payload fields are `toAddress`, `fromAddress`, `subject`, `textBody`, `htmlBody`, `messageId`, `receivedAt`, and `rawSize` in both the app and Worker.
- Mailbox status values match the Prisma enum values `ACTIVE`, `DISABLING`, and `DISABLED`.
- Audit event names match the Prisma enum values.

Execution notes:

- Run tasks in order. Later API and UI tasks depend on earlier schema, auth, validation, Cloudflare client, and ingest service tasks.
- Keep commits small as listed so Cloudflare, ingest, auth, and UI defects can be isolated quickly.
