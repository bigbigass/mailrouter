import { describe, expect, it } from "vitest";

import packageJson from "../package.json";

describe("package scripts", () => {
  it("build does not require local config/app.config.json", () => {
    expect(packageJson.scripts.build).toBe("npm run build:inner");
  });
});
