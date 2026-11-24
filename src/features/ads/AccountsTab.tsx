import { Button, Detail, Notice } from "@cadence/screen-ui";
import { useMemo, useState, type FormEvent } from "react";
import type { AdAccountProfile, Platform, StoredRecord } from "../../domain/ads";
import { fmtMoney } from "../../domain/money";
import { useLocale } from "./locale";
import {
  buildAccountPickerModel,
  mergePlatformAccounts,
  type AccountPickSelection,
  type AccountSyncOutcome,
  type ConfirmImportResult,
  type ConnectedAssetsReply,
  type MergedPlatformAccount,
  type ProviderPickerSection,
} from "./records";
import { StatusPill } from "./StatusPill";

type AccountFilter = "all" | "enabled" | "disabled";

const PLATFORM_LABELS: Readonly<Record<Platform, string>> = {
  meta: "Meta Ads",
  google: "Google Ads",
};

function ImportOutcomeBanner({
  result,
  canConnect,
  syncingAccountKey,
  onRetryAccountSync,
  onConnectPlatform,
  onViewCampaigns,
  onDismiss,
}: {
  result: ConfirmImportResult;
  canConnect: boolean;
  syncingAccountKey: string | null;
  onRetryAccountSync: (outcome: AccountSyncOutcome) => Promise<void>;
  onConnectPlatform: (platform: Platform) => Promise<void>;
  onViewCampaigns: () => void;
  onDismiss: () => void;
}) {
  const { t } = useLocale();
  const hasFailures = result.outcomes.some((o) => o.status === "failed");
  const hasWarnings = result.outcomes.some((o) => o.status === "partial" || o.warnings.length > 0);
  const tone = hasFailures ? "warn" : "info";

  return (
    <div className="ads-banner" data-tone={tone} role="region" aria-label={t("Campaign import summary")}>
      <div className="ads-banner-body">
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <strong>
            {t("Campaigns imported:")} <span className="num">{result.importedCampaignCount}</span>
          </strong>
          <StatusPill tone="neutral">{t("Campaigns only — individual ads not imported")}</StatusPill>
        </div>
        <p>
          {hasFailures || hasWarnings
            ? t("Some accounts need attention. Retry sync on individual accounts without reconnecting.")
            : t("Campaign settings and 7-day metrics are saved. Individual ad creatives stay out of scope.")}
        </p>

        {result.outcomes.length > 0 && (
          <div className="ads-sync-outcomes">
            {result.outcomes.map((outcome) => (
              <div key={outcome.accountKey} className="ads-sync-outcome-row">
                <div style={{ display: "grid", gap: "2px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <span className={`ads-dot ads-dot-${outcome.platform}`} />
                    <strong style={{ fontSize: "var(--text-label)" }}>{outcome.displayName}</strong>
                    <StatusPill
                      tone={
                        outcome.status === "ok" || outcome.status === "empty"
                          ? "ok"
                          : outcome.status === "partial"
                            ? "warn"
                            : "fail"
                      }
                    >
                      {outcome.status === "failed"
                        ? outcome.needsReconnect
                          ? t("Connection expired")
                          : t("Sync failed")
                        : outcome.status === "partial"
                          ? t("Partial metrics")
                          : outcome.status === "empty"
                            ? t("No campaigns")
                            : t("Synced")}
                    </StatusPill>
                    <span className="text-micro text-ink-400 num">
                      {outcome.importedCount} {t("campaign(s)")}
                    </span>
                  </div>
                  {(outcome.message || outcome.warnings[0]?.message) && (
                    <span className="text-micro text-ink-400">
                      {outcome.message ?? outcome.warnings[0]?.message}
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {outcome.needsReconnect && canConnect ? (
                    <Button size="sm" onClick={() => void onConnectPlatform(outcome.platform)}>
                      {t("Reconnect")}
                    </Button>
                  ) : outcome.retryable ? (
                    <Button
                      size="sm"
                      loading={syncingAccountKey === outcome.accountKey}
                      onClick={() => void onRetryAccountSync(outcome)}
                    >
                      {t("Retry sync")}
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        {result.importedCampaignCount > 0 && (
          <Button size="sm" variant="primary" onClick={onViewCampaigns}>
            {t("View campaigns")}
          </Button>
        )}
        <Button size="sm" onClick={onDismiss}>
          {t("Dismiss")}
        </Button>
      </div>
    </div>
  );
}

function PickerProviderBlock({
  section,
  selectedIds,
  optedOut,
  importing,
  canConnect,
  onToggleAsset,
  onToggleOptOut,
  onConnectPlatform,
}: {
  section: ProviderPickerSection;
  selectedIds: ReadonlySet<string>;
  optedOut: boolean;
  importing: boolean;
  canConnect: boolean;
  onToggleAsset: (pickerId: string) => void;
  onToggleOptOut: (platform: Platform, nextOptOut: boolean) => void;
  onConnectPlatform: (platform: Platform) => Promise<void>;
}) {
  const { t } = useLocale();
  const [connecting, setConnecting] = useState(false);

  const triggerConnect = async () => {
    setConnecting(true);
    try {
      await onConnectPlatform(section.platform);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <section className="ads-picker-provider" aria-label={t(PLATFORM_LABELS[section.platform])}>
      <div className="ads-row-between">
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <span className={`ads-dot ads-dot-${section.platform}`} />
          <strong style={{ color: "var(--color-ink-100)" }}>
            {t(PLATFORM_LABELS[section.platform])}
          </strong>
          {section.state === "expired" && <StatusPill tone="warn">{t("Connection expired")}</StatusPill>}
          {section.state === "ready" && (
            <StatusPill tone="ok">
              {section.selectableAssets.length} {t("selectable account(s)")}
            </StatusPill>
          )}
          {section.state === "empty" && <StatusPill tone="neutral">{t("No accounts returned")}</StatusPill>}
          {section.state === "unavailable" && (
            <StatusPill tone="warn">{t("No selectable accounts")}</StatusPill>
          )}
        </div>

        {section.state === "ready" && (
          <label className="ads-picker-optout">
            <input
              type="checkbox"
              checked={optedOut}
              disabled={importing}
              onChange={(e) => onToggleOptOut(section.platform, e.target.checked)}
            />
            <span>
              {section.platform === "meta"
                ? t("Do not track Meta Ads yet")
                : t("Do not track Google Ads yet")}
            </span>
          </label>
        )}
      </div>

      {section.state === "expired" && (
        <div className="ads-row-between">
          <span className="text-micro text-ink-300">
            {section.connectionError ??
              t("This platform authorization expired. Reconnect without losing your other selections.")}
          </span>
          {canConnect && (
            <Button size="sm" loading={connecting} onClick={() => void triggerConnect()}>
              {t("Reconnect")}
            </Button>
          )}
        </div>
      )}

      {section.state === "not_connected" && (
        <div className="ads-row-between">
          <span className="text-micro text-ink-400">
            {t("Connect this platform to choose its ad accounts and import campaigns.")}
          </span>
          {canConnect && (
            <Button size="sm" loading={connecting} onClick={() => void triggerConnect()}>
              {t("Connect")}
            </Button>
          )}
        </div>
      )}

      {section.state === "empty" && (
        <div className="ads-row-between">
          <span className="text-micro text-ink-300">
            {t("No selectable ad accounts were returned for this connection.")}
          </span>
          {canConnect && (
            <Button size="sm" loading={connecting} onClick={() => void triggerConnect()}>
              {t("Reconnect")}
            </Button>
          )}
        </div>
      )}

      {section.state === "unavailable" && (
        <p className="text-micro text-ink-300" style={{ margin: 0 }}>
          {section.unavailableAssets.some((a) => a.permission === "manager")
            ? t(
                "Only manager (MCC) accounts were found. Connect a login with direct client ad accounts underneath it.",
              )
            : t("Returned ad accounts are disabled or lack read access.")}
        </p>
      )}

      {section.selectableAssets.length > 0 && (
        <div className="ads-picker-list">
          {section.selectableAssets.map((asset) => {
            const checked = !optedOut && selectedIds.has(asset.pickerId);
            return (
              <label
                key={asset.pickerId}
                className="ads-picker-item"
                data-selected={checked ? "true" : "false"}
                data-disabled={optedOut || importing ? "true" : "false"}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", minWidth: 0 }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={optedOut || importing}
                    onChange={() => onToggleAsset(asset.pickerId)}
                    style={{ marginTop: "3px" }}
                  />
                  <div style={{ display: "grid", gap: "2px", minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <strong style={{ color: "var(--color-ink-100)" }}>{asset.displayName}</strong>
                      {asset.alreadyAdded && <StatusPill tone="ok">{t("Already tracked")}</StatusPill>}
                      {asset.isPinned && !asset.alreadyAdded && (
                        <StatusPill tone="accent">{t("Recommended")}</StatusPill>
                      )}
                    </div>
                    <span className="text-micro text-ink-400 num">
                      {asset.externalAccountId}
                      {asset.loginCustomerId ? ` · MCC ${asset.loginCustomerId}` : ""} · {asset.currency} ·{" "}
                      {asset.timezone}
                    </span>
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      )}

      {section.unavailableAssets.length > 0 && (
        <div className="ads-picker-list">
          {section.unavailableAssets.map((asset) => (
            <div key={asset.pickerId} className="ads-picker-item" data-disabled="true">
              <div style={{ display: "grid", gap: "2px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <strong style={{ color: "var(--color-ink-300)" }}>{asset.displayName}</strong>
                  <StatusPill tone="neutral">
                    {asset.permission === "manager" ? t("Manager account") : t("Unavailable")}
                  </StatusPill>
                </div>
                <span className="text-micro text-ink-500 num">{asset.externalAccountId}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function AccountsTab({
  accounts,
  connectionsByPlatform,
  loadingConnections,
  connectionError,
  pickerOpen,
  pickerFocus,
  pickerSelectedIds,
  pickerOptedOut,
  importingStatus,
  importResult,
  connectNotice,
  syncingAccountKey,
  canWrite,
  canConnect,
  onRefresh,
  onOpenPicker,
  onClosePicker,
  onTogglePickerAsset,
  onTogglePickerOptOut,
  onConfirmPicker,
  onRetryAccountSync,
  onSyncAccount,
  onDismissImportResult,
  onDismissConnectNotice,
  onViewCampaigns,
  onSaveGuardrail,
  onToggleAccount,
  onConnectPlatform,
  onAddAccount,
}: {
  accounts: readonly StoredRecord<AdAccountProfile>[];
  connectionsByPlatform: Partial<Record<Platform, ConnectedAssetsReply>>;
  loadingConnections: boolean;
  connectionError: string | null;
  pickerOpen: boolean;
  pickerFocus: Platform | null;
  pickerSelectedIds: ReadonlySet<string>;
  pickerOptedOut: Readonly<Partial<Record<Platform, boolean>>>;
  importingStatus: { active: boolean; current: number; total: number; currentName: string } | null;
  importResult: ConfirmImportResult | null;
  connectNotice: string | null;
  syncingAccountKey: string | null;
  canWrite: boolean;
  canConnect: boolean;
  onRefresh: () => Promise<void>;
  onOpenPicker: (focus: Platform | null) => void;
  onClosePicker: () => void;
  onTogglePickerAsset: (pickerId: string) => void;
  onTogglePickerOptOut: (platform: Platform, nextOptOut: boolean) => void;
  onConfirmPicker: (picks: AccountPickSelection[]) => Promise<void>;
  onRetryAccountSync: (outcome: AccountSyncOutcome) => Promise<void>;
  onSyncAccount: (item: MergedPlatformAccount) => Promise<void>;
  onDismissImportResult: () => void;
  onDismissConnectNotice: () => void;
  onViewCampaigns: () => void;
  onSaveGuardrail: (account: StoredRecord<AdAccountProfile>, dailyMinor: number) => Promise<void>;
  onToggleAccount: (item: MergedPlatformAccount, nextEnabled: boolean) => Promise<void>;
  onConnectPlatform: (platform: Platform) => Promise<void>;
  onAddAccount: () => void;
}) {
  const { t } = useLocale();
  const [filter, setFilter] = useState<AccountFilter>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftMajor, setDraftMajor] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState<Platform | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const pickerModel = useMemo(
    () =>
      buildAccountPickerModel({
        connectionsByPlatform,
        existingAccounts: accounts,
        focusPlatform: pickerFocus,
      }),
    [connectionsByPlatform, accounts, pickerFocus],
  );

  const confirmedPicks = useMemo<AccountPickSelection[]>(() => {
    const out: AccountPickSelection[] = [];
    for (const section of pickerModel.providers) {
      if (pickerOptedOut[section.platform]) continue;
      for (const asset of section.selectableAssets) {
        if (!pickerSelectedIds.has(asset.pickerId)) continue;
        out.push({
          pickerId: asset.pickerId,
          connectionId: asset.connectionId,
          platform: asset.platform,
          externalAccountId: asset.externalAccountId,
          loginCustomerId: asset.loginCustomerId,
          displayName: asset.displayName,
          currency: asset.currency,
          timezone: asset.timezone,
        });
      }
    }
    return out;
  }, [pickerModel, pickerSelectedIds, pickerOptedOut]);

  const hasConnectedAssets = (["meta", "google"] as const).some(
    (p) => connectionsByPlatform[p]?.connected || connectionsByPlatform[p]?.needs_reconnect,
  );

  const merged = useMemo(
    () => mergePlatformAccounts(accounts, connectionsByPlatform),
    [accounts, connectionsByPlatform],
  );

  const enabledCount = merged.filter((m) => m.enabled).length;
  const disabledCount = merged.length - enabledCount;
  const showFilterPills = merged.length >= 3;

  const visibleItems = useMemo(() => {
    if (filter === "enabled") return merged.filter((m) => m.enabled);
    if (filter === "disabled") return merged.filter((m) => !m.enabled);
    return merged;
  }, [merged, filter]);

  const groupedPlatforms = (["meta", "google"] as const).filter((platform) => {
    const hasItems = visibleItems.some((m) => m.platform === platform);
    const needsReconnect = connectionsByPlatform[platform]?.needs_reconnect === true;
    return hasItems || (filter === "all" && needsReconnect);
  });

  const startLimitEdit = (item: MergedPlatformAccount) => {
    setEditingId(item.id);
    setDraftMajor(String(Math.round(item.guardrailMinor / 100)));
    setActionErr(null);
  };

  const commitLimitEdit = async (item: MergedPlatformAccount) => {
    if (!item.record) return;
    const major = Math.max(100, Math.round(Number(draftMajor) || item.guardrailMinor / 100));
    setSavingId(item.id);
    setActionErr(null);
    try {
      await onSaveGuardrail(item.record, major * 100);
      setEditingId(null);
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : t("Could not update daily limit."));
    } finally {
      setSavingId(null);
    }
  };

  const handlePickerSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (confirmedPicks.length === 0 || importingStatus?.active) return;
    setActionErr(null);
    try {
      await onConfirmPicker(confirmedPicks);
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : t("Could not track selected accounts."));
    }
  };

  return (
    <div style={{ display: "grid", gap: "18px" }}>
      <div className="ads-row-between">
        <div className="ads-title-stack">
          <h3 className="text-cardtitle">{t("Ad accounts")}</h3>
          <span className="text-micro text-ink-500">
            {t("Toggle accounts on to track spend and stage changes.")}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <button
            type="button"
            className="ads-icon-btn"
            aria-label={t("Refresh accounts")}
            title={t("Refresh accounts")}
            disabled={loadingConnections}
            onClick={() => void onRefresh()}
          >
            ↻
          </button>
          {canWrite && hasConnectedAssets && !pickerOpen && (
            <Button size="sm" onClick={() => onOpenPicker(null)}>
              {t("Choose ad accounts")}
            </Button>
          )}
          {canWrite && (
            <Button size="sm" variant="primary" onClick={onAddAccount}>
              + {t("Add")}
            </Button>
          )}
        </div>
      </div>

      {connectNotice && (
        <div className="ads-banner" data-tone="info" role="status">
          <div className="ads-banner-body">
            <strong>{t("Platform link notice")}</strong>
            <p>{t(connectNotice)}</p>
          </div>
          <Button size="sm" onClick={onDismissConnectNotice}>
            {t("Dismiss")}
          </Button>
        </div>
      )}

      {importResult && (
        <ImportOutcomeBanner
          result={importResult}
          canConnect={canConnect}
          syncingAccountKey={syncingAccountKey}
          onRetryAccountSync={onRetryAccountSync}
          onConnectPlatform={onConnectPlatform}
          onViewCampaigns={onViewCampaigns}
          onDismiss={onDismissImportResult}
        />
      )}

      {pickerOpen && canWrite && (
        <form
          className="ads-picker-panel"
          onSubmit={(e) => void handlePickerSubmit(e)}
          aria-label={t("Choose ad accounts")}
        >
          <div className="ads-row-between">
            <div className="ads-title-stack">
              <strong style={{ color: "var(--color-ink-100)", fontSize: "var(--text-cardtitle)" }}>
                {pickerFocus
                  ? `${t(PLATFORM_LABELS[pickerFocus])} · ${t("Choose ad accounts")}`
                  : t("Choose ad accounts")}
              </strong>
              <span className="text-micro text-ink-400">
                {accounts.length > 0
                  ? t("Existing tracked accounts stay active. Confirm selections below to save accounts and import their campaigns.")
                  : t("Confirm your selections below to start tracking accounts and import their existing campaigns.")}
              </span>
            </div>
            {pickerFocus && hasConnectedAssets && (
              <Button size="sm" onClick={() => onOpenPicker(null)}>
                {t("Show all platforms")}
              </Button>
            )}
          </div>

          {loadingConnections ? (
            <p className="text-secondary text-ink-400" style={{ margin: 0 }}>
              {t("Checking connected ad accounts…")}
            </p>
          ) : pickerModel.providers.length === 0 ? (
            <p className="text-secondary text-ink-400" style={{ margin: 0 }}>
              {t("Connect Meta Ads or Google Ads first to choose ad accounts.")}
            </p>
          ) : (
            <div style={{ display: "grid", gap: "12px" }}>
              {pickerModel.providers.map((section) => (
                <PickerProviderBlock
                  key={section.platform}
                  section={section}
                  selectedIds={pickerSelectedIds}
                  optedOut={pickerOptedOut[section.platform] === true}
                  importing={importingStatus?.active === true}
                  canConnect={canConnect}
                  onToggleAsset={onTogglePickerAsset}
                  onToggleOptOut={onTogglePickerOptOut}
                  onConnectPlatform={onConnectPlatform}
                />
              ))}
            </div>
          )}

          {importingStatus?.active && (
            <div className="text-micro text-ink-300 num" role="status">
              {t("Importing campaigns…")} ({importingStatus.current}/{importingStatus.total}):{" "}
              {importingStatus.currentName}
            </div>
          )}

          <div className="ads-picker-actions">
            <Button
              type="button"
              onClick={onClosePicker}
              disabled={importingStatus?.active}
            >
              {t("Do this later")}
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={importingStatus?.active}
              disabled={confirmedPicks.length === 0 || importingStatus?.active}
            >
              {confirmedPicks.length === 1
                ? t("Track 1 account")
                : `${t("Track selected accounts")} (${confirmedPicks.length})`}
            </Button>
          </div>
        </form>
      )}

      {connectionError && (
        <Notice state="error" onRetry={() => void onRefresh()}>
          <div style={{ display: "grid", gap: "3px" }}>
            <strong>{t("Could not refresh connected accounts")}</strong>
            <span className="text-micro">{connectionError}</span>
          </div>
        </Notice>
      )}

      {actionErr && (
        <p role="alert" className="text-micro" style={{ color: "var(--color-fail)", margin: 0 }}>
          {actionErr}
        </p>
      )}

      {showFilterPills && (
        <div className="ads-chips" role="group" aria-label={t("Filter accounts")}>
          {(
            [
              ["all", `${t("All")} (${merged.length})`],
              ["enabled", `${t("Enabled")} (${enabledCount})`],
              ["disabled", `${t("Disabled")} (${disabledCount})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className="ads-chip"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {merged.length === 0 && groupedPlatforms.length === 0 ? (
        <article className="ads-card">
          <div className="ads-title-stack">
            <strong style={{ color: "var(--color-ink-100)" }}>
              {t("No ad accounts connected yet")}
            </strong>
            <span className="text-secondary text-ink-400">
              {t("Connect Meta Ads or Google Ads to bring your accounts into this workspace.")}
            </span>
          </div>
          {canWrite && (
            <div>
              <Button size="sm" variant="primary" onClick={onAddAccount}>
                + {t("Add ad account")}
              </Button>
            </div>
          )}
        </article>
      ) : visibleItems.length === 0 && groupedPlatforms.length === 0 ? (
        <article className="ads-card">
          <div className="ads-row-between">
            <span className="text-secondary text-ink-300">
              {t("No accounts match this status filter.")}
            </span>
            <Button size="sm" onClick={() => setFilter("all")}>
              {t("Show all")}
            </Button>
          </div>
        </article>
      ) : (
        groupedPlatforms.map((platform) => {
          const items = visibleItems.filter((m) => m.platform === platform);
          const needsReconnect = connectionsByPlatform[platform]?.needs_reconnect === true;
          return (
            <section key={platform} className="ads-platform-group">
              <div className="ads-platform-head">
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span className={`ads-dot ads-dot-${platform}`} />
                  <strong style={{ color: "var(--color-ink-100)", fontSize: "var(--text-secondary)" }}>
                    {t(PLATFORM_LABELS[platform])}
                  </strong>
                  <span className="text-micro text-ink-500 num">({items.length})</span>
                </div>
                {needsReconnect && (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <StatusPill tone="warn">{t("Connection expired")}</StatusPill>
                    {canConnect && (
                      <Button
                        size="sm"
                        loading={reconnecting === platform}
                        onClick={async () => {
                          setReconnecting(platform);
                          setActionErr(null);
                          try {
                            await onConnectPlatform(platform);
                          } catch (err) {
                            setActionErr(
                              err instanceof Error ? err.message : t("Could not start reconnect."),
                            );
                          } finally {
                            setReconnecting(null);
                          }
                        }}
                      >
                        {t("Reconnect")}
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <div className="ads-account-list">
                {items.map((item) => {
                  const isEditing = editingId === item.id;
                  const isSaving = savingId === item.id;
                  const isToggling = togglingId === item.id;
                  const isSyncing = syncingAccountKey === item.key;
                  return (
                    <article
                      key={item.id}
                      className="ads-account-row"
                      data-enabled={item.enabled ? "true" : "false"}
                    >
                      <div className="ads-account-info">
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <strong style={{ color: "var(--color-ink-100)" }}>{item.displayName}</strong>
                          <StatusPill tone={item.enabled ? "ok" : "neutral"}>
                            {item.enabled ? t("Enabled") : t("Disabled")}
                          </StatusPill>
                        </div>
                        <div className="text-micro text-ink-500 num">
                          {item.externalAccountId}
                          {item.loginCustomerId ? ` · MCC ${item.loginCustomerId}` : ""} ·{" "}
                          {item.currency} · {item.timezone}
                        </div>
                      </div>

                      <div className="ads-account-actions">
                        {item.record && item.enabled && item.connectedAsset && canWrite && (
                          <Button
                            size="sm"
                            loading={isSyncing}
                            disabled={importingStatus?.active || isSyncing}
                            onClick={() => void onSyncAccount(item)}
                          >
                            {t("Sync")}
                          </Button>
                        )}

                        {item.record && item.enabled && (
                          isEditing ? (
                            <div className="ads-limit-editor">
                              <input
                                type="number"
                                min={100}
                                step={100}
                                aria-label={t("Daily spend limit")}
                                disabled={isSaving}
                                className="field num"
                                style={{ width: "100px", height: "26px" }}
                                value={draftMajor}
                                onChange={(e) => setDraftMajor(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Escape") setEditingId(null);
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    void commitLimitEdit(item);
                                  }
                                }}
                              />
                              <Button
                                size="sm"
                                loading={isSaving}
                                onClick={() => void commitLimitEdit(item)}
                              >
                                {t("Save")}
                              </Button>
                              <Button size="sm" onClick={() => setEditingId(null)}>
                                {t("Cancel")}
                              </Button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="ads-limit-chip"
                              disabled={!canWrite}
                              title={t("Edit daily spend limit")}
                              onClick={() => startLimitEdit(item)}
                            >
                              {fmtMoney(item.guardrailMinor, item.currency)}/d
                            </button>
                          )
                        )}

                        <button
                          type="button"
                          role="switch"
                          aria-checked={item.enabled}
                          aria-label={`${item.displayName} ${item.enabled ? t("Enabled") : t("Disabled")}`}
                          className="ads-switch"
                          disabled={!canWrite || isToggling}
                          onClick={async () => {
                            setTogglingId(item.id);
                            setActionErr(null);
                            try {
                              await onToggleAccount(item, !item.enabled);
                            } catch (err) {
                              setActionErr(
                                err instanceof Error
                                  ? err.message
                                  : t("Could not update account status."),
                              );
                            } finally {
                              setTogglingId(null);
                            }
                          }}
                        >
                          <span className="ads-switch-thumb" />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })
      )}

      <article className="ads-card">
        <div className="ads-title-stack">
          <h3 className="text-cardtitle">{t("Workspace Media Storage (Images & Videos)")}</h3>
          <span className="text-micro text-ink-500">
            {t(
              "Workspace Files stores media binaries across apps; Ads Studio keeps scalar metadata pointers only.",
            )}
          </span>
        </div>
        <Detail
          items={[
            {
              key: "folder",
              term: t("Workspace Path"),
              value: <span className="num">global/ads-studio/assets/</span>,
            },
            {
              key: "caps",
              term: t("Size & Upload Cap"),
              value: <span className="num">15 MiB hosted · 100 MB native</span>,
            },
          ]}
        />
      </article>
    </div>
  );
}
