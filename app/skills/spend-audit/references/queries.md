# Ads Studio Query & Canvas Reference

All five tables enforce `read_role: "owner"`. All list reads use `records.list` with `limit <= 100`; always follow `next_cursor` until `null` before computing totals.

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

### 3. `ad_proposals`
- Keys & fields: `proposal_key` (immutable), `account_key`, `campaign_key` (nullable), `campaign_name`, `platform`, `tool_slug`, `action_type` (`budget_update` | `pause` | `resume` | `create_campaign`), `before_label`, `after_label`, `new_budget_minor` (nullable integer), `rationale`, `proposed_by`, `proposed_at`, `status` (`pending` | `applied` | `rejected`), `action_id_hex`
- Example pending-queue read:
```json
{
  "table": "ad_proposals",
  "limit": 100,
  "filters": [{ "field": "status", "op": "eq", "value": "pending" }]
}
```

### 4. `audit_events` (`append_only: true`)
- Fields: `event_key` (immutable), `kind` (`sync` | `proposal` | `alert` | `approval`), `summary`, `summary_zh` (nullable), `occurred_at`
- Example read:
```json
{ "table": "audit_events", "limit": 100, "order_by": { "field": "occurred_at", "direction": "desc" } }
```

## Opening Ads Studio on screen (`canvas_open`)

Declared navigation sections in `screens/ads-studio/screens.json`:
- `overview` — 7-day summary cards, channel conversion split, spend pacing vs guardrails
- `campaigns` — campaign table with platform/status filters and ad-set drawer
- `proposals` — staged changes awaiting owner approval
- `creatives` — Workspace Media asset pointers and copy specs
- `accounts` — Meta/Google account connections and daily guardrails

Pass only `app: "ads-studio"`, `section`, and optional `record_id` / `title` to `canvas_open`. Do **not** pass `view` or `params` (no `views` catalog is declared on `ads-studio`). If the user asked for a specific `range`, `platform`, or `status`, tell them in one line that the view opened with its default filters so they can adjust it on screen.
