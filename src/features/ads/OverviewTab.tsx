import { Button, EmptyState, Select } from "@cadence/screen-ui";
import {
  STARTER_DAILY_PACING,
  isCpaOutlier,
  summarizeOverview,
  type AdAccountProfile,
  type AdCampaignProfile,
  type AdProposalProfile,
  type AuditEventProfile,
  type Platform,
  type StoredRecord,
} from "../../domain/ads";
import { fmtCompactMoney, fmtMoney } from "../../domain/money";
import { useLocale } from "./locale";
import { StatusPill, statusTone } from "./StatusPill";

export function OverviewTab({
  accounts,
  campaigns,
  proposals,
  auditEvents,
  canWrite,
  seeding,
  range,
  platformFilter,
  onRangeChange,
  onPlatformChange,
  onSeedStarter,
  onGoSection,
  onInspectCampaign,
}: {
  accounts: readonly StoredRecord<AdAccountProfile>[];
  campaigns: readonly StoredRecord<AdCampaignProfile>[];
  proposals: readonly StoredRecord<AdProposalProfile>[];
  auditEvents: readonly StoredRecord<AuditEventProfile>[];
  canWrite: boolean;
  seeding: boolean;
  range: string;
  platformFilter: "all" | Platform;
  onRangeChange: (next: string) => void;
  onPlatformChange: (next: "all" | Platform) => void;
  onSeedStarter: () => void;
  onGoSection: (section: "campaigns" | "proposals") => void;
  onInspectCampaign: (id: string) => void;
}) {
  const { locale, canvas, t } = useLocale();

  if (accounts.length === 0 && campaigns.length === 0) {
    return (
      <EmptyState name="overview" title={t("Set up Ads Studio")}>
        {canWrite ? (
          <div style={{ display: "grid", gap: "12px" }}>
            <p style={{ margin: 0 }}>
              {t(
                "No ad accounts or campaigns are saved in this workspace yet. Load the synthetic sample dataset to test guardrails, spend approvals, and Workspace media pointers, or wait for live Composio connector sync (AOS-686).",
              )}
            </p>
            <div>
              <Button variant="primary" loading={seeding} onClick={onSeedStarter}>
                {t("Load sample workspace")}
              </Button>
            </div>
          </div>
        ) : (
          <p style={{ margin: 0 }}>
            {t(
              canvas
                ? "Nothing here yet."
                : "The workspace owner has not set up Ads Studio yet.",
            )}
          </p>
        )}
      </EmptyState>
    );
  }

  const filtered =
    platformFilter === "all"
      ? campaigns
      : campaigns.filter((c) => c.profile.platform === platformFilter);
  const summary = summarizeOverview(filtered.map((r) => r.profile));
  const pendingCount = proposals.filter((p) => p.profile.status === "pending").length;

  const metaGuard =
    accounts.find((a) => a.profile.platform === "meta")?.profile.daily_guardrail_minor ?? 250000;
  const googleGuard =
    accounts.find((a) => a.profile.platform === "google")?.profile.daily_guardrail_minor ?? 200000;
  const guardrailCeilingMinor =
    platformFilter === "meta"
      ? metaGuard
      : platformFilter === "google"
        ? googleGuard
        : metaGuard + googleGuard;

  return (
    <div style={{ display: "grid", gap: "20px" }}>
      <div className="ads-toolbar" role="region" aria-label="Overview filters">
        <Select
          aria-label="Date range"
          size="sm"
          value={range}
          onChange={onRangeChange}
          options={[
            { value: "7d", label: t("Last 7 days") },
            { value: "30d", label: t("Last 30 days") },
            { value: "month", label: t("This month") },
          ]}
        />
        <Select
          aria-label="Platform"
          size="sm"
          value={platformFilter}
          onChange={(v) => onPlatformChange(v as "all" | Platform)}
          options={[
            { value: "all", label: t("All platforms") },
            { value: "meta", label: t("Meta Ads") },
            { value: "google", label: t("Google Ads") },
          ]}
        />
      </div>

      {canWrite && pendingCount > 0 && (
        <div className="ads-banner" data-tone="warn" role="region" aria-label="Pending approvals">
          <div className="ads-banner-body">
            <strong>
              {pendingCount}{" "}
              {pendingCount === 1
                ? t("staged spend change awaiting owner approval")
                : t("staged spend changes awaiting owner approval")}
            </strong>
            <p>
              {t(
                "Ad spend mutations stage here first and apply only once an owner confirms the exact diff.",
              )}
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => onGoSection("proposals")}>
            {t("Review changes")}
          </Button>
        </div>
      )}

      <div className="ads-kpi-grid">
        <article className="ads-card ads-kpi-card">
          <div>
            <div className="ads-kpi-label">{t("7d Spend (HKD)")}</div>
            <div className="ads-kpi-value num">{fmtMoney(summary.totalSpendMinor)}</div>
          </div>
          <div className="ads-kpi-sub">
            <span>
              <span className="ads-dot ads-dot-meta" />
              Meta: <span className="num">{fmtMoney(summary.metaSpendMinor)}</span>
            </span>
            <span>
              <span className="ads-dot ads-dot-google" />
              Google: <span className="num">{fmtMoney(summary.googleSpendMinor)}</span>
            </span>
          </div>
        </article>

        <article className="ads-card ads-kpi-card">
          <div>
            <div className="ads-kpi-label">{t("Impressions")}</div>
            <div className="ads-kpi-value num">{summary.totalImpressions.toLocaleString("en-US")}</div>
          </div>
          <div className="ads-kpi-sub">
            <span>
              {summary.trackedCount} {t("tracked campaigns · HK")}
            </span>
          </div>
        </article>

        <article className="ads-card ads-kpi-card">
          <div>
            <div className="ads-kpi-label">{t("Clicks & CTR")}</div>
            <div className="ads-kpi-value num">
              {summary.totalClicks.toLocaleString("en-US")}{" "}
              <span className="text-secondary text-ink-500" style={{ fontWeight: 400 }}>
                ({summary.ctrText})
              </span>
            </div>
          </div>
          <div className="ads-kpi-sub">
            <span>
              {t("CPC blended:")}{" "}
              <span className="num">{fmtMoney(summary.blendedCpcMinor)}</span>
            </span>
          </div>
        </article>

        <article className="ads-card ads-kpi-card">
          <div>
            <div className="ads-kpi-label" style={{ marginBottom: "6px" }}>
              {t("Conversions (Split)")}
            </div>
            <div className="ads-split-list">
              {platformFilter !== "meta" && (
                <div className="ads-split-row">
                  <span>
                    <span className="ads-dot ads-dot-google" />
                    {t("Google Ads")}
                  </span>
                  <strong className="num">{summary.googleConversions} conv.</strong>
                </div>
              )}
              {platformFilter !== "google" && (
                <div className="ads-split-row">
                  <span>
                    <span className="ads-dot ads-dot-meta" />
                    {t("Meta Ads")}
                  </span>
                  <strong className="num">
                    {summary.metaPurchases} purchase · {summary.metaLeads} lead
                  </strong>
                </div>
              )}
            </div>
          </div>
          <div className="ads-kpi-sub">
            <span>{t("Meta action types shown separately, never summed")}</span>
          </div>
        </article>
      </div>

      <div className="ads-split-grid">
        <article className="ads-card">
          <div className="ads-row-between">
            <h3 className="text-cardtitle" style={{ margin: 0 }}>
              {t("7-day spend pacing by channel")}
            </h3>
            <span className="text-micro text-ink-500 num">
              {t("Daily guardrail:")} {fmtCompactMoney(guardrailCeilingMinor)}
            </span>
          </div>
          <div className="ads-chart-shell">
            <div className="ads-chart-yaxis">
              <span>{fmtCompactMoney(guardrailCeilingMinor)}</span>
              <span>{fmtCompactMoney(Math.round(guardrailCeilingMinor / 2))}</span>
              <span>HK$0</span>
            </div>
            <div className="ads-chart-plot">
              <div className="ads-guide-top" aria-hidden="true" />
              <div className="ads-guide-mid" aria-hidden="true" />
              <div className="ads-bars" role="img" aria-label={t("7-day spend pacing by channel")}>
                {STARTER_DAILY_PACING.map((d) => {
                  const gMin = platformFilter === "meta" ? 0 : d.googleMinor;
                  const mMin = platformFilter === "google" ? 0 : d.metaMinor;
                  const totalMin = gMin + mMin;
                  const gPct =
                    guardrailCeilingMinor > 0
                      ? Math.min(100, (gMin / guardrailCeilingMinor) * 100).toFixed(1)
                      : "0";
                  const mPct =
                    guardrailCeilingMinor > 0
                      ? Math.min(100, (mMin / guardrailCeilingMinor) * 100).toFixed(1)
                      : "0";
                  const totalLabel = fmtCompactMoney(totalMin).replace(/^HK\$/, "");
                  return (
                    <div
                      key={d.day}
                      className="ads-bar-col"
                      title={`${d.day}: ${fmtMoney(totalMin)}`}
                    >
                      <div className="ads-bar-stack">
                        <span className="ads-bar-total">{totalLabel}</span>
                        {platformFilter !== "meta" && (
                          <div className="ads-bar-google" style={{ height: `${gPct}%` }} />
                        )}
                        {platformFilter !== "google" && (
                          <div className="ads-bar-meta" style={{ height: `${mPct}%` }} />
                        )}
                      </div>
                      <span className="ads-bar-day">{d.day}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="ads-row-between text-micro text-ink-400">
            <div style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
              {platformFilter !== "google" && (
                <span>
                  <span className="ads-dot ads-dot-meta" />
                  Meta Ads
                </span>
              )}
              {platformFilter !== "meta" && (
                <span>
                  <span className="ads-dot ads-dot-google" />
                  Google Ads
                </span>
              )}
            </div>
            <span className="num" style={{ color: "var(--color-warn)" }}>
              --- {t("Daily guardrail ceiling")}
            </span>
          </div>
        </article>

        <article className="ads-card">
          <div className="ads-row-between">
            <h3 className="text-cardtitle" style={{ margin: 0 }}>
              {t("Recent activity")}
            </h3>
            <span className="text-micro text-ink-500">{t("Audit log")}</span>
          </div>
          <div className="ads-audit-list">
            {auditEvents.slice(0, 4).map((ev) => (
              <div key={ev.id} className="ads-audit-item">
                <div className="ads-row-between">
                  <StatusPill tone={statusTone(ev.profile.kind)}>{ev.profile.kind}</StatusPill>
                  <span className="text-micro text-ink-500 num">{ev.profile.occurred_at}</span>
                </div>
                <div style={{ color: "var(--color-ink-200)" }}>
                  {locale === "zh-TW" && ev.profile.summary_zh
                    ? ev.profile.summary_zh
                    : ev.profile.summary}
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>

      <article className="ads-card">
        <div className="ads-row-between">
          <h3 className="text-cardtitle" style={{ margin: 0 }}>
            {t("Active campaigns snapshot")}
          </h3>
          <Button size="sm" onClick={() => onGoSection("campaigns")}>
            {t("Campaigns")} →
          </Button>
        </div>
        <div style={{ display: "grid", gap: "8px" }}>
          {filtered.slice(0, 4).map((row) => (
            <div
              key={row.id}
              className="ads-row-between"
              style={{ paddingBottom: "8px", borderBottom: "1px solid var(--color-ink-700)" }}
            >
              <div style={{ minWidth: 0 }}>
                <button
                  type="button"
                  className="lnk"
                  style={{ fontWeight: 600, textAlign: "left" }}
                  onClick={() => onInspectCampaign(row.id)}
                >
                  {row.profile.name}
                </button>
                <div className="text-micro text-ink-500 num">
                  {row.profile.platform === "meta" ? t("Meta Ads") : t("Google Ads")} ·{" "}
                  {fmtMoney(row.profile.spend_7d_minor)}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span
                  className={`num text-label ${isCpaOutlier(row.profile.cpa_minor) ? "ads-cpa-warn" : ""}`}
                >
                  {fmtMoney(row.profile.cpa_minor)}
                </span>
                <Button size="sm" onClick={() => onInspectCampaign(row.id)}>
                  {t("Inspect")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}
