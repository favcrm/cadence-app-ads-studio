export type Platform = "meta" | "google";
export type CampaignStatus = "ACTIVE" | "PAUSED" | "LIMITED";
export type ProposalStatus = "pending" | "applied" | "rejected";
export type ProposalActionType = "budget_update" | "pause" | "resume" | "create_campaign";
export type MediaKind = "image" | "video";
export type AssetSyncStatus =
  | "workspace_only"
  | "synced_meta"
  | "synced_google"
  | "over_hosted_cap";
export type AuditKind = "sync" | "proposal" | "alert" | "approval";

export const CPA_OUTLIER_THRESHOLD_MINOR = 18000; // HK$180.00
export const HOSTED_WIKI_UPLOAD_MAX_BYTES = 15 * 1024 * 1024; // 15 MiB (agenticos-v2 WIKI_UPLOAD_MAX)
export const NATIVE_WIKI_UPLOAD_MAX_BYTES = 100 * 1024 * 1024; // 100 MB (cadence MAX_UPLOAD_BYTES)

export interface MetaActionCount {
  actionType: string;
  value: number;
}

export interface AdSetItem {
  name: string;
  status: CampaignStatus;
  budgetMinor: number;
  spendMinor: number;
  clicks: number;
}

export interface StoredRecord<T> {
  id: string;
  revision: number;
  profile: T;
}

export interface AdAccountProfile {
  account_key: string;
  platform: Platform;
  external_account_id: string;
  login_customer_id: string | null;
  display_name: string;
  currency: string;
  timezone: string;
  status: "active" | "inactive";
  daily_guardrail_minor: number;
  scopes_text: string;
}

export interface AdCampaignProfile {
  campaign_key: string;
  account_key: string;
  platform: Platform;
  external_campaign_id: string;
  name: string;
  objective: string;
  status: CampaignStatus;
  daily_budget_minor: number;
  spend_7d_minor: number;
  impressions_7d: number;
  clicks_7d: number;
  google_conversions: number | null;
  meta_actions_json: MetaActionCount[] | null;
  cpa_minor: number | null;
  ad_sets_json: AdSetItem[];
}

export interface AdProposalProfile {
  proposal_key: string;
  account_key: string;
  campaign_key: string | null;
  campaign_name: string;
  platform: Platform;
  tool_slug: string;
  action_type: ProposalActionType;
  before_label: string;
  after_label: string;
  new_budget_minor: number | null;
  rationale: string;
  proposed_by: string;
  proposed_at: string;
  status: ProposalStatus;
  action_id_hex: string;
}

export interface CreativeAssetProfile {
  asset_key: string;
  name: string;
  media_kind: MediaKind;
  mime: string;
  dimensions: string;
  duration_seconds: number | null;
  size_bytes: number;
  wiki_path: string;
  sha256: string;
  sync_status: AssetSyncStatus;
  target_campaign: string;
  platform_ref: string;
}

export interface AuditEventProfile {
  event_key: string;
  kind: AuditKind;
  summary: string;
  summary_zh: string | null;
  occurred_at: string;
}

export interface OverviewSummary {
  totalSpendMinor: number;
  metaSpendMinor: number;
  googleSpendMinor: number;
  totalImpressions: number;
  totalClicks: number;
  ctrText: string;
  blendedCpcMinor: number | null;
  googleConversions: number;
  metaPurchases: number;
  metaLeads: number;
  trackedCount: number;
}

export function isCpaOutlier(cpaMinor: number | null): boolean {
  return cpaMinor !== null && cpaMinor > CPA_OUTLIER_THRESHOLD_MINOR;
}

export function isOverDailyGuardrail(budgetMinor: number | null, guardrailMinor: number): boolean {
  return budgetMinor !== null && budgetMinor > guardrailMinor;
}

export function assetCapStatus(sizeBytes: number): "within_hosted" | "native_only" | "exceeds_both" {
  if (sizeBytes <= HOSTED_WIKI_UPLOAD_MAX_BYTES) return "within_hosted";
  if (sizeBytes <= NATIVE_WIKI_UPLOAD_MAX_BYTES) return "native_only";
  return "exceeds_both";
}

