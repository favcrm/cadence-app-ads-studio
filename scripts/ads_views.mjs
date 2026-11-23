// Ads Studio declared canvas views (screen-route-params.v1): single source of truth
// for build_screen.mjs (`screens.json` `views`) and verify_screen.mjs.
export const views = [
  {
    id: "overview",
    label: { en: "Overview", "zh-TW": "總覽" },
    section: "overview",
    params: {
      range: { type: "enum", values: ["7d", "30d", "month"] },
      platform: { type: "enum", values: ["all", "meta", "google"] },
    },
  },
  {
    id: "campaigns",
    label: { en: "Campaigns", "zh-TW": "廣告活動" },
    section: "campaigns",
    params: {
      range: { type: "enum", values: ["7d", "30d", "month"] },
      platform: { type: "enum", values: ["all", "meta", "google"] },
      status: { type: "enum", values: ["all", "ACTIVE", "PAUSED", "LIMITED"] },
      q: { type: "string" },
    },
  },
  {
    id: "campaign_audit",
    label: { en: "Campaign audit", "zh-TW": "廣告活動稽核" },
    section: "campaigns",
    params: {
      range: { type: "enum", values: ["7d", "30d", "month"] },
      platform: { type: "enum", values: ["all", "meta", "google"] },
      status: { type: "enum", values: ["all", "ACTIVE", "PAUSED", "LIMITED"] },
      q: { type: "string" },
    },
  },
  {
    id: "campaign",
    label: { en: "Campaign by id", "zh-TW": "指定廣告活動" },
    section: "campaigns",
    params: {
      id: { type: "string" },
    },
  },
  {
    id: "proposals",
    label: { en: "Changes", "zh-TW": "變更提案" },
    section: "proposals",
    params: {},
  },
  {
    id: "creatives",
    label: { en: "Creatives", "zh-TW": "廣告素材" },
    section: "creatives",
    params: {},
  },
  {
    id: "accounts",
    label: { en: "Accounts", "zh-TW": "帳號與連線" },
    section: "accounts",
    params: {},
  },
];
