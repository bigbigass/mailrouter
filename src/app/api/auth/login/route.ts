import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyPassword } from "@/lib/auth/password";
import {
  createSessionToken,
  sessionCookieOptions,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

const loginSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
});

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await readJson(request));

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid login input." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  const passwordMatches =
    user && !user.disabledAt
      ? await verifyPassword(parsed.data.password, user.passwordHash)
      : false;

  if (!user || user.disabledAt || !passwordMatches) {
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
  const response = NextResponse.json({
    user: { id: user.id, email: user.email, role: user.role },
  });
  response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
  return response;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
