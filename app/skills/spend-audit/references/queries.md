# Ads Studio Query & Live Tool Reference

All Ads Studio tables enforce `read_role: "owner"`. All list reads use `records.list` with `limit <= 100`; always follow `next_cursor` until `null` before computing totals.

## Tables and fields

### 1. `ad_accounts` (default table)
- Keys & identity: `account_key` (immutable), `platform` (`meta` | `google`), `external_account_id`, `login_customer_id` (nullable), `display_name`
- Controls: `currency` (default `"HKD"`), `timezone` (default `"Asia/Hong_Kong"`), `status` (`active` | `inactive`), `daily_guardrail_minor` (integer minor units, default `250000`), `scopes_text`
- Example read:
```json
{ "table": "ad_accounts", "limit": 100 }
```

### 2. `ad_campaigns`
- Keys & identity: `campaign_key` (immutable), `account_key` (references `ad_accounts.account_key`), `platform` (`meta` | `google`), `external_campaign_id`, `name`, `objective`, `status` (`ACTIVE` | `PAUSED` | `LIMITED`)
- Metrics (integer minor units / integers): `daily_budget_minor`, `spend_7d_minor`, `impressions_7d`, `clicks_7d`, `google_conversions` (nullable integer), `meta_actions_json` (nullable JSON array of `{ "actionType": string, "value": number }`), `cpa_minor` (nullable integer), `ad_sets_json` (JSON array of `{ "name", "status", "budgetMinor", "spendMinor", "clicks" }`)
- Example filtered read for high-CPA candidates:
```json
{
  "table": "ad_campaigns",
  "limit": 100,
  "filters": [{ "field": "status", "op": "eq", "value": "ACTIVE" }],
  "order_by": { "field": "spend_7d_minor", "direction": "desc" }
}
```
- Never combine `meta_actions_json` action types with each other or with `google_conversions`. Report Meta `purchase`, `lead`, or other action types on separate lines.
- Default outlier threshold in domain logic: `cpa_minor > 18000` (`HK$180.00`). Flag `status: "LIMITED"` campaigns alongside CPA outliers.

### 3. `audit_events` (`append_only: true`)
- Fields: `event_key` (immutable), `kind` (`sync` | `proposal` | `alert` | `approval`), `summary`, `summary_zh` (nullable), `occurred_at`
- Example read:
```json
{ "table": "audit_events", "limit": 100, "order_by": { "field": "occurred_at", "direction": "desc" } }
```

*(Note: legacy `ad_proposals` rows may exist on upgraded workspaces for compatibility; live approvals belong in Cadence Home `pending_actions` rather than `ad_proposals`.)*

## Live Connected Read Tools (`effect: "read"`)

Discover connected tools via `find_tools` (UI), `connected_tools_list` (MCP), or `cadence --org <org> platform connected-tools` (CLI):
- **Meta Ads:** `meta_ads_list_accounts`, `meta_ads_list_campaigns`, `meta_ads_list_adsets`, `meta_ads_list_ads`, `meta_ads_list_creatives`, `meta_ads_get_insights` (supports `level: "campaign" | "adset" | "ad"` and projects `action_types`, `action_counts`, `action_value_types`, `action_value_amounts`).
- **Google Ads:** `google_ads_list_accounts`, `google_ads_list_campaigns`, `google_ads_list_ad_groups`, `google_ads_search_terms` (GAQL against `ad_group` and `search_term_view`).

## Opening Ads Studio on screen (`canvas_open`)

Declared navigation sections and views in `screens/ads-studio/screens.json`:
- `overview` — 7-day summary cards, channel conversion split, spend pacing vs guardrails (`params`: `range` `7d|30d|month`, `platform` `all|meta|google`)
- `campaigns` / `campaign_audit` — campaign table with filters and ad-set drawer (`params`: `range`, `platform`, `status` `all|ACTIVE|PAUSED|LIMITED`, `q`)
- `campaign` — opens the campaign detail drawer for `id` (`section: "campaigns"`, `params`: `id`)
- `creatives` — Workspace Media asset pointers and copy specs
- `accounts` — Meta/Google account connections and daily guardrails

Pass `app: "ads-studio"` with `view` (or `section`) and validated `params` (plus optional `record_id` / `title`) to `canvas_open`.
