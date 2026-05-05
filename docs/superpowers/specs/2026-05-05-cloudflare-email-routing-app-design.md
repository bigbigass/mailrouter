# Cloudflare Email Routing Verification App Design

Date: 2026-05-05

## Goal

Build a web application where external users can register, apply for long-lived email addresses under the configured domain, and manage verification-code emails received by those addresses.

The application is not a full mailbox product. It focuses on address creation, received-message listing, automatic verification-code extraction, and safe per-user access control.

## Confirmed Scope

- Public self-service users.
- Long-lived addresses only.
- Users can create and manage their own addresses.
- Users can see received email list items, message summaries, and extracted verification codes.
- Full raw HTML mailbox rendering is out of scope for the MVP.
- Temporary addresses, IMAP, POP3, and automatic third-party account registration are out of scope.
- Preferred stack: Node.js and TypeScript.

## Recommended Architecture

Use a Next.js full-stack application with PostgreSQL and a Cloudflare Email Worker.

The Next.js app owns authentication, address management, user-facing pages, database writes, Cloudflare Email Routing API calls, and verification-code extraction. The Cloudflare Email Worker receives emails from Email Routing and posts parsed email data to a protected ingest endpoint in the Next.js app.

Cloudflare Email Routing manages address routing and email delivery into the Worker. It is not treated as the message store. All user-visible mail and verification-code data is stored in the application database.

## Main User Flow

1. A user registers or logs in.
2. The user opens the mailbox list and requests a new address.
3. The backend validates the requested local part or generates one.
4. The backend creates a Cloudflare Email Routing rule for the full address.
5. The backend stores the active mailbox with the Cloudflare rule ID.
6. An external service sends a verification email to that address.
7. Cloudflare Email Routing invokes the Email Worker.
8. The Worker parses the email fields and posts them to `POST /api/email/ingest`.
9. The backend verifies the ingest signature, stores the message, extracts verification-code candidates, and links them to the mailbox.
10. The user sees the received message and recommended code in the web UI.

## Cloudflare Integration

### Address Creation

When a user creates a mailbox, the backend calls the Cloudflare Email Routing Rules API for the configured zone. The rule matcher targets the requested full address, and the action routes matching mail to the configured Email Worker handling path.

The Cloudflare API token is stored only in backend environment variables. It must have the minimum permissions needed to manage Email Routing for the target zone.

If the Cloudflare API call fails, the mailbox must not be shown as active. The failure is recorded in audit logs.

### Address Disablement

When a mailbox is disabled, the backend first marks it as `disabling`, then disables or deletes the matching Cloudflare Email Routing rule. After Cloudflare confirms the change, the backend marks the mailbox as `disabled`.

If Cloudflare disablement fails, the mailbox remains in `disabling` and can be retried by an admin or background job.

### Email Ingest

The Cloudflare Email Worker receives routed messages, extracts basic fields, and calls the backend ingest endpoint. The Worker should send:

- Recipient address.
- Sender address.
- Subject.
- Plain text body when available.
- Sanitized or raw HTML body for storage only, with frontend rendering disabled in MVP.
- Message ID if present.
- Received timestamp.
- Raw message size or approximate size.

The backend resolves the recipient address to an active mailbox. Unknown or disabled addresses are rejected and recorded as ingest events, but not stored as user-visible messages.

## Data Model

### `users`

Stores application users.

Fields:

- `id`
- `email`
- `password_hash` or external identity fields
- `role`
- `created_at`
- `disabled_at`

### `mailboxes`

Stores user-owned email addresses.

Fields:

- `id`
- `user_id`
- `local_part`
- `domain`
- `address`
- `status`
- `cloudflare_rule_id`
- `created_at`
- `disabled_at`

Constraints:

- `address` is globally unique.
- `local_part` supports lowercase letters, digits, and hyphens.
- Reserved local parts include `admin`, `root`, `postmaster`, `abuse`, and `support`.

### `messages`

Stores received emails.

Fields:

- `id`
- `mailbox_id`
- `message_id`
- `from_address`
- `to_address`
- `subject`
- `text_body`
- `html_body`
- `received_at`
- `raw_size`

The frontend should show summaries by default. Raw HTML should not be rendered in the MVP.

### `verification_codes`

Stores extracted verification-code candidates.

Fields:

- `id`
- `message_id`
- `mailbox_id`
- `code`
- `confidence`
- `context`
- `created_at`

A single message may produce multiple candidates. The UI displays the highest-confidence code first.

### `audit_logs`

Stores security and operational events.

Events include:

- User registration and login failures.
- Mailbox creation.
- Mailbox disablement.
- Cloudflare API errors.
- Ingest signature failures.
- Unknown-recipient ingest attempts.
- Admin actions.

## Authentication And Authorization

Users authenticate through the web app. The MVP can use email and password authentication.

Authorization is strictly scoped by ownership:

- Normal users can only access their own mailboxes, messages, and verification codes.
- Admin users can inspect global mailbox status, operational metrics, audit events, and failed Cloudflare operations.
- Admin access to full message bodies should be avoided unless explicitly added with privacy controls.

## Abuse Controls

The MVP should include:

- Per-user mailbox quota, initially 5 active mailboxes.
- Mailbox creation rate limit.
- Verification-code viewing rate limit.
- Address local-part validation.
- Reserved-address blocklist.
- Authentication rate limits.
- Audit logging for suspicious ingest and account activity.

## Verification-Code Extraction

Use deterministic rules for the MVP.

Extraction priority:

1. Look near Chinese and English code phrases such as `验证码`, `verification code`, `code`, `OTP`, and `one-time password`.
2. Prefer standalone 4-8 digit numbers near those phrases.
3. Also support uppercase alphanumeric codes when phrase context is strong.
4. If there is no phrase context, fall back to standalone 4-8 digit numbers in the subject or text body.
5. Score candidates by phrase proximity, length, location, and ambiguity.

