# Connected Ad Mutation Reference

Never stage shadow rows in `ad_proposals` for owner approval; invoke the live `effect: "send"` connected tools directly so Cadence Home presents one real confirmation card.

## Connected Write Tools (`effect: "send"`)

| Platform | Use case | Connected tool slug | Upstream Composio tool | Key inputs |
| --- | --- | --- | --- | --- |
| `meta` | Pause / resume campaign, ad set, or ad | `meta_ads_set_object_status` | `METAADS_SET_AD_OBJECT_STATUS` | `object_id`, `status` (`PAUSED` \| `ACTIVE`) |
| `meta` | Update campaign budget, name, status, or bid strategy | `meta_ads_update_campaign` | `METAADS_UPDATE_CAMPAIGN` | `campaign_id`, optional `daily_budget`, `lifetime_budget`, `status`, `name` |
| `meta` | Create new paused campaign | `meta_ads_create_campaign` | `METAADS_CREATE_CAMPAIGN` | `account_id` (`act_...`), `name`, `objective`, `status: "PAUSED"` |
| `google` | Update Google campaign daily budget | `google_ads_update_budget` | `GOOGLEADS_MUTATE_CAMPAIGN_BUDGETS` | `customer_id`, `operations` (`amountMicros = minor * 10000`) |
| `google` | Pause / resume Google campaign | `google_ads_update_campaign_status` | `GOOGLEADS_MUTATE_CAMPAIGNS` | `customer_id`, `operations` |
| `google` | Update Google ad group status or CPC bid | `google_ads_update_ad_group` | `GOOGLEADS_MUTATE_AD_GROUPS` | `customer_id`, `operations` |
| `google` | Create new paused Google campaign | `google_ads_create_campaign` | `GOOGLEADS_MUTATE_CAMPAIGNS` | `customer_id`, `operations` (`status: "PAUSED"`) |

## Surface Routing & Host Guardrails

- **UI (`find_tools` -> `use_tool`)** presents an inline `connected_effect` confirmation card; **MCP (`connected_stage`)** requires a stable `idempotency_key` and queues in Home; **CLI (`platform stage`)** queues in Home for owner approval.
- **Pinned account enforcement:** Meta writes require the connection's pinned `act_...` asset (`account_pin_required` / `account_mismatch`); object-addressed Meta writes (`campaign_id`, `object_id`) verify ownership server-side via `METAADS_GET_OBJECT` before dispatch. Google Ads writes require the pinned `customer_id`.
- **Unit conversions:** Ads Studio stores `*_minor` in integer minor units (e.g. `100` = `1.00` HKD/USD). Google Ads micros use `minor * 10000` (e.g. `HK$150.00` -> `15000` minor -> `150000000` micros). Always double-check Meta's currency smallest-unit scaling against live campaign `daily_budget` readback before staging a budget update.
- When attaching Workspace media, use `<= 15 MiB` signed `/api/wiki/media/sign` URLs or `youtube_video_id:<id>`.
