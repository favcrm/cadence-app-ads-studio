---
app: ads-studio
title: Ads Studio
version: '0.5.0'
summary: Cross-channel Meta Ads and Google Ads console for spend guardrails, owner-approved changes, and Workspace media pointers.
needs:
  connections: []
  requires:
    contracts: {app-screens: [1], screen-records: [1], screen-startup: [1], app-storage: [1]}
listing:
  tagline: Review Meta and Google Ads spend with owner-approved changes
  category: marketing
  tags: [ads, meta, google]
  icon: assets/ads-studio.svg
  publisher:
    name: Cadence
  about: Ads Studio brings Meta Ads and Google Ads campaigns into one Cadence workspace. Authorize and pin Meta Ads or Google Ads accounts in Settings Connections, import them directly in Add Ad Account via owner-only connections.assets discovery, track daily spend guardrails, sync live 7-day spend and split conversions via Composio connectors, spot CPA outliers, review staged proposals before they apply, check CJK half-width Google RSA and Meta ad copy rules, and deliver creatives via signed Workspace Files URLs or YouTube video IDs.
  can:
    - Import authorized Meta and Google Ads accounts directly from Composio OAuth connections
    - Track Meta Ads and Google Ads campaigns with separate conversion reporting
    - Enforce daily spend guardrails and highlight high-CPA outliers
    - Stage campaign, budget, and status changes for explicit owner approval
    - Store image and video pointers linked to Workspace Files
  screenshots: []
  setup: []
  data:
    stores:
      - Ad accounts, campaigns, and daily spend guardrails
      - Staged spend/status change proposals and append-only audit events
      - Workspace Media asset pointers with sha256 and path metadata only
    personal: false
  i18n:
    zh-TW:
      title: 廣告工作台
      tagline: 統一檢視 Meta 與 Google 廣告支出並以負責人審批控管變更
      summary: 在同一工作區追蹤 Meta 與 Google 廣告活動、設定每日支出護欄、審批預算與狀態調整，並管理工作區素材指標。
  changes:
    - version: '0.5.0'
      notes:
        - Pick authorized Meta and Google Ads accounts directly from Composio OAuth connections
        - Auto-fill display name, external ID, currency, and timezone from Settings Connections
        - Keep manual ad account entry as a collapsible fallback when connections are unavailable
      keeps: Existing ad accounts, campaigns, staged proposals, creative pointers, and audit events stay unchanged
    - version: '0.4.0'
      notes:
        - Support host Settings Connections ad-account pinning and read-only campaign sync
        - Normalize YouTube video IDs and URLs alongside temporary signed Workspace media pointers
        - Update screen copy, zh-HK locales, and bundled skills for hosted creative delivery
      keeps: Existing ad accounts, campaigns, staged proposals, creative pointers, and audit events stay unchanged
    - version: '0.3.0'
      notes:
        - Add real Meta and Google ad-account onboarding with multi-currency formatting and pointer validation
        - Add interactive Google Search RSA half-width CJK and Meta ad copy policy checkers in Creatives
        - Add bundled ads-sync skill and update specialist skills for media discovery and connected approvals
      keeps: Existing ad accounts, campaigns, staged proposals, creative pointers, and audit events stay unchanged
    - version: '0.2.0'
      notes:
        - Add four bundled assistant skills for spend audits, staged proposals, and creative policy checks
      keeps: Existing ad accounts, campaigns, staged proposals, creative pointers, and audit events stay unchanged
---

# Ads Studio

This bundle carries the installed app identity `ads-studio` and one
app-owned screen (`ads-studio`) with five sections under
`screens/ads-studio/`: Overview, Campaigns, Changes, Creatives, and Accounts.

Shared controls come from the pinned `@cadence/screen-ui` SDK and
`@cadence/app-kit@0.8.0` (`screen.v2`, `screen-records.v1`,
`screen-surfaces.v1`, `screen-canvas.v1`, `screen-route-params.v1`,
`screen-locale.v1`). Scoped storage, authorization, and the audit journal
remain host-owned.

## Storage & Media Architecture

Five owner-only tables live in `app-storage.json` (`storage/001-initial.json`):
- `ad_accounts` (default table, immutable `account_key`)
- `ad_campaigns` (references `ad_accounts.account_key`)
- `ad_proposals` (owner-approved staged budget/status changes)
- `creative_assets` (scalar metadata + `wiki_path` + `sha256` pointers only — binary images/videos stay in Workspace Files R2 blobs)
- `audit_events` (`append_only` journal)

All monetary figures use integer minor units (`*_minor`) paired with currency.
Account selection (`Settings -> Connections` asset pinning) and qualified media signing (`/api/wiki/media/sign` for `<= 15 MiB` `Range` delivery or `youtube_video_id:<id>` for `> 15 MiB` Google Ads videos) are host-enforced.

## Assistant access

The assistant reads and stages records through the five `records.*` verbs (`records.list`, `records.show`, `records.create`, `records.update`, and `records.batch`) declared by `screens/ads-studio/screens.json`. The UI screen also declares owner-only `connections.assets` so the onboarding drawer can list authorized Composio ad accounts without ever reading OAuth credentials. All tables require owner reads, and staged writes await explicit owner approval before committing.

Five bundled skills under `skills/` guide assistant workflows:
- `ads-operator` — routes paid-acquisition questions and enforces owner-approval, multi-currency minor-unit, and separated-conversion rules
- `ads-sync` — checks `metaads`/`googleads` OAuth status, normalizes live campaign & 7-day insights (`cost_micros / 10000` for Google), and batch-writes `ad_accounts`/`ad_campaigns`/`audit_events`
- `spend-audit` — read-only spend pacing, CPA outlier, pending-proposal, and audit-log inspection via paginated `records.list` / `records.show` reads and section-based `canvas_open` views
- `spend-proposal` — validates guardrails, stages one `pending` change in `ad_proposals`, and triggers qualified host `connected_effect` confirmation cards via `use_tool` when linked
- `creative-audit` — discovers Workspace media via `wiki_list({ media: "all" })`, registers verified `creative_assets` pointers (`15 MiB` hosted / `100 MB` native), and audits CJK half-width Google RSA / Meta ad copy against `rubrics/ad-policy.md`
