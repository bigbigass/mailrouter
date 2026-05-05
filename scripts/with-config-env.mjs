import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const configPath = join(process.cwd(), "config", "app.config.json");

if (!existsSync(configPath)) {
  console.error("Missing config/app.config.json. Copy config/app.config.example.json and fill in the values.");
  process.exit(1);
}

const config = JSON.parse(readFileSync(configPath, "utf8"));
const env = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL ?? buildDatabaseUrl(config.database),
  APP_BASE_URL: process.env.APP_BASE_URL ?? config.app.baseUrl,
  SESSION_SECRET: process.env.SESSION_SECRET ?? config.security.sessionSecret,
  INGEST_SECRET: process.env.INGEST_SECRET ?? config.security.ingestSecret,
  CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN ?? config.cloudflare.apiToken,
  CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID ?? config.cloudflare.accountId,
  CLOUDFLARE_ZONE_ID: process.env.CLOUDFLARE_ZONE_ID ?? config.cloudflare.zoneId,
  EMAIL_DOMAIN: process.env.EMAIL_DOMAIN ?? config.cloudflare.emailDomain,
  EMAIL_WORKER_NAME: process.env.EMAIL_WORKER_NAME ?? config.cloudflare.workerName,
  WORKER_APP_INGEST_URL: process.env.WORKER_APP_INGEST_URL ?? config.worker.appIngestUrl,
  MAX_ACTIVE_MAILBOXES_PER_USER:
    process.env.MAX_ACTIVE_MAILBOXES_PER_USER ?? String(config.limits.maxActiveMailboxesPerUser),
  MAX_INGEST_BODY_BYTES: process.env.MAX_INGEST_BODY_BYTES ?? String(config.limits.maxIngestBodyBytes),
};

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error("Usage: node scripts/with-config-env.mjs <command> [...args]");
  process.exit(1);
}

const result = spawnSync(command, args, {
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);

function buildDatabaseUrl(database) {
  const user = encodeURIComponent(database.user);
  const password = encodeURIComponent(database.password);
  const name = encodeURIComponent(database.name);
  const schema = encodeURIComponent(database.schema ?? "public");
  const sslMode = database.ssl ? "&sslmode=require" : "";

  return `postgresql://${user}:${password}@${database.host}:${database.port}/${name}?schema=${schema}${sslMode}`;
}
