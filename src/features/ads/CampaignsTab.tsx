import { Button, DataTable, EmptyState, type DataTableColumn } from "@cadence/screen-ui";
import {
  accountCurrency,
  filterCampaigns,
  isCpaOutlier,
  type AdAccountProfile,
  type AdCampaignProfile,
  type CampaignStatus,
  type Platform,
  type StoredRecord,
} from "../../domain/ads";
import { fmtMoney } from "../../domain/money";
import { useLocale } from "./locale";
import { StatusPill, statusTone } from "./StatusPill";

export function CampaignsTab({
  accounts,
  campaigns,
  search,
  platformFilter,
  statusFilter,
  onSearchChange,
  onPlatformChange,
  onStatusChange,
  onClearFilters,
  onInspectCampaign,
}: {
  accounts: readonly StoredRecord<AdAccountProfile>[];
  campaigns: readonly StoredRecord<AdCampaignProfile>[];
  search: string;
  platformFilter: "all" | Platform;
  statusFilter: "all" | CampaignStatus;
  onSearchChange: (next: string) => void;
  onPlatformChange: (next: "all" | Platform) => void;
  onStatusChange: (next: "all" | CampaignStatus) => void;
  onClearFilters: () => void;
  onInspectCampaign: (recordId: string) => void;
}) {
  const { t } = useLocale();
  const rows = filterCampaigns(campaigns, {
    platform: platformFilter,
    status: statusFilter,
    query: search,
  });

  const statusLabel = (s: CampaignStatus) =>
    s === "ACTIVE" ? t("Active") : s === "PAUSED" ? t("Paused") : t("Limited");

  const columns: DataTableColumn<StoredRecord<AdCampaignProfile>>[] = [
    {
      key: "name",
      header: t("Campaign"),
      cell: ({ id, profile: c }) => (
        <div data-record-id={id}>
          <button
            type="button"
            className="lnk"
            style={{ fontWeight: 600, textAlign: "left" }}
            onClick={() => onInspectCampaign(id)}
          >
            {c.name}
          </button>
          <div className="text-micro text-ink-500 num">
            {c.objective} · #{c.external_campaign_id}
          </div>
        </div>
      ),
    },
    {
      key: "platform",
      header: t("Channel"),
      cell: ({ profile: c }) => (
        <div>
          <span style={{ whiteSpace: "nowrap" }}>
            <span className={`ads-dot ads-dot-${c.platform}`} style={{ marginRight: "6px" }} />
            {c.platform === "meta" ? t("Meta Ads") : t("Google Ads")}
          </span>
          <div className="text-micro text-ink-500 num">{c.account_key}</div>
        </div>
      ),
    },
    {
      key: "status",
      header: t("Status"),
      cell: ({ profile: c }) => (
        <StatusPill tone={statusTone(c.status)}>{statusLabel(c.status)}</StatusPill>
      ),
    },
    {
      key: "budget",
      header: t("Budget/d"),
      cellClassName: "ads-num-col num",
      cell: ({ profile: c }) => fmtMoney(c.daily_budget_minor, accountCurrency(accounts, c.account_key)),
    },
    {
      key: "spend",
      header: t("7d Spend"),
      cellClassName: "ads-num-col num",
      cell: ({ profile: c }) => fmtMoney(c.spend_7d_minor, accountCurrency(accounts, c.account_key)),
    },
    {
      key: "clicks",
      header: t("Clicks"),
      cellClassName: "ads-num-col num",
      cell: ({ profile: c }) => {
        const ctr =
          c.impressions_7d > 0
            ? `${((c.clicks_7d / c.impressions_7d) * 100).toFixed(2)}%`
            : "—";
        return (
          <>
            <div>{c.clicks_7d.toLocaleString("en-US")}</div>
            <div className="text-micro text-ink-500">{ctr}</div>
          </>
        );
      },
    },
    {
      key: "conversions",
      header: t("Conversions"),
      cellClassName: "ads-num-col num",
      cell: ({ profile: c }) => {
        if (c.platform === "google") {
          return c.google_conversions !== null ? `${c.google_conversions} conv.` : "—";
        }
        if (!Array.isArray(c.meta_actions_json) || c.meta_actions_json.length === 0) return "—";
        return (
          <div style={{ display: "grid", gap: "2px" }}>
            {c.meta_actions_json.map((a) => {
              const label = a.actionType
                .replace("offsite_conversion.fb_pixel_purchase", "pixel")
                .replace("onsite_conversion.lead_grouped", "onsite lead");
              return (
                <span key={a.actionType} className="text-micro">
                  <strong>{a.value}</strong> {label}
                </span>
              );
            })}
          </div>
        );
      },
    },
    {
      key: "cpa",
      header: t("CPA"),
      cellClassName: "ads-num-col num",
      cell: ({ profile: c }) => {
        const curr = accountCurrency(accounts, c.account_key);
        return isCpaOutlier(c.cpa_minor) ? (
          <div>
            <span className="ads-cpa-warn">{fmtMoney(c.cpa_minor, curr)}</span>
            <div className="text-micro" style={{ color: "var(--color-warn)" }}>
              &gt; {fmtMoney(18000, curr)}
            </div>
          </div>
        ) : (
          fmtMoney(c.cpa_minor, curr)
        );
      },
    },
    {
      key: "action",
      header: t("Action"),
      cellClassName: "ads-num-col",
      cell: ({ id }) => (
        <Button size="sm" onClick={() => onInspectCampaign(id)}>
          {t("Inspect")}
        </Button>
      ),
    },
  ];

  return (
    <div style={{ display: "grid", gap: "14px" }}>
      <div className="ads-toolbar" role="region" aria-label={t("Search campaigns")}>
        <div className="ads-search-wrap">
          <label htmlFor="ads-camp-search" className="sr-only">
            {t("Search campaigns")}
          </label>
          <input
            id="ads-camp-search"
            type="search"
            className="field"
            style={{ width: "100%", height: "28px" }}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("Search campaigns or IDs…")}
          />
        </div>
        <div className="ads-chips" role="group" aria-label={t("All platforms")}>
          <button
            type="button"
            className="ads-chip"
            aria-pressed={platformFilter === "all"}
            onClick={() => onPlatformChange("all")}
          >
            {t("All platforms")}
          </button>
          <button
            type="button"
            className="ads-chip"
            aria-pressed={platformFilter === "meta"}
            onClick={() => onPlatformChange("meta")}
          >
            <span className="ads-dot ads-dot-meta" />
            Meta
          </button>
          <button
            type="button"
            className="ads-chip"
            aria-pressed={platformFilter === "google"}
            onClick={() => onPlatformChange("google")}
          >
            <span className="ads-dot ads-dot-google" />
            Google
          </button>
        </div>
        <div className="ads-chips" role="group" aria-label={t("All statuses")}>
          {(["all", "ACTIVE", "PAUSED", "LIMITED"] as const).map((st) => (
            <button
              key={st}
              type="button"
              className="ads-chip"
              aria-pressed={statusFilter === st}
              onClick={() => onStatusChange(st)}
            >
              {st === "all" ? t("All statuses") : statusLabel(st)}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState name="campaigns" title={t("No campaigns match these filters")}>
          <div style={{ display: "grid", gap: "10px" }}>
            <p style={{ margin: 0 }}>
              {t("Adjust the search query, platform, or status filters to inspect campaigns.")}
            </p>
            <div>
              <Button onClick={onClearFilters}>{t("Clear filters")}</Button>
            </div>
          </div>
        </EmptyState>
      ) : (
        <DataTable
          label={t("Campaigns")}
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          tableClassName="ads-table ads-campaigns-table"
        />
      )}
    </div>
  );
}
