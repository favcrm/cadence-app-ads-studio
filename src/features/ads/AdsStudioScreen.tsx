import { Button, ErrorNotice, Loading } from "@cadence/screen-ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { patchRoute } from "../../bridge/route";
import { scopeError, useCanvasReadOnly, useScope } from "../../bridge/scope";
import type {
  AdProposalProfile,
  CampaignStatus,
  Platform,
  StoredRecord,
} from "../../domain/ads";
import { AccountsTab } from "./AccountsTab";
import { ApprovalModal } from "./ApprovalModal";
import { CampaignsTab } from "./CampaignsTab";
import { CreativesTab } from "./CreativesTab";
import { DetailDrawer, type ActiveDrawer } from "./DetailDrawer";
import { AdsLocaleProvider, useLocale } from "./locale";
import { OverviewTab } from "./OverviewTab";
import { ProposalsTab } from "./ProposalsTab";
import {
  decideProposal,
  loadWorkspaceData,
  registerAssetPointer,
  saveAccountGuardrail,
  seedStarterWorkspace,
  stageProposal,
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
  const [modalProposal, setModalProposal] = useState<StoredRecord<AdProposalProfile> | null>(null);

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

  useEffect(() => {
    if (snapshot) void refresh();
  }, [refresh, snapshot]);

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
          {canWrite && (
            <Button variant="primary" size="sm" onClick={() => setDrawer({ kind: "new_campaign" })}>
              {t("+ Propose campaign")}
            </Button>
          )}
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
              proposals={data.proposals}
              auditEvents={data.auditEvents}
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

          {route.section === "proposals" && (
            <ProposalsTab
              proposals={data.proposals}
              accounts={data.accounts}
              canWrite={canWrite}
              onReviewProposal={(rec) => {
                setDrawer(null);
                setModalProposal(rec);
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
              canWrite={canWrite}
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
              canWrite={canWrite}
              onClose={() => setDrawer(null)}
              onStageProposal={async (input) => {
                await stageProposal(scope, input);
                await refresh();
                void patchRoute({ section: "proposals", view: "list", record_id: null });
              }}
              onCreateAsset={async (asset) => {
                await registerAssetPointer(scope, asset);
                await refresh();
              }}
            />
          )}

          {modalProposal && canWrite && (
            <ApprovalModal
              proposal={modalProposal}
              accounts={data.accounts}
              onCancel={() => setModalProposal(null)}
              onConfirm={async (decision) => {
                const camp =
                  data.campaigns.find(
                    (c) => c.profile.campaign_key === modalProposal.profile.campaign_key,
                  ) ?? null;
                await decideProposal(scope, modalProposal, camp, decision);
                setModalProposal(null);
                await refresh();
              }}
            />
          )}
        </>
      )}
    </main>
  );
}
