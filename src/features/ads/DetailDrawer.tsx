import { Button, DataTable, Detail, DrawerShell, Field, Select } from "@cadence/screen-ui";
import { useState, type FormEvent } from "react";
import {
  assetCapStatus,
  formatBytesCompact,
  formatDuration,
  isCpaOutlier,
  type AdAccountProfile,
  type AdCampaignProfile,
  type AuditEventProfile,
  type CreativeAssetProfile,
  type MediaKind,
  type ProposalActionType,
  type StoredRecord,
} from "../../domain/ads";
import { fmtMoney, parseMajorToMinor } from "../../domain/money";
import { AssetGraphic } from "./CreativesTab";
import { useLocale } from "./locale";
import { StatusPill, statusTone } from "./StatusPill";

export type ActiveDrawer =
  | { kind: "campaign"; record: StoredRecord<AdCampaignProfile> }
  | { kind: "new_campaign" }
  | { kind: "asset"; record: StoredRecord<CreativeAssetProfile> }
  | { kind: "new_asset" };

export function DetailDrawer({
  drawer,
  accounts,
  auditEvents,
  canWrite,
  onClose,
  onStageProposal,
  onCreateAsset,
}: {
  drawer: ActiveDrawer;
  accounts: readonly StoredRecord<AdAccountProfile>[];
  auditEvents: readonly StoredRecord<AuditEventProfile>[];
  canWrite: boolean;
  onClose: () => void;
  onStageProposal: (input: {
    account: AdAccountProfile;
    campaign: AdCampaignProfile | null;
    campaignName: string;
    actionType: ProposalActionType;
    newBudgetMinor: number | null;
    rationale: string;
  }) => Promise<void>;
  onCreateAsset: (asset: CreativeAssetProfile) => Promise<void>;
}) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);

  if (drawer.kind === "asset") {
    const a = drawer.record.profile;
    const cap = assetCapStatus(a.size_bytes);
    return (
      <DrawerShell
        kind={a.media_kind === "video" ? "Workspace Video" : "Workspace Image"}
        label={a.name}
        title={a.name}
        subtitle={a.wiki_path}
        pills={<StatusPill tone={statusTone(a.sync_status)}>{a.mime}</StatusPill>}
        onClose={onClose}
        tabs={[
          {
            id: "info",
            label: t("Inspect asset"),
            panel: (
              <div style={{ display: "grid", gap: "16px" }}>
                <div className="ads-asset-stage" style={{ height: "168px" }}>
                  <AssetGraphic asset={a} />
                </div>
                <Detail
                  items={[
                    { key: "path", term: t("Workspace Path"), value: <span className="num">{a.wiki_path}</span> },
                    { key: "sha", term: t("SHA-256 Digest"), value: <span className="num">{a.sha256}</span> },
                    {
                      key: "dims",
                      term: t("Dimensions"),
                      value: (
                        <span className="num">
                          {a.dimensions}
                          {a.duration_seconds ? ` · ${formatDuration(a.duration_seconds)}` : ""}
                        </span>
                      ),
                    },
                    {
                      key: "cap",
                      term: t("Size & Upload Cap"),
                      value: (
                        <StatusPill tone={cap === "within_hosted" ? "ok" : "warn"}>
                          {formatBytesCompact(a.size_bytes)} ·{" "}
                          {cap === "within_hosted"
                            ? t("Within 15 MiB hosted Wiki limit")
                            : t("Over 15 MiB hosted cap (fits 100 MB native)")}
                        </StatusPill>
                      ),
                    },
                    { key: "camp", term: t("Target Campaign"), value: a.target_campaign },
                    { key: "ref", term: t("Ad Platform Ref"), value: <span className="num">{a.platform_ref}</span> },
                  ]}
                />
              </div>
            ),
          },
        ]}
        primary={<Button onClick={onClose}>{t("Close")}</Button>}
      />
    );
  }

  if (drawer.kind === "new_asset") {
    return (
      <NewAssetDrawer
        accounts={accounts}
        busy={busy}
        onClose={onClose}
        onSubmit={async (asset) => {
          setBusy(true);
          try {
            await onCreateAsset(asset);
            onClose();
          } finally {
            setBusy(false);
          }
        }}
      />
    );
  }

  if (drawer.kind === "new_campaign") {
    return (
      <NewCampaignDrawer
        accounts={accounts}
        busy={busy}
        onClose={onClose}
        onSubmit={async (payload) => {
          setBusy(true);
          try {
            await onStageProposal(payload);
            onClose();
          } finally {
            setBusy(false);
          }
        }}
      />
    );
  }

  return (
    <CampaignDrawer
      campaign={drawer.record}
      accounts={accounts}
      auditEvents={auditEvents}
      canWrite={canWrite}
      onClose={onClose}
      onStageProposal={onStageProposal}
    />
  );
}

