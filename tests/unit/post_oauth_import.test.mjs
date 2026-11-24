import { describe, expect, test } from "bun:test";
import { validateAccountInput } from "../../src/domain/ads.ts";
import { CALL_FIELDS, cleanArgs } from "../../src/bridge/services.ts";
import {
  buildAccountPickerModel,
  confirmAndImportAccounts,
  connectProviderToPlatform,
  normalizeImportedAccountKey,
  parseConnectedAssetsReply,
  parseImportedCampaignsReply,
  syncSingleAccountCampaigns,
} from "../../src/features/ads/records.ts";

describe("connections.ads.campaigns closed bridge args & replies", () => {
  test("cleanArgs admits connections.ads.campaigns fields and rejects unexpected args", () => {
    expect(CALL_FIELDS["connections.ads.campaigns"]).toEqual([
      "toolkit",
      "connection_id",
      "account_id",
      "login_customer_id",
    ]);
    expect(
      cleanArgs("connections.ads.campaigns", {
        toolkit: "googleads",
        connection_id: "con_1",
        account_id: "4128903310",
        login_customer_id: "9012240018",
      }),
    ).toEqual({
      toolkit: "googleads",
      connection_id: "con_1",
      account_id: "4128903310",
      login_customer_id: "9012240018",
    });
    expect(() =>
      cleanArgs("connections.ads.campaigns", {
        toolkit: "googleads",
        connection_id: "con_1",
        account_id: "4128903310",
        gaql: "SELECT * FROM ad_group_ad",
      }),
    ).toThrow();
  });

  test("parseConnectedAssetsReply retains login_customer_id and manager metadata", () => {
    const reply = parseConnectedAssetsReply(
      {
        toolkit: "googleads",
        connected: true,
        needs_reconnect: false,
        connections: [
          {
            connection_id: "con_g1",
            account: "mcc@example.test",
            kind: "google_ads_customer",
            selected: null,
            assets: [
              {
                value: "9012240018",
                label: "Agency MCC",
                permission: "manager",
                selectable: false,
                currency: "HKD",
                timezone: "Asia/Hong_Kong",
              },
              {
                value: "4128903310",
                label: "Brand HK Client",
                permission: "accessible",
                selectable: true,
                currency: "HKD",
                timezone: "Asia/Hong_Kong",
                login_customer_id: "9012240018",
              },
            ],
          },
        ],
      },
      "google",
    );
    expect(reply.connections[0]?.assets[0]).toMatchObject({
      value: "9012240018",
      permission: "manager",
      selectable: false,
    });
    expect(reply.connections[0]?.assets[1]).toMatchObject({
      value: "4128903310",
      selectable: true,
      login_customer_id: "9012240018",
    });
  });

  test("parseImportedCampaignsReply accepts PAUSED campaigns and enforces ads_status=not_imported", () => {
    const parsed = parseImportedCampaignsReply({
      toolkit: "metaads",
      platform: "meta",
      connection_id: "con_m1",
      account_id: "act_123456",
      login_customer_id: null,
      currency: "HKD",
      status: "ok",
      truncated: false,
      synced_at: "2026-11-24T05:00:00.000Z",
      levels: { campaigns: 2, ads: null },
      ads_status: "not_imported",
      warnings: [],
      campaigns: [
        {
          external_campaign_id: "12001",
          name: "Always On Search",
          objective: "OUTCOME_SALES",
          status: "ACTIVE",
          daily_budget_minor: 50000,
          spend_7d_minor: 245000,
          impressions_7d: 18000,
          clicks_7d: 620,
          google_conversions: null,
          meta_actions_json: [{ actionType: "purchase", value: 18 }],
          cpa_minor: 13611,
        },
        {
          external_campaign_id: "12002",
          name: "Paused Winter Test",
          objective: "OUTCOME_LEADS",
          status: "PAUSED",
          daily_budget_minor: 20000,
          spend_7d_minor: 0,
          impressions_7d: 0,
          clicks_7d: 0,
          google_conversions: null,
          meta_actions_json: [],
          cpa_minor: null,
        },
      ],
    });
    expect(parsed.ads_status).toBe("not_imported");
    expect(parsed.levels).toEqual({ campaigns: 2, ads: null });
    expect(parsed.campaigns[1]?.status).toBe("PAUSED");
  });
});

