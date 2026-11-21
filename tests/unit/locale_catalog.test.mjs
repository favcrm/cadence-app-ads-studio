import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { zhHK } from "../../src/features/ads/localeCatalog.ts";

const adsDir = resolve(import.meta.dirname, "../../src/features/ads");

describe("zh-TW / zh-HK localization completeness", () => {
  test("every t(\"...\") string literal in src/features/ads/*.tsx has a non-empty entry in zhHK", () => {
    const files = readdirSync(adsDir).filter((f) => f.endsWith(".tsx"));
    expect(files.length).toBeGreaterThan(0);

    const missing = [];
    for (const file of files) {
      const text = readFileSync(join(adsDir, file), "utf8");
      const matches = text.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g);
      for (const m of matches) {
        const key = JSON.parse(`"${m[1]}"`);
        if (typeof zhHK[key] !== "string" || zhHK[key].trim().length === 0) {
          missing.push(`${file}: ${key}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
