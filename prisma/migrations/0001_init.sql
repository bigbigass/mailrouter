-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabledAt" DATETIME
);

-- CreateTable
CREATE TABLE "mailboxes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "localPart" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "cloudflareRuleId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabledAt" DATETIME,
    CONSTRAINT "mailboxes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mailboxId" TEXT NOT NULL,
    "messageId" TEXT,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "textBody" TEXT NOT NULL,
    "htmlBody" TEXT,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawSize" INTEGER NOT NULL,
    CONSTRAINT "messages_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "mailboxes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "verification_codes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "messageId" TEXT NOT NULL,
    "mailboxId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "context" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "verification_codes_messageId_mailboxId_fkey" FOREIGN KEY ("messageId", "mailboxId") REFERENCES "messages" ("id", "mailboxId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "verification_codes_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "mailboxes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "eventType" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
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