The UI should show the top candidate as the recommended verification code and allow the user to view other candidates or the message summary for confirmation.

## Pages

### `/login` And `/register`

Allow users to register, log in, and log out.

### `/mailboxes`

Shows the current user's addresses.

Each row shows:

- Address.
- Status.
- Message count.
- Most recent received time.
- Created time.
- Copy action.
- Disable action.

The page includes an address creation flow.

### `/mailboxes/[id]`

Shows one mailbox.

The page includes:

- Address header with copy action.
- Message list sorted by newest first.
- Sender.
- Subject.
- Received time.
- Recommended verification code.
- Message summary.

### Message Detail

Can be a route such as `/messages/[id]` or an in-page drawer.

The detail view includes:

- Sender.
- Recipient.
- Subject.
- Received time.
- Verification-code candidates.
- Text summary or sanitized text body.

Raw HTML rendering is excluded from the MVP.

## API

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`

### User Mailboxes

- `GET /api/mailboxes`
- `POST /api/mailboxes`
- `GET /api/mailboxes/:id`
- `PATCH /api/mailboxes/:id`
- `GET /api/mailboxes/:id/messages`

### User Messages

- `GET /api/messages/:id`

### Worker Ingest

- `POST /api/email/ingest`

This endpoint is only for the Cloudflare Email Worker.

### Admin

- `GET /api/admin/events`

The admin event endpoint can be delayed until after the core MVP if needed.

## Ingest Security

The Worker and backend share an ingest secret that is separate from all other application secrets.

The Worker signs requests with:

- `X-Ingest-Timestamp`
- `X-Ingest-Signature`

The signature is `HMAC_SHA256(timestamp + body, ingest_secret)`.

The backend validates:

- Signature correctness.
- Timestamp within a short window, initially 5 minutes.
- Request body size.
- Recipient address existence and active mailbox status.

Invalid signatures return `401` and are logged without storing message content.

## Error Handling

### Cloudflare API Failure

The user sees a stable generic error such as "Mailbox creation failed. Try again later." The system logs the Cloudflare endpoint, error code, address, and user ID.

### Address Conflict

If the address exists locally, the user sees that the address is unavailable.

If Cloudflare reports a conflict but the local database does not contain the address, the system records a consistency error for admin review.

### Ingest Signature Failure

The endpoint returns `401`. The system logs timestamp, source IP, and a request hash, but not full message content.

### Oversized Email

The backend enforces an initial message size limit such as 256 KB or 1 MB. Oversized messages store metadata and a truncated summary, or are rejected depending on final implementation choice.

### Parsing Failure

The system still stores the message metadata and text summary. It stores no verification-code candidates for that message.

### Database Failure During Ingest

The ingest endpoint returns `5xx`. The Worker logs the failure. A queue or retry mechanism can be added after the MVP if message loss becomes unacceptable.

## Testing

### Unit Tests

Cover verification-code extraction cases:

- Chinese verification code email.
- English OTP email.
- Code in subject.
- Multiple numbers in body.
- Order number or invoice number as distractors.
- Alphanumeric code.
- No verification code.

### API Tests

Cover:

- Registration and login.
- Mailbox creation.
- Local-part validation.
- Reserved local parts.
- Per-user quota.
- User access to own mailbox.
- User denied access to another user's mailbox.
- Ingest signature validation.
- Unknown-recipient ingest rejection.

### Cloudflare Integration Tests

Use a mocked Cloudflare client for automated tests:

- Successful rule creation stores active mailbox and rule ID.
- Rule creation failure does not leave an active mailbox.
- Disablement success marks mailbox disabled.
- Disablement failure leaves mailbox in `disabling`.

### Worker Tests

Use fixture emails to verify:

- Recipient extraction.
- Sender extraction.
- Subject extraction.
- Text body extraction.
- Backend ingest request payload.
- Backend ingest signature creation.

### Manual Acceptance Test

With a real Cloudflare zone:

1. Create a mailbox in the web UI.
2. Send a test verification email to the address.
3. Confirm the message appears in the mailbox detail page.
4. Confirm the recommended verification code is displayed.
5. Disable the mailbox.
6. Confirm later mail to the address is not stored for the user.

## MVP Exclusions

- Temporary email addresses.
- Automatic registration on third-party websites.
- Full mailbox client behavior.
- IMAP or POP3.
- Rendering raw HTML email.
- AI-based verification-code parsing.
- Multi-domain management.
- Public API for third-party systems.
- Advanced admin dashboard beyond operational event visibility.

## Implementation Defaults

Use these defaults for the MVP unless a later planning review finds a concrete blocker:

- Next.js App Router with TypeScript.
- PostgreSQL with Prisma for schema management, migrations, and typed data access.
- Email and password authentication implemented in the app, with secure password hashing and session cookies.
- Cloudflare Email Worker posts directly to the Next.js ingest endpoint over HTTPS.
- 1 MB maximum ingest request body size.
- Text body is stored in full within the size limit; HTML body is stored but never rendered in the MVP UI.
- The Next.js app must be deployed to a Node-compatible HTTPS host reachable by Cloudflare Workers.

## Success Criteria

The MVP is complete when:

- A user can register and log in.
- A user can create a long-lived address.
- The backend creates the matching Cloudflare Email Routing rule.
- A real email sent to the address reaches the Email Worker.
- The Worker posts the message to the backend ingest endpoint.
- The backend stores the message under the correct user-owned mailbox.
- The backend extracts likely verification-code candidates.
- The user can view the message list and recommended verification code.
- Users cannot access each other's addresses or messages.
- Cloudflare API failures and ingest failures are logged.
