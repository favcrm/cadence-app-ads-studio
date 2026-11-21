import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { Database } from "bun:sqlite";
import { STARTER_SEED } from "../src/domain/ads.ts";

const root = resolve(import.meta.dirname, "..");
const defaultHost = resolve(root, "../../agenticos-v2");

function flagValue(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return resolve(process.argv[idx + 1]);
  return fallback;
}

const admissionPath = flagValue(
  "--admission",
  join(defaultHost, "apps/api/src/app-storage.ts"),
);
const enginePath = flagValue(
  "--engine",
  join(defaultHost, "apps/api/src/tenant-board/app-storage.ts"),
);
const recordsPath = flagValue(
  "--records",
  join(defaultHost, "apps/api/src/tenant-board/app-records.ts"),
);

const { prepareAppStorage } = await import(pathToFileURL(admissionPath).href);
const { TenantAppStorage } = await import(pathToFileURL(enginePath).href);
const {
  serveAppRecords,
  APP_RECORD_TABLE_STATEMENTS,
  APP_BATCH_RECEIPTS_DDL,
  APP_RECORD_RECEIPTS_DDL,
} = await import(pathToFileURL(recordsPath).href);

const appFiles = {
  "app.md": readFileSync(join(root, "app/app.md"), "utf8"),
  "app-storage.json": readFileSync(join(root, "app/app-storage.json"), "utf8"),
  "storage/001-initial.json": readFileSync(join(root, "app/storage/001-initial.json"), "utf8"),
};

const prepared = await prepareAppStorage(appFiles, "ads-studio");
if (!prepared) throw new Error("prepareAppStorage returned null for ads-studio");

const db = new Database(":memory:");
for (const ddl of APP_RECORD_TABLE_STATEMENTS) db.exec(ddl);
db.exec(APP_BATCH_RECEIPTS_DDL);
db.exec(APP_RECORD_RECEIPTS_DDL);

const sql = {
  exec(query, ...bindings) {
    const stmt = db.prepare(query);
    if (/^\s*(SELECT|PRAGMA|WITH)/i.test(query)) {
      const rows = stmt.all(...bindings);
      return { toArray: () => rows };
    }
    stmt.run(...bindings);
    return { toArray: () => [] };
  },
};

