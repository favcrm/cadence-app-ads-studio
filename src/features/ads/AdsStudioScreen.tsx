import { Button, ErrorNotice, Loading } from "@cadence/screen-ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { patchRoute } from "../../bridge/route";
import { scopeError, useCanvasReadOnly, useScope } from "../../bridge/scope";
import {
  validateAccountInput,
  type CampaignStatus,
  type Platform,
} from "../../domain/ads";
import { AccountsTab } from "./AccountsTab";
import { CampaignsTab } from "./CampaignsTab";
import { CreativesTab } from "./CreativesTab";
import { DetailDrawer, type ActiveDrawer } from "./DetailDrawer";
import { AdsLocaleProvider, useLocale } from "./locale";
import { OverviewTab } from "./OverviewTab";
import {
  buildAccountPickerModel,
  confirmAndImportAccounts,
  connectAdPlatform,
  connectProviderToPlatform,
  createAdAccount,
  loadConnectedAdAssets,
  loadWorkspaceData,
  registerAssetPointer,
  saveAccountGuardrail,
  seedStarterWorkspace,
  setAdAccountEnabled,
  syncSingleAccountCampaigns,
  type AccountPickSelection,
  type AccountSyncOutcome,
  type ConfirmImportResult,
  type ConnectedAssetsReply,
  type WorkspaceDataset,
} from "./records";
import "./ads-studio.css";

const HOST_PUSH_TIMEOUT_MS = 15000;

function initialLocale(): "en" | "zh-TW" {
  return typeof navigator !== "undefined" && /^zh\b/i.test(navigator.language ?? "")
    ? "zh-TW"
    : "en";
}

export default function AdsStudioScreen() {
  const snapshot = useScope();
  const canvas = useCanvasReadOnly();
  const locale = useRef<"en" | "zh-TW">(initialLocale());
  if (snapshot) locale.current = snapshot.presentationLocale;
  return (
    <AdsLocaleProvider locale={locale.current} canvas={canvas}>
      <Mounted />
    </AdsLocaleProvider>
  );
}

