---
app: ads-studio
title: Ads Studio
version: '0.8.0'
summary: Cross-channel Meta Ads and Google Ads console for spend guardrails, owner-approved live changes, and Workspace media pointers.
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
  about: Ads Studio brings Meta Ads and Google Ads campaigns into one Cadence workspace. Connect ad platforms directly from the Accounts tab, toggle enabled or disabled accounts, track daily spend limits, sync live 7-day spend and split conversions, spot CPA outliers, stage real Meta/Google budget and status mutations through Cadence Home approval cards, check CJK half-width Google RSA and Meta ad copy rules, and deliver creatives via signed Workspace Files URLs or YouTube video IDs.
  can:
    - Connect Meta Ads and Google Ads platforms directly and toggle enabled or disabled accounts
    - Track Meta Ads and Google Ads campaigns with separate conversion reporting
    - Enforce daily spend limits and highlight high-CPA outliers
    - Stage live campaign and ad-set changes directly in Cadence Home for owner approval
    - Store image and video pointers linked to Workspace Files
  screenshots: []
  setup: []
  data:
    stores:
      - Ad accounts, campaigns, and daily spend guardrails
      - Append-only audit events and Workspace Media asset pointers with sha256 metadata only
    personal: false
  i18n:
    zh-TW:
      title: 廣告工作台
      tagline: 統一檢視 Meta 與 Google 廣告支出並以負責人審批控管變更
      summary: 在同一工作區追蹤 Meta 與 Google 廣告活動、設定每日支出護欄、透過主頁審批控管預算與狀態調整，並管理工作區素材指標。
  changes:
    - version: '0.8.0'
      notes:
        - Remove shadow Proposals tab so live spend and status changes approve once in Cadence Home
        - Simplify navigation to Overview, Campaigns, Creatives, and Accounts with compatible v1 storage
        - Update bundled skills for Meta conversions, adsets, ads, Google search terms, and UI, MCP, CLI
      keeps: Existing ad accounts, campaigns, historical proposals rows, creative pointers, and audit events stay intact
    - version: '0.7.0'
      notes:
        - Open focused Accounts picker immediately on post-OAuth return with sole preselect and explicit multi-select
        - Persist selected ad accounts first and import existing campaigns plus 7-day metrics sequentially via host read verb
        - Distinguish Google MCC manager accounts from client accounts, expired connections, and empty account lists
        - Keep individual ad import out of scope (Campaigns only) with per-account Retry sync on partial failures
      keeps: Existing ad accounts, campaigns, staged proposals, creative pointers, and audit events stay unchanged
    - version: '0.6.0'
      notes:
        - Simplify Accounts with platform-grouped enabled or disabled toggles and inline daily spend limit editing
        - Connect Meta Ads and Google Ads directly from the Accounts drawer without leaving to workspace Settings
        - Prompt inline Reconnect when an existing platform connection expires
      keeps: Existing ad accounts, campaigns, staged proposals, creative pointers, and audit events stay unchanged
    - version: '0.5.0'
      notes:
        - Pick authorized Meta and Google Ads accounts directly from Composio OAuth connections
        - Auto-fill display name, external ID, currency, and timezone from Settings Connections
        - Keep manual ad account entry as a collapsible fallback when connections are unavailable
        - Declare canvas views in screens.json for filtered overview, campaign audit, and campaign-by-id views
      keeps: Existing ad accounts, campaigns, staged proposals, creative pointers, and audit events stay unchanged
    - version: '0.4.0'
      notes:
        - Support host Settings Connections ad-account pinning and read-only campaign sync
        - Normalize YouTube video IDs and URLs alongside temporary signed Workspace media pointers
        - Update screen copy, zh-HK locales, and bundled skills for hosted creative delivery
      keeps: Existing ad accounts, campaigns, staged proposals, creative pointers, and audit events stay unchanged
---

# Ads Studio

This bundle carries the installed app identity `ads-studio` and one
app-owned screen (`ads-studio`) with four sections under
`screens/ads-studio/`: Overview, Campaigns, Creatives, and Accounts.

Shared controls come from the pinned `@cadence/screen-ui` SDK and
`@cadence/app-kit@0.8.0` (`screen.v2`, `screen-records.v1`,
`screen-surfaces.v1`, `screen-canvas.v1`, `screen-route-params.v1`,
`screen-locale.v1`). Scoped storage, authorization, and the audit journal
remain host-owned.

## Storage & Media Architecture

Five owner-only tables live in `app-storage.json` (`storage/001-initial.json`):
- `ad_accounts` (default table, immutable `account_key`)
- `ad_campaigns` (references `ad_accounts.account_key`)
- `ad_proposals` (retained for storage schema compatibility; live changes use host connected-tool approvals in Home)
- `creative_assets` (scalar metadata + `wiki_path` + `sha256` pointers only — binary images/videos stay in Workspace Files R2 blobs)
- `audit_events` (`append_only` journal)

All monetary figures use integer minor units (`*_minor`) paired with currency.
Account selection (`Settings -> Connections` asset pinning) and qualified media signing (`/api/wiki/media/sign` for `<= 15 MiB` `Range` delivery or `youtube_video_id:<id>` for `> 15 MiB` Google Ads videos) are host-enforced.

## Assistant access

The assistant reads and writes records through the five `records.*` verbs (`records.list`, `records.show`, `records.create`, `records.update`, and `records.batch`) declared by `screens/ads-studio/screens.json`, alongside published Meta Ads and Google Ads connected tools across UI (`find_tools` / `use_tool`), MCP (`connected_tools_list` / `connected_read` / `connected_stage`), and CLI (`platform connected-tools` / `platform call` / `platform stage`). The UI screen also declares owner-only `connections.assets`, `connections.connect`, and `connections.ads.campaigns` so it can start platform links, list authorized ad accounts, and import existing campaigns plus 7-day reporting without ever reading OAuth credentials. All tables require owner reads, and staged writes await explicit owner approval in Cadence Home.

Five bundled skills under `skills/` guide assistant workflows:
- `ads-operator` — routes paid-acquisition questions and enforces owner-approval, multi-currency minor-unit, and separated-conversion rules
- `ads-sync` — checks `metaads`/`googleads` OAuth status, normalizes live campaign & 7-day insights (`cost_micros / 10000` for Google), and batch-writes `ad_accounts`/`ad_campaigns`/`audit_events`
- `spend-audit` — read-only spend pacing, CPA outlier, adset/ad/search-term, and audit-log inspection via paginated `records.list` / live read tools and declared `canvas_open` views with typed range, platform, status, and campaign filters
- `spend-proposal` — validates daily guardrails (`daily_guardrail_minor`) and stages live Meta Ads / Google Ads mutations directly for single-step owner approval in Cadence Home
- `creative-audit` — discovers Workspace media via `wiki_list({ media: "all" })`, registers verified `creative_assets` pointers (`15 MiB` hosted / `100 MB` native), and audits CJK half-width Google RSA / Meta ad copy against `rubrics/ad-policy.md`