export function formatBytesCompact(sizeBytes: number): string {
  if (sizeBytes >= 1024 * 1024) return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  if (sizeBytes >= 1024) return `${Math.round(sizeBytes / 1024)} KB`;
  return `${sizeBytes} B`;
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return "";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function checkRsaLimits(
  headlines: readonly string[],
  descriptions: readonly string[],
): { ok: boolean; headlineViolations: number; descriptionViolations: number } {
  const headlineViolations = headlines.filter((h) => h.length > 30).length;
  const descriptionViolations = descriptions.filter((d) => d.length > 90).length;
  return {
    ok: headlineViolations === 0 && descriptionViolations === 0,
    headlineViolations,
    descriptionViolations,
  };
}

export function summarizeOverview(campaigns: readonly AdCampaignProfile[]): OverviewSummary {
  const totalSpendMinor = campaigns.reduce((s, c) => s + c.spend_7d_minor, 0);
  const metaSpendMinor = campaigns
    .filter((c) => c.platform === "meta")
    .reduce((s, c) => s + c.spend_7d_minor, 0);
  const googleSpendMinor = campaigns
    .filter((c) => c.platform === "google")
    .reduce((s, c) => s + c.spend_7d_minor, 0);
  const totalImpressions = campaigns.reduce((s, c) => s + c.impressions_7d, 0);
  const totalClicks = campaigns.reduce((s, c) => s + c.clicks_7d, 0);
  const ctrText =
    totalImpressions > 0 ? `${((totalClicks / totalImpressions) * 100).toFixed(2)}%` : "—";
  const blendedCpcMinor = totalClicks > 0 ? Math.round(totalSpendMinor / totalClicks) : null;
  const googleConversions = campaigns
    .filter((c) => c.platform === "google" && c.google_conversions !== null)
    .reduce((s, c) => s + (c.google_conversions ?? 0), 0);

  let metaPurchases = 0;
  let metaLeads = 0;
  for (const c of campaigns) {
    if (c.platform !== "meta" || !Array.isArray(c.meta_actions_json)) continue;
    for (const act of c.meta_actions_json) {
      if (act.actionType === "purchase") metaPurchases += act.value;
      else if (act.actionType === "lead") metaLeads += act.value;
    }
  }

  return {
    totalSpendMinor,
    metaSpendMinor,
    googleSpendMinor,
    totalImpressions,
    totalClicks,
    ctrText,
    blendedCpcMinor,
    googleConversions,
    metaPurchases,
    metaLeads,
    trackedCount: campaigns.length,
  };
}

export function filterCampaigns<T extends AdCampaignProfile>(
  rows: readonly StoredRecord<T>[],
  filter: { platform: "all" | Platform; status: "all" | CampaignStatus; query: string },
): StoredRecord<T>[] {
  const q = filter.query.trim().toLowerCase();
  return rows.filter(({ profile: c }) => {
    if (filter.platform !== "all" && c.platform !== filter.platform) return false;
    if (filter.status !== "all" && c.status !== filter.status) return false;
    if (
      q &&
      !c.name.toLowerCase().includes(q) &&
      !c.external_campaign_id.toLowerCase().includes(q) &&
      !c.account_key.toLowerCase().includes(q)
    ) {
      return false;
    }
    return true;
  });
}

/** Deterministic daily 7-day synthetic pacing buckets matching starter campaigns (HK$18,420.50 total). */
export const STARTER_DAILY_PACING: readonly { day: string; googleMinor: number; metaMinor: number }[] = [
  { day: "Mon", googleMinor: 98000, metaMinor: 128000 },
  { day: "Tue", googleMinor: 112000, metaMinor: 144000 },
  { day: "Wed", googleMinor: 108000, metaMinor: 152000 },
  { day: "Thu", googleMinor: 124000, metaMinor: 168000 },
  { day: "Fri", googleMinor: 138000, metaMinor: 184000 },
  { day: "Sat", googleMinor: 102000, metaMinor: 152000 },
  { day: "Sun", googleMinor: 97650, metaMinor: 134400 },
];

export const STARTER_SEED: {
  accounts: AdAccountProfile[];
  campaigns: AdCampaignProfile[];
  proposals: AdProposalProfile[];
  assets: CreativeAssetProfile[];
  auditEvents: AuditEventProfile[];
} = {
  accounts: [
    {
      account_key: "meta_hk_main",
      platform: "meta",
      external_account_id: "act_884210942",
      login_customer_id: null,
      display_name: "Harbour Roasters HK",
      currency: "HKD",
      timezone: "Asia/Hong_Kong",
      status: "active",
      daily_guardrail_minor: 250000,
      scopes_text: "ads_read,ads_management,business_management",
    },
    {
      account_key: "google_hk_search",
      platform: "google",
      external_account_id: "412-890-3310",
      login_customer_id: "901-224-0018",
      display_name: "Harbour Roasters Search",
      currency: "HKD",
      timezone: "Asia/Hong_Kong",
      status: "active",
      daily_guardrail_minor: 200000,
      scopes_text: "adwords (Google Ads API scope — server-side effect gate)",
    },
  ],
  campaigns: [
    {
      campaign_key: "cmp_meta_101",
      account_key: "meta_hk_main",
      platform: "meta",
      external_campaign_id: "1202149088310402",
      name: "Single Origin Bean Subscription — Prospecting",
      objective: "OUTCOME_SALES",
      status: "ACTIVE",
      daily_budget_minor: 120000,
      spend_7d_minor: 618400,
      impressions_7d: 184200,
      clicks_7d: 4920,
      google_conversions: null,
      meta_actions_json: [
        { actionType: "purchase", value: 44 },
        { actionType: "offsite_conversion.fb_pixel_purchase", value: 44 },
      ],
      cpa_minor: 14055,
      ad_sets_json: [
        { name: "Broad HK 24-45 Coffee Enthusiasts", status: "ACTIVE", budgetMinor: 75000, spendMinor: 392000, clicks: 3110 },
        { name: "IG Engagers 30d Lookalike 2%", status: "ACTIVE", budgetMinor: 45000, spendMinor: 226400, clicks: 1810 },
      ],
    },
    {
      campaign_key: "cmp_google_201",
      account_key: "google_hk_search",
      platform: "google",
      external_campaign_id: "21849920144",
      name: "Search — Specialty Coffee Beans HK (Exact/Phrase)",
      objective: "SEARCH",
      status: "ACTIVE",
      daily_budget_minor: 95000,
      spend_7d_minor: 531250,
      impressions_7d: 62400,
      clicks_7d: 3840,
      google_conversions: 98,
      meta_actions_json: null,
      cpa_minor: 5421,
      ad_sets_json: [
        { name: "Specialty Coffee Beans HK", status: "ACTIVE", budgetMinor: 55000, spendMinor: 318000, clicks: 2350 },
        { name: "Pour Over Drip Bags Office", status: "ACTIVE", budgetMinor: 40000, spendMinor: 213250, clicks: 1490 },
      ],
    },
    {
      campaign_key: "cmp_meta_102",
      account_key: "meta_hk_main",
      platform: "meta",
      external_campaign_id: "1202149088744109",
      name: "Office Cold Brew Tasting Pack — B2B Leads",
      objective: "OUTCOME_LEADS",
      status: "ACTIVE",
      daily_budget_minor: 60000,
      spend_7d_minor: 342000,
      impressions_7d: 98100,
      clicks_7d: 2410,
      google_conversions: null,
      meta_actions_json: [
        { actionType: "lead", value: 41 },
        { actionType: "onsite_conversion.lead_grouped", value: 39 },
      ],
      cpa_minor: 8341,
      ad_sets_json: [
        { name: "Central & Quarry Bay Office Admins", status: "ACTIVE", budgetMinor: 60000, spendMinor: 342000, clicks: 2410 },
      ],
    },
    {
      campaign_key: "cmp_google_202",
      account_key: "google_hk_search",
      platform: "google",
      external_campaign_id: "21849928810",
      name: "PMax — Espresso Machine Bundle (HK Island)",
      objective: "PERFORMANCE_MAX",
      status: "LIMITED",
      daily_budget_minor: 80000,
      spend_7d_minor: 248400,
      impressions_7d: 112400,
      clicks_7d: 2680,
      google_conversions: 12,
      meta_actions_json: null,
      cpa_minor: 20700,
      ad_sets_json: [
        { name: "Home Barista Asset Group", status: "LIMITED", budgetMinor: 80000, spendMinor: 248400, clicks: 2680 },
      ],
    },
    {
      campaign_key: "cmp_meta_103",
      account_key: "meta_hk_main",
      platform: "meta",
      external_campaign_id: "1202149091028335",
      name: "Cart Abandoners 14d — Dynamic Retargeting",
      objective: "OUTCOME_SALES",
      status: "ACTIVE",
      daily_budget_minor: 35000,
      spend_7d_minor: 102000,
      impressions_7d: 25810,
      clicks_7d: 830,
      google_conversions: null,
      meta_actions_json: [{ actionType: "purchase", value: 24 }],
      cpa_minor: 4250,
      ad_sets_json: [
        { name: "Checkout Initiated No Purchase 14d", status: "ACTIVE", budgetMinor: 35000, spendMinor: 102000, clicks: 830 },
      ],
    },
    {
      campaign_key: "cmp_google_203",
      account_key: "google_hk_search",
      platform: "google",
      external_campaign_id: "21849931002",
      name: "Brand Defence — Harbour Roasters HK",
      objective: "SEARCH",
      status: "PAUSED",
      daily_budget_minor: 25000,
      spend_7d_minor: 0,
      impressions_7d: 0,
      clicks_7d: 0,
      google_conversions: null,
      meta_actions_json: null,
      cpa_minor: null,
      ad_sets_json: [
        { name: "Brand Exact Terms", status: "PAUSED", budgetMinor: 25000, spendMinor: 0, clicks: 0 },
      ],
    },
  ],
  proposals: [
    {
      proposal_key: "prop_901",
      account_key: "meta_hk_main",
      campaign_key: "cmp_meta_101",
      campaign_name: "Single Origin Bean Subscription — Prospecting",
      platform: "meta",
      tool_slug: "meta_ads_update_campaign",
      action_type: "budget_update",
      before_label: "Daily budget: HK$1,200.00",
      after_label: "Daily budget: HK$1,500.00",
      new_budget_minor: 150000,
      rationale: "7d CPA is HK$140.55 vs HK$165 target; purchase volume steady across Broad HK.",
      proposed_by: "Ads Assistant",
      proposed_at: "2026-11-21T08:40:00Z",
      status: "pending",
      action_id_hex: "a4f92c810e1b4d7c92a015e384b610f2",
    },
    {
      proposal_key: "prop_902",
      account_key: "google_hk_search",
      campaign_key: "cmp_google_202",
      campaign_name: "PMax — Espresso Machine Bundle (HK Island)",
      platform: "google",
      tool_slug: "google_ads_update_campaign_status",
      action_type: "pause",
      before_label: "Status: LIMITED (CPA HK$207.00)",
      after_label: "Status: PAUSED",
      new_budget_minor: null,
      rationale: "7d CPA HK$207.00 exceeds HK$180 ceiling and campaign is budget/asset limited.",
      proposed_by: "Ads Assistant",
      proposed_at: "2026-11-21T07:50:00Z",
      status: "pending",
      action_id_hex: "d83b71e2c50449a8b123770c9a8411e4",
    },
    {
      proposal_key: "prop_900",
      account_key: "meta_hk_main",
      campaign_key: "cmp_meta_103",
      campaign_name: "Cart Abandoners 14d — Dynamic Retargeting",
      platform: "meta",
      tool_slug: "meta_ads_update_campaign",
      action_type: "budget_update",
      before_label: "Daily budget: HK$250.00",
      after_label: "Daily budget: HK$350.00",
      new_budget_minor: 35000,
      rationale: "Retargeting CPA at HK$42.50 with 24 purchases; safe step-up inside daily cap.",
      proposed_by: "Owner",
      proposed_at: "2026-11-20T14:20:00Z",
      status: "applied",
      action_id_hex: "77c0912a34fe49bc82105518ad902b11",
    },
  ],
  assets: [
    {
      asset_key: "ast_img_01",
      name: "single-origin-square.webp",
      media_kind: "image",
      mime: "image/webp",
      dimensions: "1080×1080",
      duration_seconds: null,
      size_bytes: 1468006,
      wiki_path: "global/ads-studio/assets/images/single-origin-square.webp",
      sha256: "8b41c2f90e12d44a7c89103b44d109c7e22f89014c8309a7c2f109e8d412e910",
      sync_status: "synced_meta",
      target_campaign: "Single Origin Bean Subscription — Prospecting",
      platform_ref: "meta_image_hash: a94f10e88c21",
    },
    {
      asset_key: "ast_vid_01",
      name: "pour-over-reel-12s.mp4",
      media_kind: "video",
      mime: "video/mp4",
      dimensions: "1080×1920",
      duration_seconds: 12,
      size_bytes: 12373196,
      wiki_path: "global/ads-studio/assets/videos/pour-over-reel-12s.mp4",
      sha256: "3a90f712bc449081de2271fa9803c1b540129fe80147ca21b0049812fe7044bc",
      sync_status: "workspace_only",
      target_campaign: "Single Origin Bean Subscription — Prospecting",
      platform_ref: "Ready · Meta Reels / Shorts",
    },
    {
      asset_key: "ast_img_02",
      name: "office-cold-brew-banner.jpg",
      media_kind: "image",
      mime: "image/jpeg",
      dimensions: "1200×628",
      duration_seconds: null,
      size_bytes: 860160,
      wiki_path: "global/ads-studio/assets/images/office-cold-brew-banner.jpg",
      sha256: "6e19d48810bc4722a80193ff0248bc1277019ea84c20193fa80192b4c770a072",
      sync_status: "synced_google",
      target_campaign: "Office Cold Brew Tasting Pack — B2B Leads",
      platform_ref: "google_asset_id: customers/4128903310/assets/9941201",
    },
    {
      asset_key: "ast_vid_02",
      name: "roastery-brand-film-45s.mp4",
      media_kind: "video",
      mime: "video/mp4",
      dimensions: "1080×1920",
      duration_seconds: 45,
      size_bytes: 29779558,
      wiki_path: "global/ads-studio/assets/videos/roastery-brand-film-45s.mp4",
      sha256: "d912a4f0081c229e4401fb89203ac5519820fe4109bc8214ea701928fc41b208",
      sync_status: "over_hosted_cap",
      target_campaign: "PMax — Espresso Machine Bundle (HK Island)",
      platform_ref: "Over 15 MiB hosted cap · Use YouTube / R2 direct",
    },
  ],
  auditEvents: [
    {
      event_key: "evt_04",
      kind: "sync",
      summary: "Synced 6 campaigns from Meta Ads & Google Ads",
      summary_zh: "已從 Meta Ads 與 Google Ads 同步 6 個廣告活動",
      occurred_at: "4m ago",
    },
    {
      event_key: "evt_03",
      kind: "proposal",
      summary: "Staged Meta daily budget increase: HK$1,200 → HK$1,500",
      summary_zh: "已暫存 Meta 每日預算調整：HK$1,200 → HK$1,500",
      occurred_at: "18m ago",
    },
    {
      event_key: "evt_02",
      kind: "alert",
      summary: "Flagged PMax Espresso Bundle CPA HK$207.00 (> HK$180 limit)",
      summary_zh: "警示：PMax Espresso Bundle CPA 達 HK$207.00（高於 HK$180 上限）",
      occurred_at: "1h ago",
    },
    {
      event_key: "evt_01",
      kind: "approval",
      summary: "Approved & applied retargeting budget: HK$250 → HK$350/day",
      summary_zh: "已核准並套用再行銷預算：HK$250 → HK$350/日",
      occurred_at: "Yesterday",
    },
  ],
};