describe("post-OAuth picker state & storage constraints", () => {
  test("connectProviderToPlatform maps closed toolkit query hints safely", () => {
    expect(connectProviderToPlatform("metaads")).toBe("meta");
    expect(connectProviderToPlatform("googleads")).toBe("google");
    expect(connectProviderToPlatform("meta")).toBe("meta");
    expect(connectProviderToPlatform("google")).toBe("google");
    expect(connectProviderToPlatform("unknown")).toBeNull();
  });

  test("normalizeImportedAccountKey and validateAccountInput always satisfy 3..40 char storage regex", () => {
    const key = normalizeImportedAccountKey("meta", "act_999888777666555444333222");
    expect(key).toMatch(/^[a-z0-9_-]{3,40}$/);
    const validated = validateAccountInput({
      platform: "meta",
      external_account_id: "act_999888777666555444333222",
      display_name: "Very Long Enterprise Account",
      currency: "HKD",
      timezone: "Asia/Hong_Kong",
      daily_guardrail_minor: 10000,
    });
    expect(validated.ok).toBe(true);
    if (validated.ok) {
      expect(validated.value.account_key).toMatch(/^[a-z0-9_-]{3,40}$/);
    }
  });

  test("buildAccountPickerModel distinguishes sole preselect, multi-select, manager-only, empty, and expired states", () => {
    const singleGoogle = parseConnectedAssetsReply(
      {
        toolkit: "googleads",
        connected: true,
        needs_reconnect: false,
        connections: [
          {
            connection_id: "con_g1",
            account: "ads@example.test",
            kind: "google_ads_customer",
            selected: null,
            assets: [
              {
                value: "9012240018",
                label: "Agency MCC",
                permission: "manager",
                selectable: false,
              },
              {
                value: "4128903310",
                label: "Brand HK Client",
                permission: "accessible",
                selectable: true,
                currency: "HKD",
                login_customer_id: "9012240018",
              },
            ],
          },
        ],
      },
      "google",
    );

    const multiMeta = parseConnectedAssetsReply(
      {
        toolkit: "metaads",
        connected: true,
        needs_reconnect: false,
        connections: [
          {
            connection_id: "con_m1",
            account: "fb@example.test",
            kind: "meta_ad_account",
            selected: null,
            assets: [
              { value: "act_101", label: "Brand A", permission: "active", selectable: true },
              { value: "act_102", label: "Brand B", permission: "active", selectable: true },
            ],
          },
        ],
      },
      "meta",
    );

    const modelFocusedGoogle = buildAccountPickerModel({
      connectionsByPlatform: { google: singleGoogle, meta: multiMeta },
      existingAccounts: [],
      focusPlatform: "google",
    });
    expect(modelFocusedGoogle.visiblePlatforms).toEqual(["google"]);
    expect(modelFocusedGoogle.defaultSelectedIds).toEqual(["google:con_g1:4128903310"]);
    expect(modelFocusedGoogle.providers[0]?.state).toBe("ready");
    expect(modelFocusedGoogle.providers[0]?.unavailableAssets).toHaveLength(1);

    const modelOverviewMulti = buildAccountPickerModel({
      connectionsByPlatform: { google: singleGoogle, meta: multiMeta },
      existingAccounts: [],
      focusPlatform: null,
    });
    expect(modelOverviewMulti.visiblePlatforms).toEqual(["meta", "google"]);
    expect(modelOverviewMulti.defaultSelectedIds).toEqual(["google:con_g1:4128903310"]);

    const managerOnly = parseConnectedAssetsReply(
      {
        toolkit: "googleads",
        connected: true,
        needs_reconnect: false,
        connections: [
          {
            connection_id: "con_mcc",
            account: "mcc@example.test",
            kind: "google_ads_customer",
            selected: null,
            assets: [{ value: "9012240018", label: "Agency MCC", permission: "manager", selectable: false }],
          },
        ],
      },
      "google",
    );
    const modelUnavailable = buildAccountPickerModel({
      connectionsByPlatform: { google: managerOnly },
      existingAccounts: [],
      focusPlatform: "google",
    });
    expect(modelUnavailable.providers[0]?.state).toBe("unavailable");

    const emptyMeta = parseConnectedAssetsReply(
      {
        toolkit: "metaads",
        connected: true,
        needs_reconnect: false,
        connections: [
          {
            connection_id: "con_empty",
            account: "empty@example.test",
            kind: "meta_ad_account",
            selected: null,
            assets: [],
          },
        ],
      },
      "meta",
    );
    const expiredGoogle = parseConnectedAssetsReply(
      { toolkit: "googleads", connected: false, needs_reconnect: true, connections: [] },
      "google",
    );
    const statesModel = buildAccountPickerModel({
      connectionsByPlatform: { meta: emptyMeta, google: expiredGoogle },
      existingAccounts: [],
      focusPlatform: null,
    });
    expect(statesModel.providers.find((p) => p.platform === "meta")?.state).toBe("empty");
    expect(statesModel.providers.find((p) => p.platform === "google")?.state).toBe("expired");
  });
});

