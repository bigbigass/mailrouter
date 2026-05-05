-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "MailboxStatus" AS ENUM ('ACTIVE', 'DISABLING', 'DISABLED');

-- CreateEnum
CREATE TYPE "AuditEventType" AS ENUM ('USER_REGISTERED', 'LOGIN_FAILED', 'MAILBOX_CREATED', 'MAILBOX_CREATE_FAILED', 'MAILBOX_DISABLE_STARTED', 'MAILBOX_DISABLED', 'MAILBOX_DISABLE_FAILED', 'INGEST_SIGNATURE_FAILED', 'INGEST_UNKNOWN_RECIPIENT', 'INGEST_MESSAGE_STORED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabledAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mailboxes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "localPart" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "status" "MailboxStatus" NOT NULL DEFAULT 'ACTIVE',
    "cloudflareRuleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabledAt" TIMESTAMP(3),

    CONSTRAINT "mailboxes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "mailboxId" TEXT NOT NULL,
    "messageId" TEXT,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "textBody" TEXT NOT NULL,
    "htmlBody" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawSize" INTEGER NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_codes" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "mailboxId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "context" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "eventType" "AuditEventType" NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "mailboxes_address_key" ON "mailboxes"("address");

-- CreateIndex
CREATE INDEX "mailboxes_userId_status_idx" ON "mailboxes"("userId", "status");

-- CreateIndex
CREATE INDEX "messages_mailboxId_receivedAt_idx" ON "messages"("mailboxId", "receivedAt");

-- CreateIndex
CREATE INDEX "messages_messageId_idx" ON "messages"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "messages_id_mailboxId_key" ON "messages"("id", "mailboxId");

-- CreateIndex
CREATE INDEX "verification_codes_mailboxId_createdAt_idx" ON "verification_codes"("mailboxId", "createdAt");

-- CreateIndex
CREATE INDEX "verification_codes_messageId_confidence_idx" ON "verification_codes"("messageId", "confidence");

-- CreateIndex
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_eventType_createdAt_idx" ON "audit_logs"("eventType", "createdAt");

-- AddForeignKey
ALTER TABLE "mailboxes" ADD CONSTRAINT "mailboxes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "mailboxes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_codes" ADD CONSTRAINT "verification_codes_messageId_mailboxId_fkey" FOREIGN KEY ("messageId", "mailboxId") REFERENCES "messages"("id", "mailboxId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_codes" ADD CONSTRAINT "verification_codes_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "mailboxes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

