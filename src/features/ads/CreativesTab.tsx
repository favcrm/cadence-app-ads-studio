import { Button, EmptyState } from "@cadence/screen-ui";
import { useState } from "react";
import {
  assetCapStatus,
  evaluateAdCopyPolicy,
  formatBytesCompact,
  formatDuration,
  type CreativeAssetProfile,
  type StoredRecord,
} from "../../domain/ads";
import { useLocale } from "./locale";
import { StatusPill, statusTone } from "./StatusPill";

export function AssetGraphic({
  asset,
}: {
  asset: CreativeAssetProfile;
}) {
  if (asset.asset_key === "ast_img_01") {
    return (
      <svg viewBox="0 0 220 110" width="220" height="110" style={{ width: "100%", height: "100%" }}>
        <rect width="220" height="110" fill="#21252b" />
        <rect x="24" y="18" width="48" height="74" rx="6" fill="#f97316" />
        <rect x="30" y="28" width="36" height="20" rx="3" fill="#ffffff" fillOpacity="0.95" />
        <text x="48" y="42" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#21252b">
          HR HK
        </text>
        <text x="86" y="45" fontSize="11.5" fontWeight="600" fill="#f0f2f6">
          Single Origin 250g
        </text>
        <text x="86" y="63" fontSize="10" fill="#abb2bf">
          HK$148 · Weekly
        </text>
        <rect x="86" y="74" width="66" height="17" rx="4" fill="#61afef" />
        <text x="119" y="86" textAnchor="middle" fontSize="8.5" fontWeight="600" fill="#21252b">
          Shop Beans
        </text>
      </svg>
    );
  }
  if (asset.asset_key === "ast_img_02") {
    return (
      <svg viewBox="0 0 220 110" width="220" height="110" style={{ width: "100%", height: "100%" }}>
        <rect width="220" height="110" fill="#1b262c" />
        <rect
          x="26"
          y="22"
          width="34"
          height="64"
          rx="6"
          fill="#61afef"
          fillOpacity="0.2"
          stroke="#61afef"
          strokeWidth="1.5"
        />
        <text x="43" y="58" textAnchor="middle" fontSize="7.5" fontWeight="600" fill="#dfe4ec">
          COLD
        </text>
        <text x="74" y="45" fontSize="11.5" fontWeight="600" fill="#f0f2f6">
          Office Cold Brew
        </text>
        <text x="74" y="62" fontSize="9.5" fill="#abb2bf">
          B2B · 1200×628
        </text>
        <rect x="74" y="73" width="76" height="17" rx="4" fill="#4ade80" />
        <text x="112" y="85" textAnchor="middle" fontSize="8.5" fontWeight="600" fill="#17251c">
          Book Tasting
        </text>
      </svg>
    );
  }
  const ring = assetCapStatus(asset.size_bytes) !== "within_hosted" ? "#fbbf24" : "#61afef";
  if (asset.media_kind === "image") {
    return (
      <svg viewBox="0 0 220 110" width="220" height="110" style={{ width: "100%", height: "100%" }}>
        <rect width="220" height="110" fill="#191d24" />
        <rect x="20" y="16" width="60" height="78" rx="6" fill="#12151a" stroke={ring} strokeWidth="1.5" />
        <circle cx="40" cy="36" r="6" fill="#61afef" fillOpacity="0.7" />
        <polygon points="28,82 46,56 62,72 70,64 74,82" fill="#4ade80" fillOpacity="0.55" />
        <text x="94" y="44" fontSize="11" fontWeight="600" fill="#f0f2f6">
          {asset.mime}
        </text>
        <text x="94" y="62" fontSize="9.5" fill="#abb2bf">
          {asset.dimensions} · sha:{asset.sha256.slice(0, 8)}
        </text>
        <text x="94" y="78" fontSize="9" fill="#8b949e">
          Workspace Files pointer
        </text>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 220 110" width="220" height="110" style={{ width: "100%", height: "100%" }}>
      <rect width="220" height="110" fill="#191d24" />
      <rect
        x="83"
        y="10"
        width="54"
        height="90"
        rx="7"
        fill="#12151a"
        stroke={ring}
        strokeWidth="1.5"
      />
      <circle cx="110" cy="50" r="14" fill="#ffffff" fillOpacity="0.16" stroke="#ffffff" />
      <polygon points="106,43 118,50 106,57" fill="#ffffff" />
      <text x="110" y="88" textAnchor="middle" fontSize="8" fill="#d1d6df">
        {formatDuration(asset.duration_seconds) || "video"} · {asset.dimensions}
      </text>
    </svg>
  );
}

export function CreativesTab({
  assets,
  canWrite,
  onInspectAsset,
  onAddAsset,
}: {
  assets: readonly StoredRecord<CreativeAssetProfile>[];
  canWrite: boolean;
  onInspectAsset: (assetId: string) => void;
  onAddAsset: () => void;
}) {
  const { t } = useLocale();
  const [filter, setFilter] = useState<"all" | "image" | "video">("all");
  const [rsaH1, setRsaH1] = useState("Single Origin Beans HK");
  const [rsaH2, setRsaH2] = useState("Freshly Roasted Weekly");
  const [rsaH3, setRsaH3] = useState("From HK$148 · Weekly");
  const [rsaD1, setRsaD1] = useState(
    "Small-batch coffee roasted weekly in Hong Kong. 250g bags or flexible office plans.",
  );
  const [rsaD2, setRsaD2] = useState(
    "Tasting notes verified per harvest. Pause or skip any delivery online.",
  );
  const [metaHeadline, setMetaHeadline] = useState("Single Origin 250g · From HK$148");
  const [metaPrimary, setMetaPrimary] = useState(
    "Fresh weekly small-batch roast delivered across Hong Kong. Flexible weekly plans.",
  );

  const visible = assets.filter((a) => filter === "all" || a.profile.media_kind === filter);
  const imageCount = assets.filter((a) => a.profile.media_kind === "image").length;
  const videoCount = assets.filter((a) => a.profile.media_kind === "video").length;

  const rsaEval = evaluateAdCopyPolicy({
    channel: "google_rsa",
    headlines: [rsaH1, rsaH2, rsaH3],
    descriptions: [rsaD1, rsaD2],
  });
  const metaEval = evaluateAdCopyPolicy({
    channel: "meta",
    headlines: [metaHeadline],
    descriptions: [],
    primaryText: metaPrimary,
  });

  const syncLabel = (a: CreativeAssetProfile) => {
    if (a.sync_status === "synced_meta") return "Synced · Meta image_hash";
    if (a.sync_status === "synced_google") return "Attached · Google PMax";
    if (a.sync_status === "over_hosted_cap") return "Over 15 MB hosted cap · R2 / YT";
    return "Workspace Files · pointer";
  };

  return (
    <div style={{ display: "grid", gap: "20px" }}>
      <div className="ads-row-between">
        <div className="ads-title-stack">
          <h3 className="text-cardtitle">{t("Workspace Media Library")}</h3>
          <span className="text-micro text-ink-500 num">
            {t(
              "Images & videos under global/ads-studio/assets/ · signed up to 15 MiB via /api/wiki/media/sign (or youtube_video_id:<id>)",
            )}
          </span>
        </div>
        {canWrite && (
          <Button onClick={onAddAsset}>+ {t("Add media pointer")}</Button>
        )}
      </div>

      <div className="ads-chips" role="group" aria-label={t("Workspace Media Library")}>
        <button
          type="button"
          className="ads-chip"
          aria-pressed={filter === "all"}
          onClick={() => setFilter("all")}
        >
          {t("All")} ({assets.length})
        </button>
        <button
          type="button"
          className="ads-chip"
          aria-pressed={filter === "image"}
          onClick={() => setFilter("image")}
        >
          {t("Images")} ({imageCount})
        </button>
        <button
          type="button"
          className="ads-chip"
          aria-pressed={filter === "video"}
          onClick={() => setFilter("video")}
        >
          {t("Videos")} ({videoCount})
        </button>
      </div>

      {visible.length === 0 ? (
        <EmptyState name="creatives" title={t("No creative pointers registered yet")}>
          <div style={{ display: "grid", gap: "10px" }}>
            <p style={{ margin: 0 }}>
              {t(
                "Upload images or MP4 cuts into Workspace Files (global/ads-studio/assets/) for temporary signed delivery (<= 15 MiB), or link a YouTube video ID (youtube_video_id:<id>) for > 15 MiB Google Ads videos.",
              )}
            </p>
            {canWrite && (
              <div>
                <Button onClick={onAddAsset}>+ {t("Add media pointer")}</Button>
              </div>
            )}
          </div>
        </EmptyState>
      ) : (
        <div className="ads-asset-grid">
          {visible.map((rec) => {
            const a = rec.profile;
            return (
              <button
                key={rec.id}
                type="button"
                className="ads-card ads-asset-btn"
                onClick={() => onInspectAsset(rec.id)}
              >
                <div className="ads-asset-stage">
                  <AssetGraphic asset={a} />
                </div>
                <div style={{ display: "grid", gap: "4px", minWidth: 0 }}>
                  <strong
                    className="text-secondary text-ink-100"
                    style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {a.name}
                  </strong>
                  <div className="text-micro text-ink-400 num">
                    {a.dimensions} · {formatBytesCompact(a.size_bytes)} · sha256:{a.sha256.slice(0, 8)}
                  </div>
                </div>
                <div style={{ marginTop: "auto" }}>
                  <StatusPill tone={statusTone(a.sync_status)}>{syncLabel(a)}</StatusPill>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="ads-title-stack">
        <h3 className="text-cardtitle">{t("Rubric-checked creative briefs")}</h3>
        <span className="text-micro text-ink-500">
          {t("Live policy check (half-width CJK RSA units & unverified superlative guard) per rubrics/ad-policy.md")}
        </span>
      </div>

      <div className="ads-creative-grid">
        <article className="ads-card">
          <div className="ads-row-between">
            <strong>{t("Google Search RSA Checker")}</strong>
            <StatusPill tone={rsaEval.ok ? "ok" : "warn"}>
              {rsaEval.ok ? t("Rubric pass") : t("Check limits")}
            </StatusPill>
          </div>
          <div style={{ display: "grid", gap: "8px" }}>
            {[
              { label: "H1", val: rsaH1, set: setRsaH1, count: rsaEval.headlineCounts[0]! },
              { label: "H2", val: rsaH2, set: setRsaH2, count: rsaEval.headlineCounts[1]! },
              { label: "H3", val: rsaH3, set: setRsaH3, count: rsaEval.headlineCounts[2]! },
            ].map((row) => (
              <div key={row.label} style={{ display: "grid", gap: "4px" }}>
                <div className="ads-row-between text-micro num">
                  <span>{row.label}</span>
                  <span style={{ color: row.count.ok ? "var(--color-ink-400)" : "var(--color-warn)" }}>
                    {row.count.units}/30 {t("units")} ({row.count.chars} {t("chars")})
                  </span>
                </div>
                <input
                  type="text"
                  aria-label={`Google RSA ${row.label}`}
                  className="field"
                  value={row.val}
                  onChange={(e) => row.set(e.target.value)}
                />
              </div>
            ))}
            {[
              { label: "D1", val: rsaD1, set: setRsaD1, count: rsaEval.descriptionCounts[0]! },
              { label: "D2", val: rsaD2, set: setRsaD2, count: rsaEval.descriptionCounts[1]! },
            ].map((row) => (
              <div key={row.label} style={{ display: "grid", gap: "4px" }}>
                <div className="ads-row-between text-micro num">
                  <span>{row.label}</span>
                  <span style={{ color: row.count.ok ? "var(--color-ink-400)" : "var(--color-warn)" }}>
                    {row.count.units}/90 {t("units")} ({row.count.chars} {t("chars")})
                  </span>
                </div>
                <input
                  type="text"
                  aria-label={`Google RSA ${row.label}`}
                  className="field"
                  value={row.val}
                  onChange={(e) => row.set(e.target.value)}
                />
              </div>
            ))}
          </div>
          {rsaEval.issues.length > 0 && (
            <div className="text-micro" style={{ color: "var(--color-warn)", display: "grid", gap: "2px" }}>
              {rsaEval.issues.map((issue) => (
                <span key={issue}>{issue}</span>
              ))}
            </div>
          )}
        </article>

        <article className="ads-card">
          <div className="ads-row-between">
            <strong>{t("Meta Feed / Reels Checker")}</strong>
            <StatusPill tone={metaEval.ok ? "ok" : "warn"}>
              {metaEval.ok ? t("Rubric pass") : t("Check policy")}
            </StatusPill>
          </div>
          <div style={{ display: "grid", gap: "8px" }}>
            <div className="ads-row-between text-micro num">
              <span>{t("Headline")}</span>
              <span>{metaHeadline.length} {t("chars")}</span>
            </div>
            <input
              type="text"
              aria-label={t("Headline")}
              className="field"
              value={metaHeadline}
              onChange={(e) => setMetaHeadline(e.target.value)}
            />
            <div className="ads-row-between text-micro num">
              <span>{t("Primary text")}</span>
              <span>{metaPrimary.length} {t("chars")}</span>
            </div>
            <textarea
              rows={3}
              aria-label={t("Primary text")}
              className="field"
              value={metaPrimary}
              onChange={(e) => setMetaPrimary(e.target.value)}
            />
          </div>
          <div className="ads-inset text-label">
            <strong style={{ color: "var(--color-ink-100)" }}>{metaHeadline}</strong>
            <span className="text-ink-300">{metaPrimary}</span>
            {metaEval.issues.length > 0 && (
              <span className="text-micro" style={{ color: "var(--color-warn)" }}>
                {metaEval.issues.join(" ")}
              </span>
            )}
          </div>
        </article>
      </div>
    </div>
  );
}
