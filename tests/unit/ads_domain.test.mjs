import { describe, expect, test } from "bun:test";
import {
  CPA_OUTLIER_THRESHOLD_MINOR,
  HOSTED_WIKI_UPLOAD_MAX_BYTES,
  NATIVE_WIKI_UPLOAD_MAX_BYTES,
  STARTER_SEED,
  assetCapStatus,
  checkRsaLimits,
  computeChannelPacing,
  evaluateAdCopyPolicy,
  filterCampaigns,
  googleRsaHalfWidthLength,
  isCpaOutlier,
  isOverDailyGuardrail,
  isStarterDataset,
  summarizeOverview,
  validateAccountInput,
  validateCreativePointer,
} from "../../src/domain/ads.ts";
import { fmtCompactMoney, fmtMoney, parseMajorToMinor } from "../../src/domain/money.ts";

describe("money formatting and parsing", () => {
  test("formats multi-currency minor units and compact figures accurately", () => {
    expect(fmtMoney(1842050, "HKD")).toBe("HK$18,420.50");
    expect(fmtMoney(125000, "USD")).toBe("US$1250.00".replace("1250", "1,250"));
    expect(fmtMoney(1250, "EUR")).toBe("€12.50");
    expect(fmtMoney(5000, "GBP")).toBe("£50.00");
    expect(fmtMoney(1000, "SGD")).toBe("SGD 10.00");
    expect(fmtMoney(-25000, "HKD")).toBe("-HK$250.00");
    expect(fmtMoney(null, "USD")).toBe("—");
    expect(fmtCompactMoney(250000, "HKD")).toBe("HK$2.5k");
    expect(fmtCompactMoney(120000, "USD")).toBe("US$1.2k");
    expect(fmtCompactMoney(80000, "HKD")).toBe("HK$800");
  });

  test("parses user-entered major currency safely to integer minor units", () => {
    expect(parseMajorToMinor("1,500.00")).toBe(150000);
    expect(parseMajorToMinor("2500.5")).toBe(250050);
    expect(parseMajorToMinor("-10")).toBeNull();
    expect(parseMajorToMinor("12.345")).toBeNull();
    expect(parseMajorToMinor("")).toBeNull();
  });
});

