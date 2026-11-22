# Upstream Field Mapping (`app-storage/v1`)

## Tables Updated

| Table | `record_id` convention | Required keys | Notes |
| --- | --- | --- | --- |
| `ad_accounts` | `acct-${account_key}` | `account_key`, `platform`, `external_account_id`, `login_customer_id`, `display_name`, `currency`, `timezone`, `status`, `daily_guardrail_minor`, `scopes_text` | Preserve existing `daily_guardrail_minor` when updating an already-pinned account unless owner asked to change it. |
| `ad_campaigns` | `camp-${campaign_key}` | `campaign_key`, `account_key`, `external_campaign_id`, `platform`, `name`, `status`, `objective`, `daily_budget_minor`, `spend_7d_minor`, `impressions_7d`, `clicks_7d`, `cpa_minor`, `ad_sets_json`, `google_conversions`, `meta_actions_json`, `synced_at` | Set `status` to `"ACTIVE" \| "PAUSED" \| "LEARNING" \| "LIMITED"`. |
| `audit_events` | `evt-${timestamp_slug}` | `event_key`, `kind: "sync"`, `summary`, `summary_zh`, `occurred_at` | Always include both `summary` and `summary_zh` so bilingual toggle stays consistent. |

## Currency & Unit Conversion

- **Standard minor units (`* 100`):** Meta and Ads Studio store money as integer minor units (`100` = `1.00` HKD/USD/EUR/GBP).
- **Meta Insights API:** Monetary strings (e.g. `"124.50"` spend, `"50000"` minor cents in campaign `daily_budget` depending on endpoint) must be normalized carefully:
  - Campaign `daily_budget` from Graph API is typically in account minor units (integer string `"50000"` = `500.00`). Verify unit before multiplying!
  - Insights `spend` is usually major decimal string (`"124.50"` -> `Math.round(Number(spend) * 100)`).
- **Google Ads API / GAQL:** `metrics.cost_micros` and `campaign_budget.amount_micros` are in micros (`1,000,000` per major unit). Divide by `10_000` (`Math.round(micros / 10_000)`) to obtain 2-decimal minor units.

## Unlinked Platform Flow

- Meta Ads connection prompt token: `connect:metaads`
- Google Ads connection prompt token: `connect:googleads`
- Never clear existing real workspace records during sync unless explicitly updating by matching `record_id` and `expected_revision`.