function CampaignDrawer({
  campaign,
  accounts,
  auditEvents,
  canWrite,
  onClose,
  onStageProposal,
}: {
  campaign: StoredRecord<AdCampaignProfile>;
  accounts: readonly StoredRecord<AdAccountProfile>[];
  auditEvents: readonly StoredRecord<AuditEventProfile>[];
  canWrite: boolean;
  onClose: () => void;
  onStageProposal: (input: {
    account: AdAccountProfile;
    campaign: AdCampaignProfile | null;
    campaignName: string;
    actionType: ProposalActionType;
    newBudgetMinor: number | null;
    rationale: string;
  }) => Promise<void>;
}) {
  const { locale, t } = useLocale();
  const c = campaign.profile;
  const acct =
    accounts.find((a) => a.profile.account_key === c.account_key)?.profile ?? accounts[0]?.profile;
  const [actionType, setActionType] = useState<ProposalActionType>("budget_update");
  const [budgetStr, setBudgetStr] = useState(() =>
    String(Math.round(c.daily_budget_minor / 100) + 200),
  );
  const [rationale, setRationale] = useState(
    "Adjust allocation based on 7-day CPA and pacing headroom.",
  );
  const [pending, setPending] = useState(false);

  const ctr = c.impressions_7d > 0 ? `${((c.clicks_7d / c.impressions_7d) * 100).toFixed(2)}%` : "—";

  const handleStage = async (e: FormEvent) => {
    e.preventDefault();
    if (!acct) return;
    const budgetMinor = actionType === "budget_update" ? parseMajorToMinor(budgetStr) : null;
    if (actionType === "budget_update" && (!budgetMinor || budgetMinor < 5000)) return;
    setPending(true);
    try {
      await onStageProposal({
        account: acct,
        campaign: c,
        campaignName: c.name,
        actionType,
        newBudgetMinor: budgetMinor,
        rationale: rationale.trim() || "Stage change for owner review.",
      });
      onClose();
    } finally {
      setPending(false);
    }
  };

  const tabs = [
    {
      id: "perf",
      label: t("Performance"),
      panel: (
        <div style={{ display: "grid", gap: "16px" }}>
          <div className="ads-drawer-kpis">
            <div className="ads-drawer-kpi">
              <span className="text-micro text-ink-500">{t("7d Spend")}</span>
              <strong className="num">{fmtMoney(c.spend_7d_minor)}</strong>
            </div>
            <div className="ads-drawer-kpi">
              <span className="text-micro text-ink-500">{t("Budget/d")}</span>
              <strong className="num">{fmtMoney(c.daily_budget_minor)}</strong>
            </div>
            <div className="ads-drawer-kpi">
              <span className="text-micro text-ink-500">{t("Clicks & CTR")}</span>
              <strong className="num">
                {c.clicks_7d.toLocaleString("en-US")} ({ctr})
              </strong>
            </div>
            <div className="ads-drawer-kpi">
              <span className="text-micro text-ink-500">{t("CPA")}</span>
              <strong className={`num ${isCpaOutlier(c.cpa_minor) ? "ads-cpa-warn" : ""}`}>
                {fmtMoney(c.cpa_minor)}
              </strong>
            </div>
          </div>
          <Detail
            items={[
              {
                key: "status",
                term: t("Status"),
                value: <StatusPill tone={statusTone(c.status)}>{c.status}</StatusPill>,
              },
              { key: "obj", term: t("Objective"), value: <span className="num">{c.objective}</span> },
              {
                key: "conv",
                term: t("Conversions"),
                value: (
                  <span className="num">
                    {c.platform === "google"
                      ? c.google_conversions !== null
                        ? `${c.google_conversions} conv.`
                        : "—"
                      : c.meta_actions_json?.map((a) => `${a.actionType}: ${a.value}`).join(" · ") ??
                        "—"}
                  </span>
                ),
              },
            ]}
          />
        </div>
      ),
    },
    {
      id: "sets",
      label: t("Ad Sets / Groups"),
      panel: (
        <DataTable
          label={t("Ad Sets / Groups")}
          rows={c.ad_sets_json}
          rowKey={(r) => r.name}
          columns={[
            { key: "name", header: t("Campaign Name"), cell: (r) => <strong>{r.name}</strong> },
            {
              key: "status",
              header: t("Status"),
              cell: (r) => <StatusPill tone={statusTone(r.status)}>{r.status}</StatusPill>,
            },
            {
              key: "budget",
              header: t("Budget/d"),
              cellClassName: "ads-num-col num",
              cell: (r) => fmtMoney(r.budgetMinor),
            },
            {
              key: "spend",
              header: t("7d Spend"),
              cellClassName: "ads-num-col num",
              cell: (r) => fmtMoney(r.spendMinor),
            },
          ]}
        />
      ),
    },
    ...(canWrite
      ? [
          {
            id: "propose",
            label: t("Propose Change"),
            panel: (
              <form id="ads-propose-form" className="ads-form-grid" onSubmit={handleStage}>
                <Field label={t("Action")}>
                  {() => (
                    <Select
                      aria-label={t("Action")}
                      value={actionType}
                      onChange={(v) => setActionType(v as ProposalActionType)}
                      options={[
                        { value: "budget_update", label: t("Update daily budget") },
                        {
                          value: c.status === "PAUSED" ? "resume" : "pause",
                          label: c.status === "PAUSED" ? t("Resume campaign") : t("Pause campaign"),
                        },
                      ]}
                    />
                  )}
                </Field>
                {actionType === "budget_update" && (
                  <Field
                    label={t("New daily budget (HKD)")}
                    hint={
                      acct
                        ? `${t("Daily guardrail:")} ${fmtMoney(acct.daily_guardrail_minor)}`
                        : undefined
                    }
                  >
                    {({ id, ...ctrl }) => (
                      <input
                        id={id}
                        {...ctrl}
                        type="number"
                        min={50}
                        step={50}
                        required
                        className="field num"
                        value={budgetStr}
                        onChange={(e) => setBudgetStr(e.target.value)}
                      />
                    )}
                  </Field>
                )}
                <Field label={t("Rationale")}>
                  {({ id, ...ctrl }) => (
                    <textarea
                      id={id}
                      {...ctrl}
                      rows={3}
                      required
                      className="field"
                      value={rationale}
                      onChange={(e) => setRationale(e.target.value)}
                    />
                  )}
                </Field>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                  <Button onClick={onClose}>{t("Cancel")}</Button>
                  <Button type="submit" variant="primary" loading={pending}>
                    {t("Stage for owner approval")}
                  </Button>
                </div>
              </form>
            ),
          },
        ]
      : []),
    {
      id: "audit",
      label: t("Audit Log"),
      panel: (
        <div className="ads-audit-list">
          {auditEvents.map((ev) => (
            <div key={ev.id} className="ads-audit-item">
              <div className="ads-row-between">
                <StatusPill tone={statusTone(ev.profile.kind)}>{ev.profile.kind}</StatusPill>
                <span className="text-micro text-ink-500 num">{ev.profile.occurred_at}</span>
              </div>
              <div>
                {locale === "zh-TW" && ev.profile.summary_zh
                  ? ev.profile.summary_zh
                  : ev.profile.summary}
              </div>
            </div>
          ))}
        </div>
      ),
    },
  ];

  return (
    <DrawerShell
      kind={c.platform === "meta" ? t("Meta Ads") : t("Google Ads")}
      label={c.name}
      title={c.name}
      subtitle={`${c.account_key} · #${c.external_campaign_id}`}
      pills={<StatusPill tone={statusTone(c.status)}>{c.status}</StatusPill>}
      tabs={tabs}
      onClose={onClose}
      primary={<Button onClick={onClose}>{t("Close")}</Button>}
    />
  );
}