function Mounted() {
  const { t } = useLocale();
  const snapshot = useScope();
  const canvas = useCanvasReadOnly();
  const [unreachable, setUnreachable] = useState(false);

  const [data, setData] = useState<WorkspaceDataset | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busySeed, setBusySeed] = useState(false);

  const [range, setRange] = useState("7d");
  const [platformFilter, setPlatformFilter] = useState<"all" | Platform>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | CampaignStatus>("all");
  const [search, setSearch] = useState("");

  const [drawer, setDrawer] = useState<ActiveDrawer | null>(null);
  const [connectionsByPlatform, setConnectionsByPlatform] = useState<
    Partial<Record<Platform, ConnectedAssetsReply>>
  >({});
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerFocus, setPickerFocus] = useState<Platform | null>(null);
  const [pickerSelectedIds, setPickerSelectedIds] = useState<string[]>([]);
  const [pickerOptedOut, setPickerOptedOut] = useState<Partial<Record<Platform, boolean>>>({});
  const [importingStatus, setImportingStatus] = useState<{
    active: boolean;
    current: number;
    total: number;
    currentName: string;
  } | null>(null);
  const [importResult, setImportResult] = useState<ConfirmImportResult | null>(null);
  const [connectNotice, setConnectNotice] = useState<string | null>(null);
  const [syncingAccountKey, setSyncingAccountKey] = useState<string | null>(null);
  const openedRouteTarget = useRef<string | null>(null);
  const autoInitializedProviders = useRef<Set<Platform>>(new Set());
  const pendingConnectReturn = useRef<Platform | null>(null);
  const connectionsInFlightRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (snapshot) return;
    const timer = setTimeout(() => setUnreachable(true), HOST_PUSH_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [snapshot]);

  const paramsKey = JSON.stringify(snapshot?.route.params ?? {});
  useEffect(() => {
    const params = snapshot?.route.params;
    if (!params) return;
    if (params.range && ["7d", "30d", "month"].includes(params.range)) setRange(params.range);
    if (params.platform && ["all", "meta", "google"].includes(params.platform)) {
      setPlatformFilter(params.platform as "all" | Platform);
    }
    if (params.status && ["all", "ACTIVE", "PAUSED", "LIMITED"].includes(params.status)) {
      setStatusFilter(params.status as "all" | CampaignStatus);
    }
    if (typeof params.q === "string") {
      setSearch(params.q);
    }
  }, [paramsKey]);

  const refresh = useCallback(async () => {
    if (!snapshot) return;
    setLoadErr(null);
    try {
      const next = await loadWorkspaceData(snapshot.scope);
      setData(next);
    } catch (err) {
      setLoadErr(err instanceof Error ? err.message : "Failed to load Ads Studio records.");
    }
  }, [snapshot?.scope.installId, snapshot?.scope.digest]);

  const loadAllConnections = useCallback(async () => {
    if (!snapshot || canvas || !snapshot.actions.includes("connections.assets")) return;
    if (connectionsInFlightRef.current) return connectionsInFlightRef.current;

    const run = (async () => {
      setLoadingConnections(true);
      setConnectionError(null);
      const next: Partial<Record<Platform, ConnectedAssetsReply>> = {};
      const errs: string[] = [];
      for (const platform of ["meta", "google"] as const) {
        try {
          next[platform] = await loadConnectedAdAssets(snapshot.scope, platform);
        } catch (err) {
          errs.push(err instanceof Error ? err.message : platform === "meta" ? "Meta Ads" : "Google Ads");
        }
      }
      if (Object.keys(next).length > 0) {
        setConnectionsByPlatform((prev) => ({ ...prev, ...next }));
      }
      if (errs.length > 0) setConnectionError(errs.join(" · "));
      setLoadingConnections(false);
    })();

    connectionsInFlightRef.current = run.finally(() => {
      connectionsInFlightRef.current = null;
    });
    return connectionsInFlightRef.current;
  }, [snapshot?.scope.installId, snapshot?.scope.digest, canvas, snapshot?.actions]);

  const hasSnapshot = snapshot !== null;
  useEffect(() => {
    if (!hasSnapshot) return;
    void refresh().then(() => void loadAllConnections());
  }, [hasSnapshot, refresh, loadAllConnections]);

  const routeTargetId =
    snapshot?.route.params?.id?.trim() || snapshot?.route.record_id?.trim() || "";
  const routeSection = snapshot?.route.section ?? "overview";
  useEffect(() => {
    if (!data || !routeTargetId) return;
    const targetKey = `${routeSection}:${routeTargetId}`;
    if (openedRouteTarget.current === targetKey) return;
    if (routeSection === "campaigns") {
      const found = data.campaigns.find(
        (c) => c.id === routeTargetId || c.profile.campaign_key === routeTargetId,
      );
      if (found) {
        openedRouteTarget.current = targetKey;
        setDrawer({ kind: "campaign", record: found });
      }
    } else if (routeSection === "creatives") {
      const found = data.assets.find(
        (a) => a.id === routeTargetId || a.profile.asset_key === routeTargetId,
      );
      if (found) {
        openedRouteTarget.current = targetKey;
        setDrawer({ kind: "asset", record: found });
      }
    }
  }, [data, routeSection, routeTargetId]);

  // Read `p.connect_provider` as a one-time OAuth return focus hint and clear it cleanly.
  const connectProviderParam = snapshot?.route.params?.connect_provider;
  useEffect(() => {
    if (!snapshot || !connectProviderParam) return;
    const focus = connectProviderToPlatform(connectProviderParam);
    const nextParams = { ...(snapshot.route.params ?? {}) };
    delete nextParams.connect_provider;
    if (focus) {
      pendingConnectReturn.current = focus;
      autoInitializedProviders.current.delete(focus);
      setPickerFocus(focus);
      setPickerOpen(true);
      setPickerOptedOut((prev) => ({ ...prev, [focus]: false }));
      setConnectNotice(null);
    }
    void patchRoute({
      section: focus ? "accounts" : snapshot.route.section,
      view: "list",
      record_id: null,
      params: nextParams,
      replace: true,
    }).finally(() => {
      if (focus) void loadAllConnections();
    });
  }, [connectProviderParam, snapshot?.scope.installId, loadAllConnections]);

  // Pre-select sole selectable account per newly loaded platform (never auto-saving)
  // and detect cancelled/incomplete OAuth returns without clearing saved or draft choices.
  useEffect(() => {
    const model = buildAccountPickerModel({
      connectionsByPlatform,
      existingAccounts: data?.accounts ?? [],
      focusPlatform: null,
    });
    const toPreselect: string[] = [];
    for (const section of model.providers) {
      if (section.state === "ready" && !autoInitializedProviders.current.has(section.platform)) {
        autoInitializedProviders.current.add(section.platform);
        if (section.selectableAssets.length === 1 && !section.selectableAssets[0]!.alreadyAdded) {
          toPreselect.push(section.selectableAssets[0]!.pickerId);
        }
      }
    }
    if (toPreselect.length > 0) {
      setPickerSelectedIds((prev) => Array.from(new Set([...prev, ...toPreselect])));
    }
    const returned = pendingConnectReturn.current;
    if (returned && !loadingConnections) {
      const reply = connectionsByPlatform[returned];
      if (reply && !reply.connected) {
        setConnectNotice("Connection was not completed. Your saved accounts and choices were kept.");
      }
      pendingConnectReturn.current = null;
    }
  }, [connectionsByPlatform, data?.accounts, loadingConnections]);

  if (!snapshot) {
    const lost = scopeError();
    if (lost !== null) return <ErrorNotice>{t(lost)}</ErrorNotice>;
    return unreachable ? (
      <ErrorNotice>
        {t("The workspace is not answering. Reload the page to try again.")}
      </ErrorNotice>
    ) : (
      <Loading>{t("Opening Ads Studio…")}</Loading>
    );
  }

  const { scope, route, actions } = snapshot;
  const canWrite =
    !canvas &&
    actions.includes("records.create") &&
    actions.includes("records.update") &&
    actions.includes("records.batch");
  const canConnect = !canvas && actions.includes("connections.connect");

  const activeParams = Object.entries(route.params ?? {});

  return (
    <main className={`app-outlet ads ${canvas ? "ads-canvas" : ""}`}>
      <div className="ads-row-between">
        <div className="ads-title-stack">
          <h2 className="text-section" style={{ margin: 0 }} data-outlet-heading>
            {t("Ads Studio")}
          </h2>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <Button size="sm" onClick={() => void refresh()}>
            {t("Refresh")}
          </Button>
        </div>
      </div>

      {canvas && activeParams.length > 0 && (
        <div className="ads-route-params">
          <span>{t("Read-only canvas view · route params active:")}</span>
          {activeParams.map(([k, v]) => (
            <span key={k} className="ads-scope-tag">
              p.{k}={v}
            </span>
          ))}
        </div>
      )}

      {loadErr ? (
        <ErrorNotice onRetry={() => void refresh()}>{loadErr}</ErrorNotice>
      ) : data === null ? (
        <Loading>{t("Opening Ads Studio…")}</Loading>
      ) : (
        <>
          {route.section === "overview" && (
            <OverviewTab
              accounts={data.accounts}
              campaigns={data.campaigns}
              auditEvents={data.auditEvents}
              connectionsByPlatform={connectionsByPlatform}
              canWrite={canWrite}
              seeding={busySeed}
              range={range}
              platformFilter={platformFilter}
              onRangeChange={setRange}
              onPlatformChange={setPlatformFilter}
              onSeedStarter={async () => {
                setBusySeed(true);
                try {
                  await seedStarterWorkspace(scope);
                  await refresh();
                } finally {
                  setBusySeed(false);
                }
              }}
              onAddAccount={() => setDrawer({ kind: "new_account" })}
              onChooseConnectedAccounts={() => {
                setPickerFocus(null);
                setPickerOpen(true);
                setConnectNotice(null);
                void patchRoute({ section: "accounts", view: "list", record_id: null });
              }}
              onGoSection={(section) => void patchRoute({ section, view: "list", record_id: null })}
              onInspectCampaign={(id) => {
                const found = data.campaigns.find((c) => c.id === id);
                if (found) setDrawer({ kind: "campaign", record: found });
              }}
            />
          )}

          {route.section === "campaigns" && (
            <CampaignsTab
              campaigns={data.campaigns}
              accounts={data.accounts}
              search={search}
              platformFilter={platformFilter}
              statusFilter={statusFilter}
              onSearchChange={setSearch}
              onPlatformChange={setPlatformFilter}
              onStatusChange={setStatusFilter}
              onClearFilters={() => {
                setSearch("");
                setPlatformFilter("all");
                setStatusFilter("all");
              }}
              onInspectCampaign={(id) => {
                const found = data.campaigns.find((c) => c.id === id);
                if (found) setDrawer({ kind: "campaign", record: found });
              }}
            />
          )}

          {route.section === "creatives" && (
            <CreativesTab
              assets={data.assets}
              canWrite={canWrite}
              onInspectAsset={(id) => {
                const found = data.assets.find((a) => a.id === id);
                if (found) setDrawer({ kind: "asset", record: found });
              }}
              onAddAsset={() => setDrawer({ kind: "new_asset" })}
            />
          )}

          {route.section === "accounts" && (
            <AccountsTab
              accounts={data.accounts}
              connectionsByPlatform={connectionsByPlatform}
              loadingConnections={loadingConnections}
              connectionError={connectionError}
              pickerOpen={pickerOpen}
              pickerFocus={pickerFocus}
              pickerSelectedIds={new Set(pickerSelectedIds)}
              pickerOptedOut={pickerOptedOut}
              importingStatus={importingStatus}
              importResult={importResult}
              connectNotice={connectNotice}
              syncingAccountKey={syncingAccountKey}
              canWrite={canWrite}
              canConnect={canConnect}
              onRefresh={async () => {
                await refresh();
                await loadAllConnections();
              }}
              onOpenPicker={(focus) => {
                setPickerFocus(focus);
                setPickerOpen(true);
                setConnectNotice(null);
              }}
              onClosePicker={() => setPickerOpen(false)}
              onTogglePickerAsset={(pickerId) => {
                setPickerSelectedIds((prev) =>
                  prev.includes(pickerId)
                    ? prev.filter((id) => id !== pickerId)
                    : [...prev, pickerId],
                );
              }}
              onTogglePickerOptOut={(platform, nextOptOut) => {
                setPickerOptedOut((prev) => ({ ...prev, [platform]: nextOptOut }));
              }}
              onConfirmPicker={async (picks: AccountPickSelection[]) => {
                setImportingStatus({
                  active: true,
                  current: 1,
                  total: picks.length,
                  currentName: picks[0]?.displayName ?? "",
                });
                try {
                  const res = await confirmAndImportAccounts({
                    scope,
                    picks,
                    existingAccounts: data.accounts,
                    existingCampaigns: data.campaigns,
                    onProgress: ({ index, total, pick }) => {
                      setImportingStatus({
                        active: true,
                        current: index,
                        total,
                        currentName: pick.displayName,
                      });
                    },
                  });
                  setImportResult(res);
                  const succeededIds = new Set(
                    picks
                      .filter((_, i) => res.outcomes[i]?.status !== "failed")
                      .map((p) => p.pickerId),
                  );
                  setPickerSelectedIds((prev) => prev.filter((id) => !succeededIds.has(id)));
                  if (res.outcomes.every((o) => o.status !== "failed")) {
                    setPickerOpen(false);
                  }
                  await refresh();
                  await loadAllConnections();
                } finally {
                  setImportingStatus(null);
                }
              }}
              onRetryAccountSync={async (outcome: AccountSyncOutcome) => {
                const account = data.accounts.find(
                  (a) => a.profile.account_key === outcome.accountKey,
                );
                if (!account) return;
                setSyncingAccountKey(outcome.accountKey);
                try {
                  const updated = await syncSingleAccountCampaigns({
                    scope,
                    account,
                    connectionId: outcome.connectionId,
                    existingCampaigns: [...data.campaigns],
                  });
                  setImportResult((prev) =>
                    prev
                      ? {
                          ...prev,
                          importedCampaignCount: prev.outcomes.reduce(
                            (sum, o) =>
                              sum + (o.accountKey === outcome.accountKey ? updated.importedCount : o.importedCount),
                            0,
                          ),
                          outcomes: prev.outcomes.map((o) =>
                            o.accountKey === outcome.accountKey ? updated : o,
                          ),
                        }
                      : prev,
                  );
                  await refresh();
                } finally {
                  setSyncingAccountKey(null);
                }
              }}
              onSyncAccount={async (item) => {
                if (!item.record || !item.connectedAsset) return;
                setSyncingAccountKey(item.key);
                try {
                  const updated = await syncSingleAccountCampaigns({
                    scope,
                    account: item.record,
                    connectionId: item.connectedAsset.connectionId,
                    existingCampaigns: [...data.campaigns],
                  });
                  setImportResult({
                    importedCampaignCount: updated.importedCount,
                    adsStatus: "not_imported",
                    savedAccountKeys: [item.key],
                    outcomes: [updated],
                  });
                  await refresh();
                } finally {
                  setSyncingAccountKey(null);
                }
              }}
              onDismissImportResult={() => setImportResult(null)}
              onDismissConnectNotice={() => setConnectNotice(null)}
              onViewCampaigns={() =>
                void patchRoute({ section: "campaigns", view: "list", record_id: null })
              }
              onAddAccount={() => setDrawer({ kind: "new_account" })}
              onConnectPlatform={async (platform) => {
                try {
                  const { started } = await connectAdPlatform(scope, platform, "accounts");
                  if (!started) {
                    setConnectNotice("Connection was not completed. Your saved accounts and choices were kept.");
                  }
                } catch {
                  setConnectNotice("Connection was not completed. Your saved accounts and choices were kept.");
                }
              }}
              onToggleAccount={async (item, nextEnabled) => {
                if (item.record) {
                  await setAdAccountEnabled(scope, item.record, nextEnabled);
                } else if (nextEnabled) {
                  const validated = validateAccountInput({
                    platform: item.platform,
                    external_account_id: item.externalAccountId,
                    login_customer_id: item.loginCustomerId,
                    display_name: item.displayName,
                    currency: item.currency,
                    timezone: item.timezone,
                    daily_guardrail_minor: item.guardrailMinor,
                  });
                  if (!validated.ok) throw new Error(validated.error);
                  await createAdAccount(scope, validated.value);
                }
                await refresh();
              }}
              onSaveGuardrail={async (acct, dailyMinor) => {
                await saveAccountGuardrail(scope, acct, dailyMinor);
                await refresh();
              }}
            />
          )}

          {drawer && (
            <DetailDrawer
              drawer={drawer}
              accounts={data.accounts}
              auditEvents={data.auditEvents}
              canConnect={canConnect}
              onConnectPlatform={async (platform) => {
                await connectAdPlatform(scope, platform, "accounts");
              }}
              onClose={() => setDrawer(null)}
              onCreateAccount={async (account) => {
                await createAdAccount(scope, account);
                await refresh();
                void patchRoute({ section: "accounts", view: "list", record_id: null });
              }}
              onCreateAsset={async (asset) => {
                await registerAssetPointer(scope, asset);
                await refresh();
              }}
            />
          )}
        </>
      )}
    </main>
  );
}
