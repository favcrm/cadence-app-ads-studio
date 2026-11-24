import type { DisplayScope } from "../../bridge/scope";
import { clientFor, notifyWritten, serviceCall } from "../../bridge/services";
import {
  STARTER_SEED,
  type AdAccountProfile,
  type AdCampaignProfile,
  type AdProposalProfile,
  type AuditEventProfile,
  type CreativeAssetProfile,
  type Platform,
  type ProposalActionType,
  type StoredRecord,
} from "../../domain/ads";
import { fmtMoney } from "../../domain/money";

export interface ConnectedAssetOption {
  value: string;
  label: string;
  permission: string;
  selectable: boolean;
  currency?: string;
  timezone?: string;
}

export interface ConnectedAccountSource {
  connection_id: string;
  account: string;
  kind: string | null;
  selected: string | null;
  assets: ConnectedAssetOption[];
  error?: { code: string; message: string };
}

export interface ConnectedAssetsReply {
  toolkit: "metaads" | "googleads";
  connected: boolean;
  needs_reconnect: boolean;
  connections: ConnectedAccountSource[];
}

export interface MergedPlatformAccount {
  id: string;
  key: string;
  platform: Platform;
  displayName: string;
  externalAccountId: string;
  loginCustomerId: string | null;
  currency: string;
  timezone: string;
  status: "active" | "inactive";
  enabled: boolean;
  guardrailMinor: number;
  record: StoredRecord<AdAccountProfile> | null;
  connectedAsset: SelectableConnectedAsset | null;
  needsReconnect: boolean;
}

export interface SelectableConnectedAsset {
  connectionId: string;
  connectionAccount: string;
  asset: ConnectedAssetOption;
  normalizedExternalId: string;
  derivedDisplayName: string;
  isPinned: boolean;
  alreadyAdded: boolean;
}

