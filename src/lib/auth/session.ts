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
