import { Button, DataTable, Detail, DrawerShell, Field, Select } from "@cadence/screen-ui";
import { useMemo, useState, type FormEvent } from "react";
import {
  assetCapStatus,
  formatBytesCompact,
  formatDuration,
  isCpaOutlier,
  validateAccountInput,
  validateCreativePointer,
  type AdAccountProfile,
  type AdCampaignProfile,
  type AuditEventProfile,
  type CreativeAssetProfile,
  type MediaKind,
  type Platform,
  type ProposalActionType,
  type StoredRecord,
} from "../../domain/ads";
import { fmtMoney, parseMajorToMinor } from "../../domain/money";
import { AssetGraphic } from "./CreativesTab";
import { useLocale } from "./locale";
import { normalizeExternalAccountId } from "./records";
import { StatusPill, statusTone } from "./StatusPill";

export type ActiveDrawer =
  | { kind: "campaign"; record: StoredRecord<AdCampaignProfile> }
  | { kind: "new_campaign" }
  | { kind: "new_account" }
  | { kind: "asset"; record: StoredRecord<CreativeAssetProfile> }
  | { kind: "new_asset" };

export function DetailDrawer({
  drawer,
  accounts,
  auditEvents,
  canWrite,
  canConnect,
  onConnectPlatform,
  onClose,
  onStageProposal,
  onCreateAccount,
  onCreateAsset,
}: {
  drawer: ActiveDrawer;
  accounts: readonly StoredRecord<AdAccountProfile>[];
  auditEvents: readonly StoredRecord<AuditEventProfile>[];
  canWrite: boolean;
  canConnect: boolean;
  onConnectPlatform: (platform: Platform) => Promise<void>;
  onClose: () => void;
  onStageProposal: (input: {
    account: AdAccountProfile;
    campaign: AdCampaignProfile | null;
    campaignName: string;
    actionType: ProposalActionType;
    newBudgetMinor: number | null;
    rationale: string;
  }) => Promise<void>;
  onCreateAccount: (account: AdAccountProfile) => Promise<void>;
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

  if (drawer.kind === "new_account") {
    return (
      <NewAccountDrawer
        existingAccounts={accounts}
        canConnect={canConnect}
        onConnectPlatform={onConnectPlatform}
        busy={busy}
        onClose={onClose}
        onSubmit={async (account) => {
          setBusy(true);
          try {
            await onCreateAccount(account);
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
  const currency = acct?.currency ?? "HKD";

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
              <strong className="num">{fmtMoney(c.spend_7d_minor, currency)}</strong>
            </div>
            <div className="ads-drawer-kpi">
              <span className="text-micro text-ink-500">{t("Budget/d")}</span>
              <strong className="num">{fmtMoney(c.daily_budget_minor, currency)}</strong>
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
                {fmtMoney(c.cpa_minor, currency)}
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
      panel:
        c.ad_sets_json.length === 0 ? (
          <div className="ads-card" style={{ padding: "14px" }}>
            <strong style={{ color: "var(--color-ink-100)" }}>
              {t("Campaigns only — individual ads not imported")}
            </strong>
            <p className="text-micro text-ink-400" style={{ margin: 0 }}>
              {t(
                "This campaign sync captures campaign settings and 7-day metrics. Ad sets, ad groups, and individual ads are not imported yet.",
              )}
            </p>
          </div>
        ) : (
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
                cell: (r) => fmtMoney(r.budgetMinor, currency),
              },
              {
                key: "spend",
                header: t("7d Spend"),
                cellClassName: "ads-num-col num",
                cell: (r) => fmtMoney(r.spendMinor, currency),
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
                    label={`${t("New daily budget")} (${currency})`}
                    hint={
                      acct
                        ? `${t("Daily guardrail:")} ${fmtMoney(acct.daily_guardrail_minor, currency)}`
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
  const [accountKey, setAccountKey] = useState(accounts[0]?.profile.account_key ?? "");
  const [name, setName] = useState("");
  const [budgetStr, setBudgetStr] = useState("500");
  const [rationale, setRationale] = useState(
    "Launch paused campaign for creative QA before owner activation.",
  );
  const selectedAccount =
    accounts.find((a) => a.profile.account_key === accountKey)?.profile ?? accounts[0]?.profile;
  const currency = selectedAccount?.currency ?? "HKD";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const account = selectedAccount;
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
                      label: `${a.profile.platform === "meta" ? "Meta Ads" : "Google Ads"} · ${a.profile.external_account_id} (${a.profile.currency})`,
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
                    placeholder="e.g. Spring Search — High Intent"
                    className="field"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                )}
              </Field>
              <Field label={`${t("New daily budget")} (${currency})`}>
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

interface PlatformDirectoryEntry {
  id: Platform | "tiktok" | "linkedin";
  label: string;
  subtitle: string;
  dotClass: string;
  available: boolean;
}

const PLATFORM_DIRECTORY: readonly PlatformDirectoryEntry[] = [
  {
    id: "meta",
    label: "Meta Ads",
    subtitle: "Facebook & Instagram ad accounts",
    dotClass: "ads-dot-meta",
    available: true,
  },
  {
    id: "google",
    label: "Google Ads",
    subtitle: "Search, YouTube & Performance Max accounts",
    dotClass: "ads-dot-google",
    available: true,
  },
  {
    id: "tiktok",
    label: "TikTok Ads",
    subtitle: "For Business ad accounts",
    dotClass: "ads-dot-tiktok",
    available: false,
  },
  {
    id: "linkedin",
    label: "LinkedIn Ads",
    subtitle: "Campaign Manager accounts",
    dotClass: "ads-dot-linkedin",
    available: false,
  },
];

function NewAccountDrawer({
  existingAccounts,
  canConnect,
  onConnectPlatform,
  busy,
  onClose,
  onSubmit,
}: {
  existingAccounts: readonly StoredRecord<AdAccountProfile>[];
  canConnect: boolean;
  onConnectPlatform: (platform: Platform) => Promise<void>;
  busy: boolean;
  onClose: () => void;
  onSubmit: (account: AdAccountProfile) => Promise<void>;
}) {
  const { t } = useLocale();
  const [manualMode, setManualMode] = useState(!canConnect);
  const [connecting, setConnecting] = useState<Platform | null>(null);
  const [platform, setPlatform] = useState<Platform>("meta");
  const [displayName, setDisplayName] = useState("");
  const [externalId, setExternalId] = useState("");
  const [mccId, setMccId] = useState("");
  const [currency, setCurrency] = useState("HKD");
  const [timezone, setTimezone] = useState("Asia/Hong_Kong");
  const [guardrailStr, setGuardrailStr] = useState("1500");
  const [error, setError] = useState<string | null>(null);

  const normalizedEnteredId = normalizeExternalAccountId(platform, externalId);
  const duplicateManual = useMemo(
    () =>
      normalizedEnteredId.length > 0 &&
      existingAccounts.some(
        (acc) =>
          acc.profile.platform === platform &&
          normalizeExternalAccountId(platform, acc.profile.external_account_id).toLowerCase() ===
            normalizedEnteredId.toLowerCase(),
      ),
    [existingAccounts, platform, normalizedEnteredId],
  );

  const handleManualSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (duplicateManual) {
      setError(t("This account is already tracked in Ads Studio."));
      return;
    }
    const guardrailMinor = parseMajorToMinor(guardrailStr) ?? 0;
    const res = validateAccountInput({
      platform,
      external_account_id: externalId,
      login_customer_id: platform === "google" ? mccId : null,
      display_name: displayName,
      currency,
      timezone,
      daily_guardrail_minor: guardrailMinor,
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    await onSubmit(res.value);
  };

  return (
    <DrawerShell
      kind={t("Ad Accounts")}
      label={t("Connect ad account")}
      title={manualMode ? t("Enter ID manually") : t("Connect ad account")}
      onClose={onClose}
      tabs={[
        {
          id: "account",
          label: manualMode ? t("Account Details") : t("Choose platform"),
          panel: manualMode ? (
            <form className="ads-form-grid" onSubmit={handleManualSubmit}>
              <Field label={t("Platform")}>
                {() => (
                  <Select
                    aria-label={t("Platform")}
                    value={platform}
                    onChange={(v) => {
                      setPlatform(v as Platform);
                      setMccId("");
                      setError(null);
                    }}
                    options={[
                      { value: "meta", label: t("Meta Ads") },
                      { value: "google", label: t("Google Ads") },
                    ]}
                  />
                )}
              </Field>
              <Field label={t("Display Name")}>
                {({ id, ...ctrl }) => (
                  <input
                    id={id}
                    {...ctrl}
                    required
                    placeholder="e.g. Acme Studio — Performance"
                    className="field"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                )}
              </Field>
              <Field
                label={t("External Account ID")}
                hint={platform === "meta" ? "act_1234567890" : "123-456-7890"}
              >
                {({ id, ...ctrl }) => (
                  <input
                    id={id}
                    {...ctrl}
                    required
                    placeholder={platform === "meta" ? "act_1234567890" : "123-456-7890"}
                    className="field num"
                    value={externalId}
                    onChange={(e) => setExternalId(e.target.value)}
                  />
                )}
              </Field>
              {platform === "google" && (
                <Field label={t("Google MCC ID (optional)")} hint="123-456-7890">
                  {({ id, ...ctrl }) => (
                    <input
                      id={id}
                      {...ctrl}
                      placeholder="123-456-7890"
                      className="field num"
                      value={mccId}
                      onChange={(e) => setMccId(e.target.value)}
                    />
                  )}
                </Field>
              )}
              <Field label={t("Currency")}>
                {({ id, ...ctrl }) => (
                  <input
                    id={id}
                    {...ctrl}
                    required
                    maxLength={3}
                    placeholder="HKD"
                    className="field num"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  />
                )}
              </Field>
              <Field label={t("Timezone")}>
                {({ id, ...ctrl }) => (
                  <input
                    id={id}
                    {...ctrl}
                    required
                    placeholder="Asia/Hong_Kong"
                    className="field num"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                  />
                )}
              </Field>
              <Field label={`${t("Daily spend limit")} (${currency || "HKD"})`}>
                {({ id, ...ctrl }) => (
                  <input
                    id={id}
                    {...ctrl}
                    type="number"
                    min={100}
                    step="any"
                    required
                    className="field num"
                    value={guardrailStr}
                    onChange={(e) => setGuardrailStr(e.target.value)}
                  />
                )}
              </Field>

              {duplicateManual && (
                <p role="status" className="text-micro" style={{ color: "var(--color-warn)", margin: 0 }}>
                  {t("This account is already tracked in Ads Studio.")}
                </p>
              )}

              {error && (
                <p role="alert" style={{ color: "var(--danger, #b91c1c)", fontSize: "13px", margin: 0 }}>
                  {error}
                </p>
              )}

              <div className="ads-drawer-footer-link">
                {canConnect ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      setManualMode(false);
                      setError(null);
                    }}
                  >
                    {t("Back to platforms")}
                  </Button>
                ) : (
                  <span />
                )}
                <div style={{ display: "flex", gap: "8px" }}>
                  <Button onClick={onClose}>{t("Cancel")}</Button>
                  <Button
                    type="submit"
                    variant="primary"
                    loading={busy}
                    disabled={duplicateManual}
                  >
                    {t("Save")}
                  </Button>
                </div>
              </div>
            </form>
          ) : (
            <div className="ads-form-grid">
              <p className="text-secondary text-ink-400" style={{ margin: 0 }}>
                {t("Select an ad platform to connect accounts to this workspace.")}
              </p>

              <div className="ads-platform-dir">
                {PLATFORM_DIRECTORY.map((entry) => {
                  const isBusy = connecting === entry.id;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      className="ads-platform-option"
                      disabled={!entry.available || connecting !== null}
                      onClick={async () => {
                        if (!entry.available || (entry.id !== "meta" && entry.id !== "google")) {
                          return;
                        }
                        setConnecting(entry.id);
                        setError(null);
                        try {
                          await onConnectPlatform(entry.id);
                        } catch (err) {
                          setError(
                            err instanceof Error
                              ? err.message
                              : t("Could not start account connection."),
                          );
                          setConnecting(null);
                        }
                      }}
                    >
                      <div style={{ display: "grid", gap: "2px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span className={`ads-dot ${entry.dotClass}`} />
                          <strong>{t(entry.label)}</strong>
                        </div>
                        <span className="text-micro text-ink-400">{t(entry.subtitle)}</span>
                      </div>
                      {entry.available ? (
                        <StatusPill tone="accent">
                          {isBusy ? t("Connecting…") : t("Connect")}
                        </StatusPill>
                      ) : (
                        <StatusPill tone="neutral">{t("Coming soon")}</StatusPill>
                      )}
                    </button>
                  );
                })}
              </div>

              {error && (
                <p role="alert" style={{ color: "var(--danger, #b91c1c)", fontSize: "13px", margin: 0 }}>
                  {error}
                </p>
              )}

              <div className="ads-drawer-footer-link">
                <button
                  type="button"
                  className="ads-chip"
                  onClick={() => {
                    setManualMode(true);
                    setError(null);
                  }}
                >
                  {t("Enter ID manually")}
                </button>
                <Button onClick={onClose}>{t("Close")}</Button>
              </div>
            </div>
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
  const [name, setName] = useState("");
  const [kind, setKind] = useState<MediaKind>("image");
  const [mime, setMime] = useState("image/webp");
  const [dimensions, setDimensions] = useState("1080×1080");
  const [durationStr, setDurationStr] = useState("10");
  const [sizeMb, setSizeMb] = useState("1.8");
  const [wikiPath, setWikiPath] = useState("global/ads-studio/assets/");
  const [sha256, setSha256] = useState("");
  const [target, setTarget] = useState(accounts[0]?.profile.display_name ?? "");
  const [platformRef, setPlatformRef] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const bytes = Math.round((Number(sizeMb) || 0) * 1024 * 1024);
    const duration =
      kind === "video" ? Math.max(1, Math.round(Number(durationStr) || 0)) : null;
    const res = validateCreativePointer({
      name,
      media_kind: kind,
      mime,
      dimensions,
      duration_seconds: duration,
      size_bytes: bytes,
      wiki_path: wikiPath,
      sha256,
      target_campaign: target,
      platform_ref: platformRef,
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    await onSubmit(res.value);
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
              <Field label={t("File Name")}>
                {({ id, ...ctrl }) => (
                  <input
                    id={id}
                    {...ctrl}
                    required
                    placeholder="spring-hero.webp"
                    className="field"
                    value={name}
                    onChange={(e) => {
                      const nextName = e.target.value;
                      setName(nextName);
                      if (
                        wikiPath === "global/ads-studio/assets/" ||
                        wikiPath.startsWith("global/ads-studio/assets/images/") ||
                        wikiPath.startsWith("global/ads-studio/assets/videos/")
                      ) {
                        const folder = kind === "video" ? "videos" : "images";
                        setWikiPath(`global/ads-studio/assets/${folder}/${nextName.trim()}`);
                      }
                    }}
                  />
                )}
              </Field>
              <Field label={t("Media Kind")}>
                {() => (
                  <Select
                    aria-label={t("Media Kind")}
                    value={kind}
                    onChange={(v) => {
                      const next = v as MediaKind;
                      setKind(next);
                      setMime(next === "video" ? "video/mp4" : "image/webp");
                      setDimensions(next === "video" ? "1080×1920" : "1080×1080");
                    }}
                    options={[
                      { value: "image", label: `${t("Images")} (webp / jpg / png)` },
                      { value: "video", label: `${t("Videos")} (mp4)` },
                    ]}
                  />
                )}
              </Field>
              <Field label={t("MIME Type")}>
                {() => (
                  <Select
                    aria-label={t("MIME Type")}
                    value={mime}
                    onChange={setMime}
                    options={
                      kind === "video"
                        ? [{ value: "video/mp4", label: "video/mp4" }]
                        : [
                            { value: "image/webp", label: "image/webp" },
                            { value: "image/jpeg", label: "image/jpeg" },
                            { value: "image/png", label: "image/png" },
                          ]
                    }
                  />
                )}
              </Field>
              <Field label={t("Workspace Path")} hint="global/ads-studio/assets/...">
                {({ id, ...ctrl }) => (
                  <input
                    id={id}
                    {...ctrl}
                    required
                    placeholder="global/ads-studio/assets/images/spring-hero.webp"
                    className="field num"
                    value={wikiPath}
                    onChange={(e) => setWikiPath(e.target.value)}
                  />
                )}
              </Field>
              <Field label={t("SHA-256 Digest")} hint={t("From wiki_list media discovery")}>
                {({ id, ...ctrl }) => (
                  <input
                    id={id}
                    {...ctrl}
                    required
                    maxLength={64}
                    placeholder="64-character hex digest"
                    className="field num"
                    value={sha256}
                    onChange={(e) => setSha256(e.target.value)}
                  />
                )}
              </Field>
              <Field label={t("Dimensions")}>
                {({ id, ...ctrl }) => (
                  <input
                    id={id}
                    {...ctrl}
                    required
                    placeholder="1080×1080"
                    className="field num"
                    value={dimensions}
                    onChange={(e) => setDimensions(e.target.value)}
                  />
                )}
              </Field>
              {kind === "video" && (
                <Field label={t("Duration (s)")}>
                  {({ id, ...ctrl }) => (
                    <input
                      id={id}
                      {...ctrl}
                      type="number"
                      min={1}
                      step={1}
                      required
                      className="field num"
                      value={durationStr}
                      onChange={(e) => setDurationStr(e.target.value)}
                    />
                  )}
                </Field>
              )}
              <Field label={t("File Size (MB)")}>
                {({ id, ...ctrl }) => (
                  <input
                    id={id}
                    {...ctrl}
                    type="number"
                    min={0.01}
                    step="any"
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
                    placeholder="e.g. Spring Brand Prospecting"
                    className="field"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                  />
                )}
              </Field>
              <Field
                label={t("Ad Platform Ref (optional)")}
                hint={t("Leave empty for /api/wiki/media/sign, or enter a YouTube URL / youtube_video_id:<id>")}
              >
                {({ id, ...ctrl }) => (
                  <input
                    id={id}
                    {...ctrl}
                    placeholder="youtube_video_id:dQw4w9WgXcQ / meta_image_hash"
                    className="field num"
                    value={platformRef}
                    onChange={(e) => setPlatformRef(e.target.value)}
                  />
                )}
              </Field>
              {error && (
                <p role="alert" style={{ color: "var(--danger, #b91c1c)", fontSize: "13px", margin: 0 }}>
                  {error}
                </p>
              )}
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
