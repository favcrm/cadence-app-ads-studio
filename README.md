# Cadence Ads Studio (`ads-studio`)

Cross-channel paid acquisition console for **Meta Ads** and **Google Ads** inside Cadence.

## Architecture (`0.1.0`)

- **App bundle (`./app`)**: `app.md`, `app-storage.json`, `storage/001-initial.json`, `app-chat.json`, `rubrics/ad-policy.md`, `workflows/ad-brief.md`, `assets/ads-studio.svg`, and built screen output under `app/screens/ads-studio/`.
- **Bridge (`@cadence/app-kit@0.8.0`)**: Declares the full `6/6` ready capability set (`screen.v2`, `screen-records.v1`, `screen-surfaces.v1`, `screen-canvas.v1`, `screen-route-params.v1`, `screen-locale.v1`).
- **Storage (`app-storage/v1`)**: Five owner-only tables (`ad_accounts`, `ad_campaigns`, `ad_proposals`, `creative_assets`, `audit_events`) — money stored in integer minor units (`*_minor`), `creative_assets` stores metadata + `wiki_path` + `sha256` pointers only (binary image/video files stay in Workspace Files R2 blobs), and `audit_events` is `append_only`.
- **Platform Live Connectors (`0.2.0` roadmap)**: Tracked separately in `AOS-686` (`agenticos-v2`) to qualify `meta_ads_*` / `google_ads_*` `catalog.tool` reads, `connected_effect` writes, and Workspace Files media delivery.

## Commands

```bash
pnpm typecheck
pnpm build
pnpm verify
pnpm test
bun run scripts/check_host_schema.mjs
node scripts/dev-preview.mjs
```
