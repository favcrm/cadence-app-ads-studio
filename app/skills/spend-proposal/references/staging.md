# Staged Proposal Schema & Constraints

## Record ID and identifiers

- Choose a unique `proposal_key`, e.g. `prop_<timestamp_or_short_suffix>` (<= 64 chars, immutable once stored).
- Use `record_id: "prop-<proposal_key>"` in `ad_proposals`.
- When pairing an audit journal entry in `records.batch`, use `event_key: "evt_<matching_suffix>"` and `record_id: "evt-<matching_suffix>"` with `kind: "proposal"`.
- Set `action_id_hex` to a fresh 32-character lowercase hexadecimal identifier.

## Valid `ad_proposals` fields (`status` always `"pending"`)

| Field | Type & Rules |
| --- | --- |
| `proposal_key` | non-null text <= 64 chars, immutable |
| `account_key` | non-null text <= 64 chars; must match an existing `ad_accounts.account_key` |
| `campaign_key` | text <= 64 chars or `null` (must be `null` only for `create_campaign`) |
| `campaign_name` | non-null text <= 160 chars |
| `platform` | `"meta"` or `"google"` (must match the owning account's `platform`) |
| `tool_slug` | non-null text <= 80 chars; see mapping table below |
| `action_type` | `"budget_update"` \| `"pause"` \| `"resume"` \| `"create_campaign"` |
| `before_label` | non-null text <= 160 chars (e.g. `"Daily budget: HK$600.00"` or `"Status: ACTIVE"`) |
| `after_label` | non-null text <= 160 chars (e.g. `"Daily budget: HK$900.00"` or `"Create PAUSED · HK$500.00/day"`) |
| `new_budget_minor` | integer minor units or `null` (`null` for `pause` / `resume`) |
| `rationale` | non-null text <= 600 chars describing verified metrics or owner request |
| `proposed_by` | non-null text <= 80 chars (e.g. `"Assistant"`) |
| `proposed_at` | non-null text <= 40 chars (UTC ISO-8601 timestamp or label) |
| `status` | must always be staged as `"pending"` |
| `action_id_hex` | non-null 32-char lowercase hex string |

## `tool_slug` mapping by platform and action

| `platform` | `action_type` | `tool_slug` |
| --- | --- | --- |
| `meta` | `create_campaign` | `meta_ads_create_campaign` |
| `meta` | `budget_update` \| `pause` \| `resume` | `meta_ads_update_campaign` |
| `google` | `create_campaign` | `google_ads_create_campaign` |
| `google` | `budget_update` | `google_ads_update_budget` |
| `google` | `pause` \| `resume` | `google_ads_update_campaign_status` |

## Host & domain guardrails

- `ad_proposals.account_key` has a foreign-key reference to `ad_accounts.account_key`; staging fails if the account does not exist.
- `audit_events` is `append_only: true`; only create new rows (`records.create` / `records.batch`), never `records.update`.
- Always check existing `ad_proposals` with `status: "pending"` before staging so two identical proposals are not queued.
- Keep `new_budget_minor` in integer minor units matching the account's `currency` (for HKD/USD: `100` minor units = `1.00`; note Google upstream `amount_micros = new_budget_minor * 10000`).
- Live API execution uses `find_tools` + `use_tool`, which triggers a host `connected_effect` confirmation card in chat rather than mutating external campaigns silently.
