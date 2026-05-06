import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Prisma OpenNext Cloudflare configuration", () => {
  it("generates Prisma Client for the Cloudflare runtime from a checked-in output path", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const generatorBlock = schema.match(/generator\s+client\s+\{[\s\S]*?\}/)?.[0];

    expect(generatorBlock).toBeDefined();
    expect(generatorBlock).toContain('provider = "prisma-client"');
    expect(generatorBlock).toContain('output   = "../src/generated/prisma"');
    expect(generatorBlock).toContain('runtime  = "cloudflare"');
  });

  it("imports PrismaClient from the generated Cloudflare runtime client", () => {
    const dbModule = readFileSync("src/lib/db.ts", "utf8");

    expect(dbModule).toContain('import { PrismaClient } from "@/generated/prisma/client";');
    expect(dbModule).not.toContain('from "@prisma/client"');
  });

  it("does not rely on the old Prisma WASM copy workaround", () => {
    const packageJson = readFileSync("package.json", "utf8");

    expect(packageJson).not.toContain("copy-prisma-cloudflare-assets.mjs");
  });
});
