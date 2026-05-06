import { describe, expect, it } from "vitest";

import packageJson from "../package.json";

describe("package scripts", () => {
  it("uses OpenNext for Cloudflare builds without recursive Next builds", () => {
    expect(packageJson.scripts.build).toBe("npm run cf:build");
    expect(packageJson.scripts["build:next"]).toContain("next build");
    expect(packageJson.scripts["cf:build"]).toContain("opennextjs-cloudflare build");
    expect(packageJson.scripts.deploy).toContain("npm run cf:build");
  });
});
