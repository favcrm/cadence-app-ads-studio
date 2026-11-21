import { Button } from "@cadence/screen-ui";
import { useState } from "react";
import {
  assetCapStatus,
  checkRsaLimits,
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
        {formatDuration(asset.duration_seconds) || "0:15"} · 9:16
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
  const [metaMode, setMetaMode] = useState<"image" | "video">("image");

  const visible = assets.filter((a) => filter === "all" || a.profile.media_kind === filter);
  const imageCount = assets.filter((a) => a.profile.media_kind === "image").length;
  const videoCount = assets.filter((a) => a.profile.media_kind === "video").length;

  const headlines = [
    "Single Origin Beans HK",
    "Freshly Roasted Weekly",
    "From HK$148 · Free Delivery",
  ];
  const descriptions = [
    "Small-batch coffee roasted weekly in Hong Kong. 250g bags or flexible office plans.",
    "Tasting notes verified per harvest. Pause or skip any delivery online.",
  ];
  const rsa = checkRsaLimits(headlines, descriptions);

  const syncLabel = (a: CreativeAssetProfile) => {
    if (a.sync_status === "synced_meta") return "Synced · Meta image_hash";
    if (a.sync_status === "synced_google") return "Attached · Google PMax";
    if (a.sync_status === "over_hosted_cap") return "Over 15 MB hosted cap · R2 / YT";
    return "Ready · Meta Reels / Shorts";
  };

  return (
    <div style={{ display: "grid", gap: "20px" }}>
      <div className="ads-row-between">
        <div className="ads-title-stack">
          <h3 className="text-cardtitle">{t("Workspace Media Library")}</h3>
          <span className="text-micro text-ink-500 num">
            {t(
              "Images & videos under global/ads-studio/assets/ · app-storage/v1 holds metadata + sha256 pointers only",
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

      <div className="ads-title-stack">
        <h3 className="text-cardtitle">{t("Rubric-checked creative briefs")}</h3>
        <span className="text-micro text-ink-500">
          {t("Checked against rubrics/ad-policy.md before campaign attachment")}
        </span>
      </div>

      <div className="ads-creative-grid">
        <article className="ads-card">
          <div className="ads-row-between">
            <strong>{t("Google Search RSA · Specialty Coffee HK")}</strong>
            <StatusPill tone={rsa.ok ? "ok" : "fail"}>{t("Rubric pass")}</StatusPill>
          </div>
          <div className="ads-inset">
            <div className="text-micro text-ink-400">Sponsored · harbourroasters.hk/beans</div>
            <div className="text-cardtitle" style={{ color: "var(--color-accent)", fontWeight: 600 }}>
              {headlines.join(" | ")}
            </div>
            <div className="text-label text-ink-300">{descriptions.join(" ")}</div>
          </div>
          <div style={{ display: "grid", gap: "6px" }} className="num text-label">
            {headlines.map((h, i) => (
              <div key={h} className="ads-row-between">
                <span>
                  H{i + 1}: {h}
                </span>
                <span>{h.length}/30</span>
              </div>
            ))}
          </div>
        </article>

        <article className="ads-card">
          <div className="ads-row-between">
            <strong>{t("Meta Feed / Reels · Single Origin Launch")}</strong>
            <div className="ads-chips">
              <button
                type="button"
                className="ads-chip"
                aria-pressed={metaMode === "image"}
                onClick={() => setMetaMode("image")}
              >
                {t("1:1 Image")}
              </button>
              <button
                type="button"
                className="ads-chip"
                aria-pressed={metaMode === "video"}
                onClick={() => setMetaMode("video")}
              >
                {t("9:16 Reels Video")}
              </button>
            </div>
          </div>
          <div className="ads-inset">
            <div className="ads-row-between text-label">
              <span>
                <strong>Harbour Roasters HK</strong> · Sponsored
              </span>
              <span className="text-micro text-ink-400 num">
                {metaMode === "video" ? "9:16 · 0:12 MP4" : "1:1 · WebP"}
              </span>
            </div>
            <div className="ads-asset-stage" style={{ height: "144px" }}>
              <AssetGraphic
                asset={
                  assets.find(
                    (x) =>
                      x.profile.asset_key === (metaMode === "video" ? "ast_vid_01" : "ast_img_01"),
                  )?.profile ?? assets[0]!.profile
                }
              />
            </div>
            <div className="ads-row-between text-label">
              <span>
                <strong>From HK$148 · Weekly Roast</strong>
              </span>
              <StatusPill tone="ok">{t("Rubric pass")}</StatusPill>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}
