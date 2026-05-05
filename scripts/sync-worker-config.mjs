import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const configPath = join(process.cwd(), "config", "app.config.json");
const wranglerPath = join(process.cwd(), "worker", "wrangler.toml");

if (!existsSync(configPath)) {
  console.error("Missing config/app.config.json. Copy config/app.config.example.json and fill in the values.");
  process.exit(1);
}

const config = JSON.parse(readFileSync(configPath, "utf8"));
const workerName = config.cloudflare.workerName;
const appIngestUrl = config.worker.appIngestUrl;

if (!workerName || !appIngestUrl) {
  console.error("config.cloudflare.workerName and config.worker.appIngestUrl are required.");
  process.exit(1);
}

writeFileSync(
  wranglerPath,
  [
    `name = "${escapeToml(workerName)}"`,
    'main = "src/index.ts"',
    'compatibility_date = "2026-05-05"',
    "",
    "[vars]",
    `APP_INGEST_URL = "${escapeToml(appIngestUrl)}"`,
    "",
  ].join("\n"),
);

console.log(`Updated ${wranglerPath}`);

function escapeToml(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}
