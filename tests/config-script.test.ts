import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("with-config-env script", () => {
  it("does not require local config when only default build env is needed", () => {
    const cwd = mkdtempSync(join(tmpdir(), "mailrouter-config-"));
    const scriptPath = resolve("scripts/with-config-env.mjs");
    const checkPath = join(cwd, "check-env.mjs");

    writeFileSync(
      checkPath,
      "process.exit(process.env.DATABASE_URL === 'file:./dev.db' ? 0 : 1);\n",
    );

    try {
      const result = spawnSync(
        process.execPath,
        [
          scriptPath,
          "node",
          checkPath,
        ],
        {
          cwd,
          env: process.env,
          encoding: "utf8",
        },
      );

      expect(result.stderr).not.toContain("Missing config/app.config.json");
      expect(result.status).toBe(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
