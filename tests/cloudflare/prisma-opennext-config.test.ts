import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Prisma OpenNext Cloudflare configuration", () => {
  it("uses the default Prisma Client output so OpenNext can patch it", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const generatorBlock = schema.match(/generator\s+client\s+\{[\s\S]*?\}/)?.[0];

    expect(generatorBlock).toBeDefined();
    expect(generatorBlock).toContain('provider   = "prisma-client-js"');
    expect(generatorBlock).toContain('engineType = "client"');
    expect(generatorBlock).not.toMatch(/^\s*output\s*=/m);
  });

  it("keeps Prisma packages external for workerd-specific exports", () => {
    const nextConfig = readFileSync("next.config.ts", "utf8");

    expect(nextConfig).toContain(
      'serverExternalPackages: ["@prisma/client", ".prisma/client"]',
    );
  });

  it("imports PrismaClient from the default generated package", () => {
    const dbModule = readFileSync("src/lib/db.ts", "utf8");

    expect(dbModule).toContain('import { PrismaClient } from "@prisma/client";');
    expect(dbModule).not.toContain("@/generated/prisma/client");
  });
});
