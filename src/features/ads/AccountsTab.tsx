import { Button, Detail, Notice } from "@cadence/screen-ui";
import { useMemo, useState } from "react";
import type { AdAccountProfile, Platform, StoredRecord } from "../../domain/ads";
import { fmtMoney } from "../../domain/money";
import { useLocale } from "./locale";
import {
  mergePlatformAccounts,
  type ConnectedAssetsReply,
  type MergedPlatformAccount,
} from "./records";
import { StatusPill } from "./StatusPill";

type AccountFilter = "all" | "enabled" | "disabled";

const PLATFORM_LABELS: Readonly<Record<Platform, string>> = {
  meta: "Meta Ads",
  google: "Google Ads",
};

export function AccountsTab({
  accounts,
  connectionsByPlatform,
  loadingConnections,
  connectionError,
  canWrite,
  canConnect,
  onRefresh,
  onSaveGuardrail,
  onToggleAccount,
  onConnectPlatform,
  onAddAccount,
}: {
  accounts: readonly StoredRecord<AdAccountProfile>[];
  connectionsByPlatform: Partial<Record<Platform, ConnectedAssetsReply>>;
  loadingConnections: boolean;
  connectionError: string | null;
  canWrite: boolean;
  canConnect: boolean;
  onRefresh: () => Promise<void>;
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

  return (
    <div style={{ display: "grid", gap: "18px" }}>
      <div className="ads-row-between">
        <div className="ads-title-stack">
          <h3 className="text-cardtitle">{t("Ad accounts")}</h3>
          <span className="text-micro text-ink-500">
            {t("Toggle accounts on to track spend and stage changes.")}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
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
          {canWrite && (
            <Button size="sm" variant="primary" onClick={onAddAccount}>
              + {t("Add")}
            </Button>
          )}
        </div>
      </div>

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
