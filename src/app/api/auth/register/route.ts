import { NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword } from "@/lib/auth/password";
import {
  createSessionToken,
  sessionCookieOptions,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

const registerSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128),
});

export async function POST(request: Request) {
  const parsed = registerSchema.safeParse(await readJson(request));

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