describe("confirmAndImportAccounts & idempotent sync", () => {
  test("saves ad_accounts before querying/writing ad_campaigns, imports PAUSED rows, and updates idempotently on resync", async () => {
    const scope = { installId: "inst_test", digest: "sha256:test" };
    const log = [];
    const tables = {
      ad_accounts: new Map(),
      ad_campaigns: new Map(),
      audit_events: new Map(),
    };
    let failGoogleOnce = true;

    const fakeCall = async (verb, args) => {
      log.push(verb === "records.create" || verb === "records.update" ? `${verb}:${String(args.table)}` : verb);
      if (verb === "records.create") {
        const t = String(args.table);
        const id = String(args.record_id);
        const row = { id, revision: 1, profile: structuredClone(args.profile) };
        tables[t].set(id, row);
        return { record: row };
      }
      if (verb === "records.update") {
        const t = String(args.table);
        const id = String(args.record_id);
        const existing = tables[t].get(id);
        if (!existing) throw Object.assign(new Error("not found"), { status: 404, code: "not_found" });
        if (args.expected_revision !== existing.revision) {
          throw Object.assign(new Error("stale"), { status: 409, code: "stale_revision" });
        }
        existing.revision += 1;
        existing.profile = structuredClone(args.profile);
        return { record: existing };
      }
      if (verb === "records.batch") {
        const items = args.items ?? [];
        for (const item of items) {
          const t = String(item.table);
          const id = String(item.record_id);
          tables[t].set(id, {
            id,
            revision: 1,
            profile: structuredClone(item.profile),
          });
        }
        return { created_count: items.length };
      }
      if (verb === "connections.ads.campaigns") {
        if (args.toolkit === "googleads" && failGoogleOnce) {
          failGoogleOnce = false;
          throw Object.assign(new Error("Temporary rate limit"), { status: 429, code: "rate_limited" });
        }
        if (args.toolkit === "metaads") {
          return {
            toolkit: "metaads",
            platform: "meta",
            connection_id: args.connection_id,
            account_id: args.account_id,
            login_customer_id: null,
            currency: "HKD",
            status: "ok",
            truncated: false,
            synced_at: "2026-11-24T05:00:00.000Z",
            levels: { campaigns: 2, ads: null },
            ads_status: "not_imported",
            warnings: [],
            campaigns: [
              {
                external_campaign_id: "m_cmp_1",
                name: "Meta Active",
                objective: "OUTCOME_SALES",
                status: "ACTIVE",
                daily_budget_minor: 40000,
                spend_7d_minor: 150000,
                impressions_7d: 9000,
                clicks_7d: 310,
                google_conversions: null,
                meta_actions_json: [{ actionType: "purchase", value: 12 }],
                cpa_minor: 12500,
              },
              {
                external_campaign_id: "m_cmp_2",
                name: "Meta Paused",
                objective: "OUTCOME_LEADS",
                status: "PAUSED",
                daily_budget_minor: 20000,
                spend_7d_minor: 0,
                impressions_7d: 0,
                clicks_7d: 0,
                google_conversions: null,
                meta_actions_json: [],
                cpa_minor: null,
              },
            ],
          };
        }
        return {
          toolkit: "googleads",
          platform: "google",
          connection_id: args.connection_id,
          account_id: args.account_id,
          login_customer_id: args.login_customer_id ?? null,
          currency: "HKD",
          status: "ok",
          truncated: false,
          synced_at: "2026-11-24T05:01:00.000Z",
          levels: { campaigns: 1, ads: null },
          ads_status: "not_imported",
          warnings: [],
          campaigns: [
            {
              external_campaign_id: "g_cmp_1",
              name: "Google Brand Search",
              objective: "SEARCH",
              status: "ACTIVE",
              daily_budget_minor: 60000,
              spend_7d_minor: 220000,
              impressions_7d: 14000,
              clicks_7d: 720,
              google_conversions: 20,
              meta_actions_json: null,
              cpa_minor: 11000,
            },
          ],
        };
      }
      throw new Error(`unexpected verb ${verb}`);
    };

    const selected = [
      {
        pickerId: "meta:con_m:act_5551234",
        connectionId: "con_m",
        platform: "meta",
        externalAccountId: "act_5551234",
        loginCustomerId: null,
        displayName: "Roastery Meta",
        currency: "HKD",
        timezone: "Asia/Hong_Kong",
      },
      {
        pickerId: "google:con_g:4128903310",
        connectionId: "con_g",
        platform: "google",
        externalAccountId: "412-890-3310",
        loginCustomerId: "9012240018",
        displayName: "Brand HK Client",
        currency: "HKD",
        timezone: "Asia/Hong_Kong",
      },
    ];

    const firstPass = await confirmAndImportAccounts({
      scope,
      call: fakeCall,
      picks: selected,
      existingAccounts: [],
      existingCampaigns: [],
    });

    const firstImportIdx = log.indexOf("connections.ads.campaigns");
    expect(log.slice(0, firstImportIdx)).toEqual([
      "records.create:ad_accounts",
      "records.create:ad_accounts",
    ]);
    expect(tables.ad_accounts.size).toBe(2);
    expect(tables.ad_campaigns.size).toBe(2);
    expect(firstPass.importedCampaignCount).toBe(2);
    expect(firstPass.adsStatus).toBe("not_imported");
    expect(firstPass.outcomes[1]).toMatchObject({
      status: "failed",
      code: "rate_limited",
      retryable: true,
      needsReconnect: false,
    });

    const googleRecord = [...tables.ad_accounts.values()].find((r) => r.profile.platform === "google");
    const googleRetry = await syncSingleAccountCampaigns({
      scope,
      call: fakeCall,
      account: googleRecord,
      connectionId: "con_g",
      existingCampaigns: [...tables.ad_campaigns.values()],
    });
    expect(googleRetry.status).toBe("ok");
    expect(tables.ad_campaigns.size).toBe(3);

    const metaRecord = [...tables.ad_accounts.values()].find((r) => r.profile.platform === "meta");
    await syncSingleAccountCampaigns({
      scope,
      call: fakeCall,
      account: metaRecord,
      connectionId: "con_m",
      existingCampaigns: [...tables.ad_campaigns.values()],
    });
    expect(tables.ad_campaigns.size).toBe(3);
    const metaCampaign = [...tables.ad_campaigns.values()].find(
      (c) => c.profile.external_campaign_id === "m_cmp_1",
    );
    expect(metaCampaign.revision).toBe(2);
    expect(metaCampaign.profile.ad_sets_json).toEqual([]);
  });
});
