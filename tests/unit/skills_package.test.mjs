import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const skillsRoot = resolve(root, "app/skills");

const EXPECTED_SKILLS = [
  "ads-operator",
  "ads-sync",
  "creative-audit",
  "spend-audit",
  "spend-proposal",
];

function listRelativeFiles(dir, current = dir) {
  const out = [];
  for (const name of readdirSync(current).sort()) {
    const full = join(current, name);
    if (statSync(full).isDirectory()) {
      out.push(...listRelativeFiles(dir, full));
    } else {
      out.push(relative(dir, full).split(sep).join("/"));
    }
  }
  return out;
}

describe("ads-studio bundled skill packages", () => {
  test("all five skill directories ship valid skill.json manifests and SKILL.md frontmatter", () => {
    expect(existsSync(skillsRoot)).toBe(true);
    const dirs = readdirSync(skillsRoot).sort();
    expect(dirs).toEqual(EXPECTED_SKILLS);

    for (const tag of dirs) {
      const dir = join(skillsRoot, tag);
      const present = listRelativeFiles(dir);
      expect(present).toContain("skill.json");
      expect(present).toContain("SKILL.md");

      const manifestRaw = readFileSync(join(dir, "skill.json"), "utf8");
      const manifest = JSON.parse(manifestRaw);

      expect(Object.keys(manifest).sort()).toEqual(["files", "name", "schema"]);
      expect(manifest.schema).toBe(1);
      expect(manifest.name).toBe(tag);
      expect(Array.isArray(manifest.files)).toBe(true);
      expect(manifest.files).toContain("SKILL.md");
      expect(manifest.files).not.toContain("skill.json");
      expect([...manifest.files].sort()).toEqual(present.filter((f) => f !== "skill.json"));

      const skillMd = readFileSync(join(dir, "SKILL.md"), "utf8");
      const lines = skillMd.replace(/\r\n?/g, "\n").split("\n");
      expect(lines[0]?.trim()).toBe("---");
      const closeIndex = lines.indexOf("---", 1);
      expect(closeIndex).toBeGreaterThan(1);

      const frontmatter = lines.slice(1, closeIndex);
      const nameLine = frontmatter.find((line) => /^name\s*:/.test(line));
      const descLine = frontmatter.find((line) => /^description\s*:/.test(line));
      expect(nameLine?.replace(/^name\s*:/, "").trim()).toBe(tag);

      const desc = descLine?.replace(/^description\s*:/, "").trim() ?? "";
      expect(desc.length).toBeGreaterThan(0);
      expect(desc.length).toBeLessThanOrEqual(240);
      expect(desc).not.toContain("<");
      expect(desc).not.toContain(">");

      expect(skillMd).not.toContain("records.aggregate");
    }
  });
});
