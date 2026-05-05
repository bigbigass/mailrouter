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

Enable Email Routing for the zone and configure the DNS records Cloudflare requires for inbound mail.

Deploy the Email Worker named `email-worker`. The app creates Email Routing rules that match each mailbox address and route matching messages to that Worker.

The Cloudflare API token used by the app needs permission to manage Email Routing rules for the configured zone. Keep `CLOUDFLARE_ZONE_ID` aligned with `EMAIL_DOMAIN`.

## Worker Configuration

Update `worker/wrangler.toml` before deployment:

```toml
[vars]
APP_INGEST_URL = "https://your-app.example.com/api/email/ingest"
```

Set the Worker ingest secret:

```powershell
npx wrangler secret put INGEST_SECRET --config worker/wrangler.toml
```

The value must match the app's `INGEST_SECRET`.

Deploy the Worker:

```powershell
npm --prefix worker run deploy
```

## Database

Run migrations before starting the production app:

```powershell
npm run prisma:migrate
```

For local first-time setup, create a PostgreSQL database matching `DATABASE_URL`, then run the same migration command.

## Build Checks

Run these before deployment:

```powershell
npm run test
npm --prefix worker test
npm --prefix worker run typecheck
npm run build
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

## Signed Ingest Smoke Test

You can verify the app ingest endpoint without Cloudflare by sending a signed JSON payload to `/api/email/ingest`. The signature is HMAC-SHA256 hex over:

```text
{timestamp}.{rawJsonBody}
```

The request must include:

- `content-type: application/json`
- `x-ingest-timestamp`
- `x-ingest-signature`

The timestamp must be within five minutes of the app server clock.
