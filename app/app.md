---
app: ads-studio
title: Ads Studio
version: '0.1.0'
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
  about: Ads Studio brings Meta Ads and Google Ads campaigns into one Cadence workspace. Monitor 7-day spend pacing against daily guardrails, spot CPA outliers without merging incompatible conversion types, review staged budget or status proposals before they apply, and track creative image and video assets stored in Workspace Files. Live Composio connector reads and effects will plug into this schema after platform qualification (AOS-686).
  can:
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
Live Composio connector reads/effects (`AOS-686`) are deferred to `0.2.0`.
