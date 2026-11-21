import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");

describe("app-storage/v1 descriptor and initial migration", () => {
  test("migration sha256 matches 001-initial.json, all 5 tables are owner-only, audit_events is append_only, and creative_assets stores pointers only", () => {
    const descriptor = JSON.parse(readFileSync(resolve(root, "app/app-storage.json"), "utf8"));
    const migrationRaw = readFileSync(resolve(root, "app/storage/001-initial.json"), "utf8");
    const migration = JSON.parse(migrationRaw);
    const digest = `sha256:${createHash("sha256").update(migrationRaw).digest("hex")}`;

    expect(descriptor.contract).toBe("app-storage/v1");
    expect(descriptor.app).toBe("ads-studio");
    expect(descriptor.migrations).toHaveLength(1);
    expect(descriptor.migrations[0].sha256).toBe(digest);

    const expectedTables = ["ad_accounts", "ad_campaigns", "ad_proposals", "creative_assets", "audit_events"];
    expect(Object.keys(descriptor.tables)).toEqual(expectedTables);
    for (const table of expectedTables) {
      expect(descriptor.tables[table].read_role).toBe("owner");
    }
    expect(descriptor.tables.audit_events.append_only).toBe(true);

    const assetsOp = migration.operations.find(
      (op) => op.op === "create_table" && op.table === "creative_assets",
    );
    expect(assetsOp).toBeDefined();
    const columnNames = assetsOp.columns.map((c) => c.name);
    expect(columnNames).toContain("wiki_path");
    expect(columnNames).toContain("sha256");
    for (const col of assetsOp.columns) {
      expect(col.type).not.toBe("blob");
      expect(["blob", "data_url", "base64", "binary"].includes(col.name)).toBe(false);
    }
  });
});
