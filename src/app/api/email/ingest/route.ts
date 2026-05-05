import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { ingestEmailMessage, ingestPayloadSchema } from "@/lib/email/ingest-service";
import { verifyIngestSignature } from "@/lib/email/ingest-signature";

export async function POST(request: Request) {
  const body = await request.text();

  if (new TextEncoder().encode(body).byteLength > env.MAX_INGEST_BODY_BYTES) {
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

  const parsedJson = parseJson(body);
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

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}