describe("ads domain guardrails and split reporting", () => {
  test("summarizeOverview keeps Google conversions and Meta action types strictly separate", () => {
    const summary = summarizeOverview(STARTER_SEED.campaigns);
    expect(summary.totalSpendMinor).toBe(1842050);
    expect(summary.googleConversions).toBe(110);
    expect(summary.metaPurchases).toBe(68);
    expect(summary.metaLeads).toBe(41);
    expect(summary.trackedCount).toBe(6);
  });

  test("CPA outliers and daily guardrails compare integer minor units", () => {
    expect(isCpaOutlier(CPA_OUTLIER_THRESHOLD_MINOR)).toBe(false);
    expect(isCpaOutlier(CPA_OUTLIER_THRESHOLD_MINOR + 1)).toBe(true);
    expect(isCpaOutlier(null)).toBe(false);
    expect(isOverDailyGuardrail(260000, 250000)).toBe(true);
    expect(isOverDailyGuardrail(250000, 250000)).toBe(false);
  });

  test("assetCapStatus aligns with 15 MiB hosted Wiki limit and 100 MB native limit", () => {
    expect(assetCapStatus(HOSTED_WIKI_UPLOAD_MAX_BYTES)).toBe("within_hosted");
    expect(assetCapStatus(HOSTED_WIKI_UPLOAD_MAX_BYTES + 1)).toBe("native_only");
    expect(assetCapStatus(NATIVE_WIKI_UPLOAD_MAX_BYTES)).toBe("native_only");
    expect(assetCapStatus(NATIVE_WIKI_UPLOAD_MAX_BYTES + 1)).toBe("exceeds_both");
  });

  test("checkRsaLimits validates Google RSA 30-char headline and 90-char description caps", () => {
    expect(checkRsaLimits(["Specialty Coffee Delivered"], ["Freshly roasted in HK weekly."])).toEqual({
      ok: true,
      headlineViolations: 0,
      descriptionViolations: 0,
    });
    expect(
      checkRsaLimits(["X".repeat(31)], ["Y".repeat(91)]),
    ).toEqual({
      ok: false,
      headlineViolations: 1,
      descriptionViolations: 1,
    });
  });

  test("filterCampaigns filters by platform, status, and text query", () => {
    const rows = STARTER_SEED.campaigns.map((c, idx) => ({
      id: `camp-${idx}`,
      revision: 1,
      profile: c,
    }));
    const limitedGoogle = filterCampaigns(rows, { platform: "google", status: "LIMITED", query: "" });
    expect(limitedGoogle).toHaveLength(1);
    expect(limitedGoogle[0].profile.campaign_key).toBe("cmp_google_202");

    const searched = filterCampaigns(rows, { platform: "all", status: "all", query: "retargeting" });
    expect(searched).toHaveLength(1);
    expect(searched[0].profile.campaign_key).toBe("cmp_meta_103");
  });

  test("googleRsaHalfWidthLength and evaluateAdCopyPolicy count CJK double-width and block superlatives", () => {
    const exact30 = "單品咖啡豆每週新鮮烘焙直送家中";
    expect([...exact30].length).toBe(15);
    expect(googleRsaHalfWidthLength(exact30)).toBe(30);

    const over30 = `${exact30}A`;
    expect(googleRsaHalfWidthLength(over30)).toBe(31);
    expect(checkRsaLimits([exact30], ["Fresh seasonal lots from HK$180."]).ok).toBe(true);
    expect(checkRsaLimits([over30], ["OK"])).toEqual({
      ok: false,
      headlineViolations: 1,
      descriptionViolations: 0,
    });

    const policy = evaluateAdCopyPolicy({
      channel: "meta",
      headlines: ["Best coffee in town", "Fresh weekly roast"],
      descriptions: ["Guaranteed results"],
      primaryText: "Save on seasonal beans.",
    });
    expect(policy.ok).toBe(false);
    expect(policy.issues.length).toBeGreaterThanOrEqual(2);
  });

  test("validateAccountInput enforces Meta act_ and Google customer/MCC formats", () => {
    const metaOk = validateAccountInput({
      platform: "meta",
      external_account_id: "act_987654321",
      display_name: "Demo Brand Meta",
      currency: "usd",
      timezone: "America/Los_Angeles",
      daily_guardrail_minor: 150000,
    });
    expect(metaOk.ok).toBe(true);
    if (metaOk.ok) {
      expect(metaOk.value.currency).toBe("USD");
      expect(metaOk.value.account_key).toBe("meta_act_987654321");
    }

    const metaWithMcc = validateAccountInput({
      platform: "meta",
      external_account_id: "act_987654321",
      login_customer_id: "123-456-7890",
      display_name: "Bad Meta",
      currency: "HKD",
      timezone: "Asia/Hong_Kong",
      daily_guardrail_minor: 150000,
    });
    expect(metaWithMcc.ok).toBe(false);

    const googleOk = validateAccountInput({
      platform: "google",
      external_account_id: "445-120-9910",
      login_customer_id: "990-100-2000",
      display_name: "Demo Brand Google",
      currency: "USD",
      timezone: "America/New_York",
      daily_guardrail_minor: 200000,
    });
    expect(googleOk.ok).toBe(true);
    if (googleOk.ok) {
      expect(googleOk.value.login_customer_id).toBe("990-100-2000");
    }
  });

  test("validateCreativePointer requires real wiki_path and 64-hex sha256", () => {
    const sha = "a".repeat(64);
    const valid = validateCreativePointer({
      name: "hero.webp",
      media_kind: "image",
      mime: "image/webp",
      dimensions: "1080×1080",
      duration_seconds: null,
      size_bytes: 1_240_000,
      wiki_path: "/global/ads-studio/assets/hero.webp",
      sha256: sha.toUpperCase(),
      target_campaign: "Spring Search",
    });
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(valid.value.wiki_path).toBe("global/ads-studio/assets/hero.webp");
      expect(valid.value.sha256).toBe(sha);
      expect(valid.value.sync_status).toBe("workspace_only");
    }

    const oversized = validateCreativePointer({
      name: "cut.mp4",
      media_kind: "video",
      mime: "video/mp4",
      dimensions: "1080×1920",
      duration_seconds: 15,
      size_bytes: HOSTED_WIKI_UPLOAD_MAX_BYTES + 1,
      wiki_path: "global/ads-studio/assets/cut.mp4",
      sha256: "b".repeat(64),
      target_campaign: "Spring Reels",
    });
    expect(oversized.ok).toBe(true);
    if (oversized.ok) {
      expect(oversized.value.sync_status).toBe("over_hosted_cap");
    }

    const badSha = validateCreativePointer({
      name: "hero.webp",
      media_kind: "image",
      mime: "image/webp",
      dimensions: "1080×1080",
      duration_seconds: null,
      size_bytes: 1024,
      wiki_path: "../secret.webp",
      sha256: "not-a-sha",
      target_campaign: "Test",
    });
    expect(badSha.ok).toBe(false);
  });

  test("computeChannelPacing and isStarterDataset separate live workspaces from starter seed", () => {
    expect(isStarterDataset([])).toBe(false);
    expect(
      isStarterDataset(STARTER_SEED.campaigns.map((c, i) => ({ id: `${i}`, revision: 1, profile: c }))),
    ).toBe(true);

    const liveAcct = {
      id: "acct-live",
      revision: 1,
      profile: {
        ...STARTER_SEED.accounts[1],
        account_key: "google_live_1",
        currency: "USD",
        daily_guardrail_minor: 300000,
      },
    };
    const liveCamp = {
      id: "camp-live",
      revision: 1,
      profile: {
        ...STARTER_SEED.campaigns[3],
        campaign_key: "cmp_live_901",
        account_key: "google_live_1",
        status: "ACTIVE",
        daily_budget_minor: 100000,
        spend_7d_minor: 700000,
      },
    };
    expect(isStarterDataset([liveCamp])).toBe(false);
    expect(computeChannelPacing([liveCamp], [liveAcct])).toEqual([
      {
        platform: "google",
        avgDailySpendMinor: 100000,
        dailyBudgetMinor: 100000,
        guardrailMinor: 300000,
        spend7dMinor: 700000,
      },
    ]);
  });
});
