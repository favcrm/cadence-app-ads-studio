---
name: spend-proposal
description: Validate account daily guardrails and stage live Meta Ads or Google Ads spend/status mutations directly via connected tools for single-step Cadence Home owner approval.
---

# Live Spend & Status Changes (Cadence Home Approval)

Use this skill when the owner asks to change a campaign or ad set budget, pause/resume a campaign, ad set, or ad, or draft a new paused campaign. Do **not** create shadow queue rows in `ad_proposals` — Cadence Home (`connected_effect` / `pending_actions`) is the single, real owner approval gate.

Exact tool slugs, required fields, unit rules, and host constraints are in `references/staging.md`.

## Procedure

1. Gather all required facts from the owner before staging: target platform (`meta` / `google`), account and target object (`campaign_id`, `adset_id`/`object_id`, or `ad_group_id`), requested action (budget update, status `PAUSED`/`ACTIVE`, or `create_campaign`), requested daily budget in integer minor units (for HKD/USD: `100` minor units = `1.00`), and clear business rationale. Ask if anything is missing; never guess targets or amounts.
2. Read the owning `ad_accounts` row (`records.list` / `records.show`) and current live state using connected read tools (`meta_ads_list_campaigns`, `meta_ads_list_adsets`, `meta_ads_list_ads`, `google_ads_list_campaigns`, `google_ads_list_ad_groups`) so your summary states the verified current budget or status alongside the account's `currency` and `daily_guardrail_minor`.
3. Check `daily_guardrail_minor` and `rubrics/ad-policy.md`:
   - If the requested daily budget exceeds `account.daily_guardrail_minor`, warn the owner clearly with both figures formatted in `currency` and confirm before staging.
   - Any newly created campaign (`meta_ads_create_campaign`, `google_ads_create_campaign`) must start in `PAUSED`.
4. Discover the exact connected write tool for your surface:
   - **UI chat:** `find_tools` -> `use_tool` (renders a host `connected_effect` approval card directly in chat and Home).
   - **MCP client:** `connected_tools_list` -> `connected_stage` (with a deterministic `idempotency_key`; awaits approval in Home).
   - **CLI:** `cadence --org <org> platform connected-tools` -> `cadence --org <org> platform stage <tool> --connection <id> --input '{...}'`.
   - **If unlinked or unqualified:** surface `connect:metaads` / `connect:googleads` (or ask the operator to publish/pin the tool), and state clearly that no live change was staged or applied.
5. Check before claiming: never say a change is live until the owner approves the Cadence Home / chat card and a successful tool result returns. Optionally refresh synced snapshot rows afterward via `ads-sync`.
