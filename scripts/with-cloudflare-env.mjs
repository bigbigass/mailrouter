import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const configPath = join(process.cwd(), "config", "app.config.json");
const config = existsSync(configPath) ? JSON.parse(readFileSync(configPath, "utf8")) : {};
const pathDelimiter = process.platform === "win32" ? ";" : ":";
const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === "path") ?? "PATH";
const localBinPath = join(process.cwd(), "node_modules", ".bin");

const env = {
  ...process.env,
  [pathKey]: [localBinPath, process.env[pathKey]].filter(Boolean).join(pathDelimiter),
  CLOUDFLARE_API_TOKEN:
    process.env.CLOUDFLARE_API_TOKEN ?? config.cloudflare?.apiToken,
  CLOUDFLARE_ACCOUNT_ID:
    process.env.CLOUDFLARE_ACCOUNT_ID ?? config.cloudflare?.accountId,
};

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error("Usage: node scripts/with-cloudflare-env.mjs <command> [...args]");
  process.exit(1);
}

const result = spawnSync(command, args, {
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