function NewCampaignDrawer({
  accounts,
  busy,
  onClose,
  onSubmit,
}: {
  accounts: readonly StoredRecord<AdAccountProfile>[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: {
    account: AdAccountProfile;
    campaign: null;
    campaignName: string;
    actionType: ProposalActionType;
    newBudgetMinor: number;
    rationale: string;
  }) => Promise<void>;
}) {
  const { t } = useLocale();
  const [accountKey, setAccountKey] = useState(accounts[0]?.profile.account_key ?? "meta_hk_main");
  const [name, setName] = useState("Holiday Tasting Box — HK Island");
  const [budgetStr, setBudgetStr] = useState("500");
  const [rationale, setRationale] = useState(
    "Launch paused campaign for creative QA before owner activation.",
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const account = accounts.find((a) => a.profile.account_key === accountKey)?.profile ?? accounts[0]?.profile;
    const minor = parseMajorToMinor(budgetStr) ?? 50000;
    if (!account || !name.trim()) return;
    await onSubmit({
      account,
      campaign: null,
      campaignName: name.trim(),
      actionType: "create_campaign",
      newBudgetMinor: minor,
      rationale: rationale.trim(),
    });
  };

  return (
    <DrawerShell
      kind={t("New Proposal")}
      label={t("+ Propose campaign")}
      title={t("+ Propose campaign")}
      pills={<StatusPill tone="accent">PAUSED by default</StatusPill>}
      onClose={onClose}
      tabs={[
        {
          id: "create",
          label: t("Stage for owner approval"),
          panel: (
            <form className="ads-form-grid" onSubmit={handleSubmit}>
              <Field label={t("Platform & Account")}>
                {() => (
                  <Select
                    aria-label={t("Platform & Account")}
                    value={accountKey}
                    onChange={setAccountKey}
                    options={accounts.map((a) => ({
                      value: a.profile.account_key,
                      label: `${a.profile.platform === "meta" ? "Meta Ads" : "Google Ads"} · ${a.profile.external_account_id}`,
                    }))}
                  />
                )}
              </Field>
              <Field label={t("Campaign Name")}>
                {({ id, ...ctrl }) => (
                  <input
                    id={id}
                    {...ctrl}
                    required
                    className="field"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                )}
              </Field>
              <Field label={t("New daily budget (HKD)")}>
                {({ id, ...ctrl }) => (
                  <input
                    id={id}
                    {...ctrl}
                    type="number"
                    min={50}
                    step={50}
                    required
                    className="field num"
                    value={budgetStr}
                    onChange={(e) => setBudgetStr(e.target.value)}
                  />
                )}
              </Field>
              <Field label={t("Rationale")}>
                {({ id, ...ctrl }) => (
                  <textarea
                    id={id}
                    {...ctrl}
                    rows={3}
                    required
                    className="field"
                    value={rationale}
                    onChange={(e) => setRationale(e.target.value)}
                  />
                )}
              </Field>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <Button onClick={onClose}>{t("Cancel")}</Button>
                <Button type="submit" variant="primary" loading={busy}>
                  {t("Stage for owner approval")}
                </Button>
              </div>
            </form>
          ),
        },
      ]}
    />
  );
}

