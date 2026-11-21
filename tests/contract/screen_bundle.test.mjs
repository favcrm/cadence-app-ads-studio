import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const screenDir = resolve(root, "app/screens/ads-studio");

const sha256 = (buf) => `sha256:${createHash("sha256").update(buf).digest("hex")}`;

describe("ads-studio built screen bundle contract", () => {
  test("screens.json hashes, startup order, app.md contracts, and offline safety hold", () => {
    expect(existsSync(resolve(screenDir, "screens.json"))).toBe(true);
    const decl = JSON.parse(readFileSync(resolve(screenDir, "screens.json"), "utf8"));

    expect(decl.contract).toBe("app-screens/v2");
    expect(decl.app).toBe("ads-studio");
    expect(decl.host_contract).toBe("screen-records.v1");
    expect(decl.entry).toBe("client.js");
    expect(decl.startup).toEqual(["runtime.js", "client.js"]);
    expect(decl.operations).toEqual([
      "records.list",
      "records.show",
      "records.create",
      "records.update",
      "records.batch",
    ]);

    let total = 0;
    for (const asset of decl.assets) {
      const body = readFileSync(resolve(screenDir, asset.name));
      expect(body.length).toBe(asset.size);
      expect(sha256(body)).toBe(asset.sha256);
      total += body.length;
    }
    expect(total).toBeLessThanOrEqual(2 * 1024 * 1024);

    const clientJs = readFileSync(resolve(screenDir, "client.js"), "utf8");
    const runtimeJs = readFileSync(resolve(screenDir, "runtime.js"), "utf8");
    const combined = `${runtimeJs}\n${clientJs}`;

    // No network URLs except harmless SVG XMLNS / React production error doc links.
    const urls = [...combined.matchAll(/https?:\/\/[^\s"'`)\\]+/g)]
      .map((m) => m[0])
      .filter((u) => !u.startsWith("http://www.w3.org/") && !u.startsWith("https://react.dev/errors"));
    expect(urls).toEqual([]);

    for (const forbidden of ["localStorage", "sessionStorage", "document.cookie", "XMLHttpRequest", "WebSocket", "eval("]) {
      expect(clientJs.includes(forbidden)).toBe(false);
    }

    const appMd = readFileSync(resolve(root, "app/app.md"), "utf8");
    expect(appMd).toContain("contracts: {app-screens: [1], screen-records: [1], screen-startup: [1], app-storage: [1]}");
  });
});