const tx = (action) => {
  db.exec("BEGIN");
  try {
    const result = action();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
};

const storage = new TenantAppStorage(sql);
const scope = { installId: "install_ads_check", contextId: "default" };
const owner = { id: "owner_1", label: "Owner" };

tx(() => {
  storage.apply(scope.installId, "ads-studio", prepared, 1_000);
});

async function callHost(operation, args, opts = {}) {
  return serveAppRecords({
    sql,
    storage,
    transaction: tx,
    scope,
    namespaceInstallId: scope.installId,
    recordKind: prepared.recordKind,
    call: { operation, args },
    actor: opts.actor === undefined ? owner : opts.actor,
    readerIsOwner: opts.readerIsOwner === undefined ? true : opts.readerIsOwner,
    nowSeconds: 2_000,
    recordWriteSchema: prepared.recordWriteSchema,
  });
}

// 1. Seed starter workspace using records.batch and verify counts per table.
const batchItems = [
  ...STARTER_SEED.accounts.map((profile) => ({
    table: "ad_accounts",
    record_id: `acct-${profile.account_key}`,
    profile,
  })),
  ...STARTER_SEED.campaigns.map((profile) => ({
    table: "ad_campaigns",
    record_id: `camp-${profile.campaign_key}`,
    profile,
  })),
  ...STARTER_SEED.proposals.map((profile) => ({
    table: "ad_proposals",
    record_id: `prop-${profile.proposal_key}`,
    profile,
  })),
  ...STARTER_SEED.assets.map((profile) => ({
    table: "creative_assets",
    record_id: `ast-${profile.asset_key}`,
    profile,
  })),
  ...STARTER_SEED.auditEvents.map((profile) => ({
    table: "audit_events",
    record_id: `evt-${profile.event_key}`,
    profile,
  })),
];

const seeded = await callHost("records.batch", { items: batchItems });
if (seeded.status !== 200) {
  throw new Error(`Starter seed records.batch failed (${seeded.status}): ${JSON.stringify(seeded.body)}`);
}

const expectedCounts = {
  ad_accounts: STARTER_SEED.accounts.length,
  ad_campaigns: STARTER_SEED.campaigns.length,
  ad_proposals: STARTER_SEED.proposals.length,
  creative_assets: STARTER_SEED.assets.length,
  audit_events: STARTER_SEED.auditEvents.length,
};

for (const [table, count] of Object.entries(expectedCounts)) {
  const res = await callHost("records.list", { table, limit: 100 });
  if (res.status !== 200 || res.body.records.length !== count) {
    throw new Error(
      `Expected ${count} rows in ${table}, got status=${res.status} count=${res.body?.records?.length}`,
    );
  }
}

// 2. Assertion: non-owner read refusal (403) across all 5 owner-only tables.
for (const table of Object.keys(expectedCounts)) {
  const denied = await callHost(
    "records.list",
    { table, limit: 10 },
    { readerIsOwner: false, actor: null },
  );
  if (denied.status !== 403) {
    throw new Error(`Expected 403 non-owner refusal on ${table}, got ${denied.status}`);
  }
}

// 3. Assertion: append_only refusal on audit_events update (409 append_only).
const firstEvt = STARTER_SEED.auditEvents[0];
const appendOnlyDenied = await callHost("records.update", {
  table: "audit_events",
  record_id: `evt-${firstEvt.event_key}`,
  expected_revision: 1,
  profile: { ...firstEvt, summary: "Tampered" },
});
if (appendOnlyDenied.status !== 409 || appendOnlyDenied.body?.code !== "append_only") {
  throw new Error(
    `Expected 409 append_only on audit_events, got ${appendOnlyDenied.status}: ${JSON.stringify(appendOnlyDenied.body)}`,
  );
}

// 4. Assertion: immutable_columns refusal on ad_accounts.account_key change.
const firstAcct = STARTER_SEED.accounts[0];
const immutableDenied = await callHost("records.update", {
  table: "ad_accounts",
  record_id: `acct-${firstAcct.account_key}`,
  expected_revision: 1,
  profile: { ...firstAcct, account_key: "renamed_account_key" },
});
if (![400, 409].includes(immutableDenied.status)) {
  throw new Error(
    `Expected 400/409 immutable column refusal on ad_accounts, got ${immutableDenied.status}: ${JSON.stringify(immutableDenied.body)}`,
  );
}

// 5. Assertion: FK references refusal on ad_campaigns referencing unknown account_key.
const firstCamp = STARTER_SEED.campaigns[0];
const fkDenied = await callHost("records.create", {
  table: "ad_campaigns",
  record_id: "camp-fk-invalid",
  profile: { ...firstCamp, campaign_key: "cmp_fk_invalid", account_key: "nonexistent_acct" },
});
if (![400, 409].includes(fkDenied.status)) {
  throw new Error(
    `Expected 400/409 reference refusal on ad_campaigns, got ${fkDenied.status}: ${JSON.stringify(fkDenied.body)}`,
  );
}

// 6. Assertion: record_write_schema refusal on ad_accounts when daily_guardrail_minor < 10000.
const schemaDenied = await callHost("records.create", {
  table: "ad_accounts",
  record_id: "acct-bad-guardrail",
  profile: { ...firstAcct, account_key: "bad_guardrail_acct", daily_guardrail_minor: 100 },
});
if (![400, 422].includes(schemaDenied.status)) {
  throw new Error(
    `Expected 400/422 record_write_schema refusal on ad_accounts, got ${schemaDenied.status}: ${JSON.stringify(schemaDenied.body)}`,
  );
}

db.close();
console.log(
  JSON.stringify(
    {
      ok: true,
      app: prepared.app,
      schemaVersion: prepared.schemaVersion,
      seededCounts: expectedCounts,
      checksPassed: [
        "prepareAppStorage + TenantAppStorage.apply",
        "records.batch starter seed",
        "non-owner 403 read refusal",
        "audit_events append_only 409 refusal",
        "ad_accounts.account_key immutable_columns refusal",
        "ad_campaigns.account_key references refusal",
        "ad_accounts record_write_schema min guardrail refusal",
      ],
    },
    null,
    2,
  ),
);
