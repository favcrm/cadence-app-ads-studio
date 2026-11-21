# Cadence Ads Studio App development

Preserve the installed app identity `ads-studio`. Keep host shell chrome, chat,
shared UI primitives, OAuth credentials, approval gates, and upstream effect
execution in the Cadence host.

## Rules

- Store money strictly as integer minor units (`*_minor`) paired with `currency`.
- Keep Meta conversion action types split cleanly (`meta_actions_json`); never sum incompatible Meta action types together or merge them ambiguously with Google conversions.
- Never store binary image/video blobs inside `app-storage/v1`. Store metadata + Workspace Files (`wiki_path`, `sha256`, `size_bytes`) pointers in `creative_assets` (`15 MiB` hosted `WIKI_UPLOAD_MAX` vs `100 MB` native `MAX_UPLOAD_BYTES`).
- Every write staged by the assistant or screen goes to `ad_proposals` and only applies to campaign state + `audit_events` once an owner confirms.
- In read-only `Chat Canvas` (`screen-canvas.v1`), hide all write/mutation UI and honour incoming `screen-route-params.v1` route parameters (`p.range`, `p.platform`, `p.status`).
- Every UI string goes through `useLocale().t` and must have an entry in `src/features/ads/localeCatalog.ts` for `"zh-TW"` (rendered as written zh-HK).
- Once a migration under `app/storage/` is released, treat it as append-only immutable history and append a new numbered migration instead.
- Rebuild (`pnpm build`) and verify (`pnpm verify`) whenever `src/`, `package.json`, `scripts/`, or lockfiles change, committing regenerated `app/screens/ads-studio/` outputs with the change.
- Synthetic data only — never commit credentials, tokens, or real ad account IDs.

Work on a task branch and open a pull request against `main`; never commit directly on `main`. Do not tag, publish, or install on a workspace unless requested.
