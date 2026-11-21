# Creative Assets & Ad Copy Specification

## `creative_assets` pointer schema (`app-storage/v1`)

`creative_assets` stores **scalar metadata and Workspace pointers only**. Binary image and video files live in Workspace Files (R2 objects under `global/ads-studio/assets/...`), never inside `app-storage/v1` records or JSON strings.

| Field | Constraints |
| --- | --- |
| `asset_key` | non-null text <= 64 chars, immutable (`record_id`: `ast-<asset_key>`) |
| `name` | non-null text <= 120 chars |
| `media_kind` | `"image"` \| `"video"` |
| `mime` | non-null text <= 64 chars (e.g. `image/png`, `image/jpeg`, `video/mp4`) |
| `dimensions` | non-null text <= 32 chars (e.g. `1080x1350`, `1080x1920`) |
| `duration_seconds` | integer or `null` (`null` for images) |
| `size_bytes` | non-null integer byte count |
| `wiki_path` | non-null text <= 200 chars (e.g. `global/ads-studio/assets/...`) |
| `sha256` | non-null 64-char hex digest (or identifier <= 64 chars) |
| `sync_status` | `"workspace_only"` \| `"synced_meta"` \| `"synced_google"` \| `"over_hosted_cap"` |
| `target_campaign` | non-null text <= 160 chars |
| `platform_ref` | non-null text <= 160 chars (external platform asset/video ID once synced, or pending note) |

## Workspace Media Upload Caps

- **Hosted Workspace Files (`WIKI_UPLOAD_MAX`):** `15 MiB` (`15 * 1024 * 1024 = 15,728,640` bytes). Files above this cap cannot be uploaded through the hosted browser/board upload path and should be marked `sync_status: "over_hosted_cap"` unless linked via an external video ID (`platform_ref`) or split/compressed under `15 MiB`.
- **Native Cadence Files (`MAX_UPLOAD_BYTES`):** `100 MB` (`100 * 1024 * 1024 = 104,857,600` bytes).

## Copy Policy Checklist (`rubrics/ad-policy.md`)

1. **Google Search RSA caps:**
   - Headlines `H1`–`H3`: `<= 30` units (each ASCII char = 1, wide CJK/full-width char = 2). Report both JS character length and half-width Google count for `zh-HK` drafts so wide glyphs do not overflow in Google Ads.
   - Descriptions `D1`–`D2`: `<= 90` units using the same width rule.
2. **Meta Feed / Reels:** Keep primary text scannable, front-load the verified offer in the first sentence, avoid banned superlatives (`"best"`, `"#1"`, `"guaranteed"`), and preserve exact `HK$` pricing and minimum-purchase terms.
