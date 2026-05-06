import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const sourceWasmPath = join(
  process.cwd(),
  "node_modules",
  ".prisma",
  "client",
  "query_compiler_bg.wasm",
);
const targetWasmPath = join(
  process.cwd(),
  ".open-next",
  "server-functions",
  "default",
  "node_modules",
  ".prisma",
  "client",
  "query_compiler_bg.wasm",
);

if (!existsSync(sourceWasmPath)) {
  console.error(`Missing Prisma WASM asset at ${sourceWasmPath}`);
  process.exit(1);
}

mkdirSync(dirname(targetWasmPath), { recursive: true });
copyFileSync(sourceWasmPath, targetWasmPath);

console.log(`Copied Prisma Cloudflare WASM asset to ${targetWasmPath}`);
