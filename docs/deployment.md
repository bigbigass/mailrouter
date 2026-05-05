# Deployment

## Local Configuration File

All values you need to fill in live in one file:

```text
config/app.config.json
```

Create it from the committed example:

```powershell
Copy-Item config/app.config.example.json config/app.config.json
```

Fill in these sections:

- `app.baseUrl`: public URL of the Next.js app.
- `database`: PostgreSQL host, port, database name, schema, username, password, and SSL flag.
- `security.sessionSecret`: random session secret with at least 32 characters.
- `security.ingestSecret`: separate random Worker ingest secret with at least 32 characters.
- `cloudflare.apiToken`: Cloudflare API token with Email Routing rule permissions.
- `cloudflare.accountId`: Cloudflare account ID.
- `cloudflare.zoneId`: Cloudflare zone ID for the email domain.
- `cloudflare.emailDomain`: domain used for generated mailboxes.
- `cloudflare.workerName`: Email Worker name, normally `email-worker`.
- `limits`: mailbox quota and maximum Worker ingest body size.
- `worker.appIngestUrl`: full URL to the app ingest route, for example `https://your-app.example.com/api/email/ingest`.

`config/app.config.json` is ignored by git because it contains secrets and account credentials.

Environment variables are still supported as deployment overrides. For normal local operation, edit only `config/app.config.json`.

## Database

The app scripts generate Prisma's `DATABASE_URL` from the `database` section of `config/app.config.json`.

Run migrations before starting the app:

```powershell
npm run prisma:migrate
```

Generate the Prisma client manually if needed:

```powershell
npm run prisma:generate
```

## App

Start local development:

```powershell
npm run dev
```

Build for deployment:

```powershell
npm run build
```

## Cloudflare Requirements

Enable Email Routing for the zone and configure the DNS records Cloudflare requires for inbound mail.

The app creates Email Routing rules that match each mailbox address and route matching messages to the configured Worker.

The Cloudflare API token needs permission to manage Email Routing rules for `cloudflare.zoneId`.

## Worker Configuration

Generate `worker/wrangler.toml` from `config/app.config.json`:

```powershell
npm run config:sync-worker
```

Set the Worker ingest secret:

```powershell
npx wrangler secret put INGEST_SECRET --config worker/wrangler.toml
```

Use the same value as `security.ingestSecret` in `config/app.config.json`.

Deploy the Worker:

```powershell
npm --prefix worker run deploy
```

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