function NewAssetDrawer({
  accounts,
  busy,
  onClose,
  onSubmit,
}: {
  accounts: readonly StoredRecord<AdAccountProfile>[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (asset: CreativeAssetProfile) => Promise<void>;
}) {
  const { t } = useLocale();
  const [name, setName] = useState("spring-latte-carousel.webp");
  const [kind, setKind] = useState<MediaKind>("image");
  const [sizeMb, setSizeMb] = useState("1.8");
  const [target, setTarget] = useState(
    accounts[0]?.profile.display_name ?? "Single Origin Bean Subscription — Prospecting",
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const bytes = Math.max(1024, Math.round((Number(sizeMb) || 1.2) * 1024 * 1024));
    const cap = assetCapStatus(bytes);
    const key = `ast_${Date.now().toString(36)}`;
    const safeName = name.trim() || "creative.webp";
    await onSubmit({
      asset_key: key,
      name: safeName,
      media_kind: kind,
      mime: kind === "video" ? "video/mp4" : "image/webp",
      dimensions: kind === "video" ? "1080×1920" : "1080×1080",
      duration_seconds: kind === "video" ? 10 : null,
      size_bytes: bytes,
      wiki_path: `global/ads-studio/assets/${kind === "video" ? "videos" : "images"}/${safeName}`,
      sha256: `${Date.now().toString(16).padEnd(64, "9").slice(0, 64)}`,
      sync_status: cap === "within_hosted" ? "workspace_only" : "over_hosted_cap",
      target_campaign: target,
      platform_ref:
        cap === "within_hosted"
          ? "Stored in Workspace Files (metadata pointer)"
          : "Exceeds 15 MiB hosted cap · use YouTube / R2 direct",
    });
  };

  return (
    <DrawerShell
      kind="Workspace Files"
      label={t("Register Workspace Media Pointer")}
      title={t("Register Workspace Media Pointer")}
      onClose={onClose}
      tabs={[
        {
          id: "pointer",
          label: t("Workspace Media Library"),
          panel: (
            <form className="ads-form-grid" onSubmit={handleSubmit}>
              <Field label="File Name">
                {({ id, ...ctrl }) => (
                  <input
                    id={id}
                    {...ctrl}
                    required
                    className="field"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                )}
              </Field>
              <Field label="Media Kind">
                {() => (
                  <Select
                    aria-label="Media Kind"
                    value={kind}
                    onChange={(v) => setKind(v as MediaKind)}
                    options={[
                      { value: "image", label: `${t("Images")} (webp / jpg / png)` },
                      { value: "video", label: `${t("Videos")} (mp4 / webm)` },
                    ]}
                  />
                )}
              </Field>
              <Field label="File Size (MB)">
                {({ id, ...ctrl }) => (
                  <input
                    id={id}
                    {...ctrl}
                    type="number"
                    min={0.1}
                    step={0.1}
                    required
                    className="field num"
                    value={sizeMb}
                    onChange={(e) => setSizeMb(e.target.value)}
                  />
                )}
              </Field>
              <Field label={t("Target Campaign")}>
                {({ id, ...ctrl }) => (
                  <input
                    id={id}
                    {...ctrl}
                    required
                    className="field"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                  />
                )}
              </Field>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <Button onClick={onClose}>{t("Cancel")}</Button>
                <Button type="submit" variant="primary" loading={busy}>
                  {t("Save")}
                </Button>
              </div>
            </form>
          ),
        },
      ]}
    />
  );
}