export function normalizeGoogleCustomerId(raw: string): string {
  const cleaned = raw.trim().replace(/^customers\//i, "");
  const digitsOnly = cleaned.replace(/-/g, "");
  if (/^\d{10}$/.test(digitsOnly)) {
    return `${digitsOnly.slice(0, 3)}-${digitsOnly.slice(3, 6)}-${digitsOnly.slice(6)}`;
  }
  return cleaned;
}

export function normalizeExternalAccountId(platform: Platform, raw: string): string {
  const trimmed = raw.trim();
  if (platform === "meta") {
    return /^\d{4,24}$/.test(trimmed) ? `act_${trimmed}` : trimmed;
  }
  return normalizeGoogleCustomerId(trimmed);
}

export function deriveDisplayNameFromAsset(
  asset: Pick<ConnectedAssetOption, "label" | "value">,
  platform: Platform,
): string {
  const normalizedId = normalizeExternalAccountId(platform, asset.value);
  const rawId = asset.value.trim().replace(/^customers\//i, "");
  const plainDigits = rawId.replace(/-/g, "");
  let label = asset.label.trim();
  const candidates = new Set([rawId, normalizedId, plainDigits].filter((v) => v.length > 0));
  for (const id of candidates) {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    label = label
      .replace(new RegExp(`\\s*[—–-]\\s*${escaped}\\s*$`), "")
      .replace(new RegExp(`\\s*\\(${escaped}\\)\\s*$`), "")
      .trim();
  }
  const fallback = label.length > 0 ? label : normalizedId || asset.label.trim();
  return fallback.slice(0, 120);
}

export function parseConnectedAssetsReply(
  raw: unknown,
  platform: Platform,
): ConnectedAssetsReply {
  const expectedToolkit = platform === "meta" ? "metaads" : "googleads";
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Connections response is invalid.");
  }
  const body = raw as Record<string, unknown>;
  if (body.toolkit !== expectedToolkit || typeof body.connected !== "boolean" || !Array.isArray(body.connections)) {
    throw new Error("Connections response shape does not match the requested platform.");
  }
  const connections: ConnectedAccountSource[] = body.connections
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object" && !Array.isArray(entry))
    .map((entry) => {
      const assetsRaw = Array.isArray(entry.assets) ? entry.assets : [];
      const assets: ConnectedAssetOption[] = assetsRaw
        .filter((a): a is Record<string, unknown> => !!a && typeof a === "object" && !Array.isArray(a))
        .filter((a) => typeof a.value === "string" && typeof a.label === "string" && typeof a.selectable === "boolean")
        .map((a) => ({
          value: a.value as string,
          label: a.label as string,
          permission: typeof a.permission === "string" ? a.permission : "",
          selectable: a.selectable as boolean,
          ...(typeof a.currency === "string" ? { currency: a.currency } : {}),
          ...(typeof a.timezone === "string" ? { timezone: a.timezone } : {}),
        }));
      const errObj =
        entry.error && typeof entry.error === "object" && !Array.isArray(entry.error)
          ? (entry.error as Record<string, unknown>)
          : null;
      return {
        connection_id: typeof entry.connection_id === "string" ? entry.connection_id : "",
        account: typeof entry.account === "string" ? entry.account : "",
        kind: typeof entry.kind === "string" ? entry.kind : null,
        selected: typeof entry.selected === "string" ? entry.selected : null,
        assets,
        ...(errObj && typeof errObj.message === "string"
          ? {
              error: {
                code: typeof errObj.code === "string" ? errObj.code : "capability_unavailable",
                message: errObj.message,
              },
            }
          : {}),
      };
    });
  return {
    toolkit: expectedToolkit,
    connected: body.connected,
    needs_reconnect: body.needs_reconnect === true,
    connections,
  };
}

export function flattenSelectableConnectedAssets(
  reply: ConnectedAssetsReply,
  platform: Platform,
  existingAccounts: readonly StoredRecord<AdAccountProfile>[],
): SelectableConnectedAsset[] {
  const existingIds = new Set(
    existingAccounts
      .filter((acc) => acc.profile.platform === platform)
      .map((acc) => normalizeExternalAccountId(platform, acc.profile.external_account_id).toLowerCase()),
  );
  const out: SelectableConnectedAsset[] = [];
  for (const conn of reply.connections) {
    const pinnedNorm = conn.selected ? normalizeExternalAccountId(platform, conn.selected).toLowerCase() : null;
    for (const asset of conn.assets) {
      if (!asset.selectable) continue;
      const normalizedExternalId = normalizeExternalAccountId(platform, asset.value);
      const isPinned =
        asset.value === conn.selected ||
        (pinnedNorm !== null && normalizedExternalId.toLowerCase() === pinnedNorm);
      out.push({
        connectionId: conn.connection_id,
        connectionAccount: conn.account,
        asset,
        normalizedExternalId,
        derivedDisplayName: deriveDisplayNameFromAsset(asset, platform),
        isPinned,
        alreadyAdded: existingIds.has(normalizedExternalId.toLowerCase()),
      });
    }
  }
  return out;
}

export function pickPreferredConnectedAsset(
  options: readonly SelectableConnectedAsset[],
): SelectableConnectedAsset | null {
  return (
    options.find((opt) => opt.isPinned && !opt.alreadyAdded) ??
    options.find((opt) => !opt.alreadyAdded) ??
    options.find((opt) => opt.isPinned) ??
    options[0] ??
    null
  );
}

export async function loadConnectedAdAssets(
  scope: DisplayScope,
  platform: Platform,
): Promise<ConnectedAssetsReply> {
  const toolkit = platform === "meta" ? "metaads" : "googleads";
  const raw = await serviceCall(scope, "connections.assets", { toolkit }, true);
  return parseConnectedAssetsReply(raw, platform);
}

export async function connectAdPlatform(
  scope: DisplayScope,
  platform: Platform,
  section = "accounts",
): Promise<{ started: boolean }> {
  const toolkit = platform === "meta" ? "metaads" : "googleads";
  const raw = await serviceCall(scope, "connections.connect", { toolkit, section }, false);
  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  return { started: body?.started === true };
}

/** Merge saved workspace ad accounts with discovered connected assets per platform. */
export function mergePlatformAccounts(
  savedAccounts: readonly StoredRecord<AdAccountProfile>[],
  connectionsByPlatform: Partial<Record<Platform, ConnectedAssetsReply>>,
): MergedPlatformAccount[] {
  const out: MergedPlatformAccount[] = [];
  for (const platform of ["meta", "google"] as const) {
    const reply = connectionsByPlatform[platform] ?? null;
    const needsReconnect = reply?.needs_reconnect === true;
    const discovered = reply ? flattenSelectableConnectedAssets(reply, platform, savedAccounts) : [];
    const byNormId = new Map<string, SelectableConnectedAsset>();
    for (const opt of discovered) {
      byNormId.set(opt.normalizedExternalId.toLowerCase(), opt);
    }

    const platformSaved = savedAccounts.filter((acc) => acc.profile.platform === platform);
    const seenIds = new Set<string>();
    for (const rec of platformSaved) {
      const norm = normalizeExternalAccountId(platform, rec.profile.external_account_id).toLowerCase();
      seenIds.add(norm);
      const match = byNormId.get(norm) ?? null;
      const status = rec.profile.status === "inactive" ? "inactive" : "active";
      out.push({
        id: rec.id,
        key: rec.profile.account_key,
        platform,
        displayName: rec.profile.display_name,
        externalAccountId: rec.profile.external_account_id,
        loginCustomerId: rec.profile.login_customer_id,
        currency: rec.profile.currency,
        timezone: rec.profile.timezone,
        status,
        enabled: status === "active",
        guardrailMinor: rec.profile.daily_guardrail_minor,
        record: rec,
        connectedAsset: match,
        needsReconnect,
      });
    }

    for (const opt of discovered) {
      const norm = opt.normalizedExternalId.toLowerCase();
      if (seenIds.has(norm)) continue;
      seenIds.add(norm);
      out.push({
        id: `conn:${platform}:${opt.connectionId}:${opt.asset.value}`,
        key: `${platform}_${norm.replace(/[^a-z0-9]+/g, "_")}`,
        platform,
        displayName: opt.derivedDisplayName,
        externalAccountId: opt.normalizedExternalId,
        loginCustomerId: null,
        currency: opt.asset.currency?.trim().toUpperCase() || "HKD",
        timezone: opt.asset.timezone?.trim() || "Asia/Hong_Kong",
        status: "inactive",
        enabled: false,
        guardrailMinor: 150000,
        record: null,
        connectedAsset: opt,
        needsReconnect,
      });
    }
  }
  return out;
}

export interface WorkspaceDataset {
  accounts: StoredRecord<AdAccountProfile>[];
  campaigns: StoredRecord<AdCampaignProfile>[];
  proposals: StoredRecord<AdProposalProfile>[];
  assets: StoredRecord<CreativeAssetProfile>[];
  auditEvents: StoredRecord<AuditEventProfile>[];
}

interface RawListAnswer {
  records?: { id: string; revision: number; profile: unknown }[];
}

function parseRecords<T>(raw: unknown): StoredRecord<T>[] {
  const ans = raw as RawListAnswer | null;
  if (!ans || !Array.isArray(ans.records)) return [];
  return ans.records.map((r) => ({
    id: r.id,
    revision: r.revision,
    profile: r.profile as T,
  }));
}

async function listTable<T>(scope: DisplayScope, table: string): Promise<StoredRecord<T>[]> {
  const call = clientFor(scope);
  const res = await call("records.list", { table, limit: 100 });
  return parseRecords<T>(res);
}

export async function loadWorkspaceData(scope: DisplayScope): Promise<WorkspaceDataset> {
  const [accounts, campaigns, proposals, assets, auditEvents] = await Promise.all([
    listTable<AdAccountProfile>(scope, "ad_accounts"),
    listTable<AdCampaignProfile>(scope, "ad_campaigns"),
    listTable<AdProposalProfile>(scope, "ad_proposals"),
    listTable<CreativeAssetProfile>(scope, "creative_assets"),
    listTable<AuditEventProfile>(scope, "audit_events"),
  ]);
  return {
    accounts,
    campaigns,
    proposals,
    assets,
    auditEvents: [...auditEvents].reverse(),
  };
}

export async function seedStarterWorkspace(scope: DisplayScope): Promise<void> {
  const items = [
    ...STARTER_SEED.accounts.map((profile) => ({
      table: "ad_accounts",
      record_id: `acct-${profile.account_key}`,
      profile,
    })),
    ...STARTER_SEED.campaigns.map((profile) => ({
      table: "ad_campaigns",
      record_id: `camp-${profile.campaign_key}`,
      profile,
    })),
    ...STARTER_SEED.proposals.map((profile) => ({
      table: "ad_proposals",
      record_id: `prop-${profile.proposal_key}`,
      profile,
    })),
    ...STARTER_SEED.assets.map((profile) => ({
      table: "creative_assets",
      record_id: `ast-${profile.asset_key}`,
      profile,
    })),
    ...STARTER_SEED.auditEvents.map((profile) => ({
      table: "audit_events",
      record_id: `evt-${profile.event_key}`,
      profile,
    })),
  ];
  await serviceCall(scope, "records.batch", { items });
  notifyWritten();
}

export async function saveAccountGuardrail(
  scope: DisplayScope,
  account: StoredRecord<AdAccountProfile>,
  dailyGuardrailMinor: number,
): Promise<void> {
  await serviceCall(scope, "records.update", {
    table: "ad_accounts",
    record_id: account.id,
    expected_revision: account.revision,
    profile: { ...account.profile, daily_guardrail_minor: dailyGuardrailMinor },
  });
  notifyWritten();
}

export async function setAdAccountEnabled(
  scope: DisplayScope,
  account: StoredRecord<AdAccountProfile>,
  enabled: boolean,
): Promise<void> {
  const nextStatus = enabled ? "active" : "inactive";
  await serviceCall(scope, "records.update", {
    table: "ad_accounts",
    record_id: account.id,
    expected_revision: account.revision,
    profile: { ...account.profile, status: nextStatus },
  });
  notifyWritten();
}

export async function stageProposal(
  scope: DisplayScope,
  input: {
    account: AdAccountProfile;
    campaign: AdCampaignProfile | null;
    campaignName: string;
    actionType: ProposalActionType;
    newBudgetMinor: number | null;
    rationale: string;
  },
): Promise<void> {
  const suffix = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const proposalKey = `prop_${suffix}`;
  const isBudget = input.actionType === "budget_update";
  const isCreate = input.actionType === "create_campaign";
  const toolSlug =
    input.account.platform === "meta"
      ? isCreate
        ? "meta_ads_create_campaign"
        : "meta_ads_update_campaign"
      : isCreate
        ? "google_ads_create_campaign"
        : isBudget
          ? "google_ads_update_budget"
          : "google_ads_update_campaign_status";

  const beforeLabel = isCreate
    ? "New campaign (not created)"
    : isBudget && input.campaign
      ? `Daily budget: ${fmtMoney(input.campaign.daily_budget_minor, input.account.currency)}`
      : `Status: ${input.campaign?.status ?? "ACTIVE"}`;
  const afterLabel = isCreate
    ? `Create PAUSED · ${fmtMoney(input.newBudgetMinor ?? 50000, input.account.currency)}/day`
    : isBudget
      ? `Daily budget: ${fmtMoney(input.newBudgetMinor, input.account.currency)}`
      : `Status: ${input.actionType === "pause" ? "PAUSED" : "ACTIVE"}`;

  const proposal: AdProposalProfile = {
    proposal_key: proposalKey,
    account_key: input.account.account_key,
    campaign_key: input.campaign?.campaign_key ?? null,
    campaign_name: input.campaignName,
    platform: input.account.platform,
    tool_slug: toolSlug,
    action_type: input.actionType,
    before_label: beforeLabel,
    after_label: afterLabel,
    new_budget_minor: input.newBudgetMinor,
    rationale: input.rationale,
    proposed_by: "Owner",
    proposed_at: "Just now",
    status: "pending",
    action_id_hex: `${Date.now().toString(16).padEnd(32, "a").slice(0, 32)}`,
  };

  const event: AuditEventProfile = {
    event_key: `evt_${suffix}`,
    kind: "proposal",
    summary: `Staged ${proposalKey} for ${input.campaignName}: ${beforeLabel} -> ${afterLabel}`,
    summary_zh: `已暫存變更 ${proposalKey}（${input.campaignName}）：${afterLabel}`,
    occurred_at: "Just now",
  };

  await serviceCall(scope, "records.batch", {
    items: [
      { table: "ad_proposals", record_id: `prop-${proposalKey}`, profile: proposal },
      { table: "audit_events", record_id: `evt-${suffix}`, profile: event },
    ],
  });
  notifyWritten();
}

export async function decideProposal(
  scope: DisplayScope,
  proposal: StoredRecord<AdProposalProfile>,
  campaign: StoredRecord<AdCampaignProfile> | null,
  decision: "applied" | "rejected",
): Promise<void> {
  await serviceCall(
    scope,
    "records.update",
    {
      table: "ad_proposals",
      record_id: proposal.id,
      expected_revision: proposal.revision,
      profile: { ...proposal.profile, status: decision },
    },
    true,
  );

  if (decision === "applied") {
    if (campaign) {
      const next = { ...campaign.profile };
      if (proposal.profile.action_type === "budget_update" && proposal.profile.new_budget_minor) {
        next.daily_budget_minor = proposal.profile.new_budget_minor;
      } else if (proposal.profile.action_type === "pause") {
        next.status = "PAUSED";
      } else if (proposal.profile.action_type === "resume") {
        next.status = "ACTIVE";
      }
      await serviceCall(
        scope,
        "records.update",
        {
          table: "ad_campaigns",
          record_id: campaign.id,
          expected_revision: campaign.revision,
          profile: next,
        },
        true,
      );
    } else if (proposal.profile.action_type === "create_campaign") {
      const key = `cmp_${Date.now().toString(36)}`;
      const budget = proposal.profile.new_budget_minor ?? 50000;
      const created: AdCampaignProfile = {
        campaign_key: key,
        account_key: proposal.profile.account_key,
        platform: proposal.profile.platform,
        external_campaign_id: `990${Date.now().toString().slice(-7)}`,
        name: proposal.profile.campaign_name,
        objective: "OUTCOME_SALES",
        status: "PAUSED",
        daily_budget_minor: budget,
        spend_7d_minor: 0,
        impressions_7d: 0,
        clicks_7d: 0,
        google_conversions: null,
        meta_actions_json: null,
        cpa_minor: null,
        ad_sets_json: [
          { name: "Initial Asset Group (Paused)", status: "PAUSED", budgetMinor: budget, spendMinor: 0, clicks: 0 },
        ],
      };
      await serviceCall(
        scope,
        "records.create",
        { table: "ad_campaigns", record_id: `camp-${key}`, profile: created },
        true,
      );
    }
  }

  const suffix = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
  const event: AuditEventProfile = {
    event_key: `evt_${suffix}`,
    kind: decision === "applied" ? "approval" : "proposal",
    summary:
      decision === "applied"
        ? `Approved & applied ${proposal.profile.proposal_key}: ${proposal.profile.after_label}`
        : `Rejected ${proposal.profile.proposal_key} (${proposal.profile.campaign_name})`,
    summary_zh:
      decision === "applied"
        ? `已核准並套用 ${proposal.profile.proposal_key}：${proposal.profile.after_label}`
        : `已駁回 ${proposal.profile.proposal_key}（${proposal.profile.campaign_name}）`,
    occurred_at: "Just now",
  };
  await serviceCall(scope, "records.create", {
    table: "audit_events",
    record_id: `evt-${suffix}`,
    profile: event,
  });
  notifyWritten();
}

export async function createAdAccount(
  scope: DisplayScope,
  account: AdAccountProfile,
): Promise<void> {
  const suffix = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
  const event: AuditEventProfile = {
    event_key: `evt_${suffix}`,
    kind: "sync",
    summary: `Connected ${account.platform === "meta" ? "Meta Ads" : "Google Ads"} account ${account.display_name} (${account.external_account_id})`,
    summary_zh: `已登記 ${account.platform === "meta" ? "Meta Ads" : "Google Ads"} 帳號 ${account.display_name}（${account.external_account_id}）`,
    occurred_at: new Date().toISOString().slice(0, 16).replace("T", " "),
  };
  await serviceCall(scope, "records.batch", {
    items: [
      { table: "ad_accounts", record_id: `acct-${account.account_key}`, profile: account },
      { table: "audit_events", record_id: `evt-${suffix}`, profile: event },
    ],
  });
  notifyWritten();
}

export async function registerAssetPointer(
  scope: DisplayScope,
  asset: CreativeAssetProfile,
): Promise<void> {
  const suffix = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
  const event: AuditEventProfile = {
    event_key: `evt_${suffix}`,
    kind: "sync",
    summary: `Registered Workspace creative pointer ${asset.name} (${asset.wiki_path})`,
    summary_zh: `已登記工作區素材指標 ${asset.name}（${asset.wiki_path}）`,
    occurred_at: new Date().toISOString().slice(0, 16).replace("T", " "),
  };
  await serviceCall(scope, "records.batch", {
    items: [
      { table: "creative_assets", record_id: `ast-${asset.asset_key}`, profile: asset },
      { table: "audit_events", record_id: `evt-${suffix}`, profile: event },
    ],
  });
  notifyWritten();
}
