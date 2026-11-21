import { describe, expect, test } from "bun:test";
import {
  CPA_OUTLIER_THRESHOLD_MINOR,
  HOSTED_WIKI_UPLOAD_MAX_BYTES,
  NATIVE_WIKI_UPLOAD_MAX_BYTES,
  STARTER_SEED,
  assetCapStatus,
  checkRsaLimits,
  filterCampaigns,
  isCpaOutlier,
  isOverDailyGuardrail,
  summarizeOverview,
} from "../../src/domain/ads.ts";
import { fmtCompactMoney, fmtMoney, parseMajorToMinor } from "../../src/domain/money.ts";

describe("money formatting and parsing", () => {
  test("formats HKD minor units and compact figures accurately", () => {
    expect(fmtMoney(1842050, "HKD")).toBe("HK$18,420.50");
    expect(fmtMoney(-25000, "HKD")).toBe("-HK$250.00");
    expect(fmtMoney(null, "HKD")).toBe("—");
    expect(fmtCompactMoney(250000, "HKD")).toBe("HK$2.5k");
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
});
