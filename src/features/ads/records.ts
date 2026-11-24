import type { DisplayScope } from "../../bridge/scope";
import { clientFor, notifyWritten, serviceCall } from "../../bridge/services";
import {
  STARTER_SEED,
  validateAccountInput,
  type AdAccountProfile,
  type AdCampaignProfile,
  type AdProposalProfile,
  type AuditEventProfile,
  type CampaignStatus,
  type CreativeAssetProfile,
  type MetaActionCount,
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
  login_customer_id?: string;
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
          ...(typeof a.login_customer_id === "string"
            ? { login_customer_id: a.login_customer_id }
            : {}),
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
        key: normalizeImportedAccountKey(platform, opt.normalizedExternalId),
        platform,
        displayName: opt.derivedDisplayName,
        externalAccountId: opt.normalizedExternalId,
        loginCustomerId: opt.asset.login_customer_id
          ? normalizeGoogleCustomerId(opt.asset.login_customer_id)
          : null,
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

export type BridgeCaller = <Verb extends Parameters<typeof serviceCall>[1]>(
  verb: Verb,
  args: Parameters<typeof serviceCall<Verb>>[2],
  quiet?: boolean,
) => Promise<unknown>;

export interface ImportedCampaignRow {
  external_campaign_id: string;
  name: string;
  objective: string;
  status: CampaignStatus;
  daily_budget_minor: number;
  spend_7d_minor: number;
  impressions_7d: number;
  clicks_7d: number;
  google_conversions: number | null;
  meta_actions_json: MetaActionCount[] | null;
  cpa_minor: number | null;
}

export interface ImportedCampaignsReply {
  toolkit: "metaads" | "googleads";
  platform: Platform;
  connection_id: string;
  account_id: string;
  login_customer_id: string | null;
  currency: string;
  status: "ok" | "empty" | "partial";
  truncated: boolean;
  synced_at: string;
  levels: { campaigns: number; ads: null };
  ads_status: "not_imported";
  warnings: Array<{ code: string; message: string }>;
  campaigns: ImportedCampaignRow[];
}

export interface PickerSelectableAsset {
  pickerId: string;
  connectionId: string;
  connectionAccount: string;
  platform: Platform;
  externalAccountId: string;
  loginCustomerId: string | null;
  displayName: string;
  currency: string;
  timezone: string;
  isPinned: boolean;
  alreadyAdded: boolean;
}

export interface PickerUnavailableAsset {
  pickerId: string;
  platform: Platform;
  displayName: string;
  externalAccountId: string;
  permission: string;
}

export interface ProviderPickerSection {
  platform: Platform;
  connected: boolean;
  needsReconnect: boolean;
  state: "not_connected" | "expired" | "empty" | "unavailable" | "ready";
  selectableAssets: PickerSelectableAsset[];
  unavailableAssets: PickerUnavailableAsset[];
  connectionError: string | null;
}

export interface AccountPickerModel {
  visiblePlatforms: Platform[];
  providers: ProviderPickerSection[];
  defaultSelectedIds: string[];
  alreadyTrackedCount: number;
}

export interface AccountPickSelection {
  pickerId: string;
  connectionId: string;
  platform: Platform;
  externalAccountId: string;
  loginCustomerId: string | null;
  displayName: string;
  currency: string;
  timezone: string;
}

export interface AccountSyncOutcome {
  accountKey: string;
  displayName: string;
  platform: Platform;
  connectionId: string;
  externalAccountId: string;
  status: "ok" | "empty" | "partial" | "failed";
  importedCount: number;
  truncated: boolean;
  warnings: Array<{ code: string; message: string }>;
  code?: string;
  message?: string;
  retryable: boolean;
  needsReconnect: boolean;
}

export interface ConfirmImportResult {
  importedCampaignCount: number;
  adsStatus: "not_imported";
  savedAccountKeys: string[];
  outcomes: AccountSyncOutcome[];
}

export function connectProviderToPlatform(raw: string | null | undefined): Platform | null {
  if (!raw) return null;
  const cleaned = raw.trim().toLowerCase();
  if (cleaned === "metaads" || cleaned === "meta") return "meta";
  if (cleaned === "googleads" || cleaned === "google") return "google";
  return null;
}

export function normalizeImportedAccountKey(platform: Platform, externalId: string): string {
  const norm = normalizeExternalAccountId(platform, externalId);
  const slug = norm.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const combined = `${platform}_${slug || "acct"}`.slice(0, 40).replace(/_+$/g, "");
  return combined.length >= 3 ? combined : `${platform}_acct`;
}

function normalizeCampaignKey(accountKey: string, externalCampaignId: string): string {
  const slug = externalCampaignId
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const raw = `${accountKey}_${slug || "cmp"}`;
  if (raw.length <= 64) return raw;
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const suffix = `_${(hash >>> 0).toString(36)}`;
  return `${raw.slice(0, 64 - suffix.length).replace(/_+$/g, "")}${suffix}`;
}

export function parseImportedCampaignsReply(raw: unknown): ImportedCampaignsReply {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Campaign import response is invalid.");
  }
  const body = raw as Record<string, unknown>;
  if (
    (body.toolkit !== "metaads" && body.toolkit !== "googleads") ||
    (body.platform !== "meta" && body.platform !== "google") ||
    typeof body.connection_id !== "string" ||
    typeof body.account_id !== "string" ||
    !Array.isArray(body.campaigns)
  ) {
    throw new Error("Campaign import response is malformed.");
  }
  const warnings = Array.isArray(body.warnings)
    ? body.warnings
        .filter((w): w is Record<string, unknown> => !!w && typeof w === "object")
        .map((w) => ({
          code: typeof w.code === "string" ? w.code : "warning",
          message: typeof w.message === "string" ? w.message : "Partial campaign reporting returned.",
        }))
    : [];
  const campaigns: ImportedCampaignRow[] = body.campaigns
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .map((c) => {
      const status: CampaignStatus =
        c.status === "ACTIVE" || c.status === "PAUSED" || c.status === "LIMITED"
          ? c.status
          : "PAUSED";
      const actions = Array.isArray(c.meta_actions_json)
        ? c.meta_actions_json
            .filter(
              (a): a is Record<string, unknown> =>
                !!a && typeof a === "object" && typeof a.actionType === "string",
            )
            .map((a) => ({
              actionType: a.actionType as string,
              value: typeof a.value === "number" && Number.isFinite(a.value) ? a.value : 0,
            }))
        : null;
      return {
        external_campaign_id: String(c.external_campaign_id ?? ""),
        name: String(c.name ?? c.external_campaign_id ?? "Campaign").slice(0, 160),
        objective: String(c.objective ?? (body.platform === "meta" ? "OUTCOME_AWARENESS" : "SEARCH")).slice(0, 64),
        status,
        daily_budget_minor:
          typeof c.daily_budget_minor === "number" && Number.isFinite(c.daily_budget_minor)
            ? Math.max(0, Math.round(c.daily_budget_minor))
            : 0,
        spend_7d_minor:
          typeof c.spend_7d_minor === "number" && Number.isFinite(c.spend_7d_minor)
            ? Math.max(0, Math.round(c.spend_7d_minor))
            : 0,
        impressions_7d:
          typeof c.impressions_7d === "number" && Number.isFinite(c.impressions_7d)
            ? Math.max(0, Math.round(c.impressions_7d))
            : 0,
        clicks_7d:
          typeof c.clicks_7d === "number" && Number.isFinite(c.clicks_7d)
            ? Math.max(0, Math.round(c.clicks_7d))
            : 0,
        google_conversions:
          typeof c.google_conversions === "number" && Number.isFinite(c.google_conversions)
            ? Math.max(0, Math.round(c.google_conversions))
            : null,
        meta_actions_json: actions,
        cpa_minor:
          typeof c.cpa_minor === "number" && Number.isFinite(c.cpa_minor)
            ? Math.max(0, Math.round(c.cpa_minor))
            : null,
      };
    })
    .filter((c) => c.external_campaign_id.length > 0);

  const levelsObj =
    body.levels && typeof body.levels === "object"
      ? (body.levels as Record<string, unknown>)
      : {};
  return {
    toolkit: body.toolkit,
    platform: body.platform,
    connection_id: body.connection_id,
    account_id: body.account_id,
    login_customer_id:
      typeof body.login_customer_id === "string" ? body.login_customer_id : null,
    currency: typeof body.currency === "string" && body.currency.trim() ? body.currency.trim().toUpperCase() : "HKD",
    status: body.status === "empty" || body.status === "partial" ? body.status : "ok",
    truncated: body.truncated === true,
    synced_at: typeof body.synced_at === "string" ? body.synced_at : new Date().toISOString(),
    levels: {
      campaigns:
        typeof levelsObj.campaigns === "number" ? levelsObj.campaigns : campaigns.length,
      ads: null,
    },
    ads_status: "not_imported",
    warnings,
    campaigns,
  };
}

export function buildAccountPickerModel(input: {
  connectionsByPlatform: Partial<Record<Platform, ConnectedAssetsReply>>;
  existingAccounts: readonly StoredRecord<AdAccountProfile>[];
  focusPlatform: Platform | null;
}): AccountPickerModel {
  const { connectionsByPlatform, existingAccounts, focusPlatform } = input;
  const visiblePlatforms: Platform[] = focusPlatform
    ? [focusPlatform]
    : (["meta", "google"] as const).filter((p) => {
        const reply = connectionsByPlatform[p];
        return !!reply && (reply.connected || reply.needs_reconnect || reply.connections.length > 0);
      });

  const existingByPlatform = new Map<Platform, Set<string>>([
    ["meta", new Set()],
    ["google", new Set()],
  ]);
  for (const acct of existingAccounts) {
    existingByPlatform
      .get(acct.profile.platform)
      ?.add(normalizeExternalAccountId(acct.profile.platform, acct.profile.external_account_id).toLowerCase());
  }

  const providers: ProviderPickerSection[] = [];
  const defaultSelectedIds: string[] = [];
  let alreadyTrackedCount = 0;

  for (const platform of visiblePlatforms) {
    const reply = connectionsByPlatform[platform] ?? null;
    if (!reply || (!reply.connected && !reply.needs_reconnect && reply.connections.length === 0)) {
      providers.push({
        platform,
        connected: false,
        needsReconnect: false,
        state: "not_connected",
        selectableAssets: [],
        unavailableAssets: [],
        connectionError: null,
      });
      continue;
    }
    if (reply.needs_reconnect) {
      providers.push({
        platform,
        connected: false,
        needsReconnect: true,
        state: "expired",
        selectableAssets: [],
        unavailableAssets: [],
        connectionError:
          reply.connections.find((c) => c.error?.message)?.error?.message ?? null,
      });
      continue;
    }

    const existingSet = existingByPlatform.get(platform) ?? new Set<string>();
    const selectableAssets: PickerSelectableAsset[] = [];
    const unavailableAssets: PickerUnavailableAsset[] = [];
    let connErr: string | null = null;

    for (const conn of reply.connections) {
      if (conn.error?.message && !connErr) connErr = conn.error.message;
      const pinnedNorm = conn.selected
        ? normalizeExternalAccountId(platform, conn.selected).toLowerCase()
        : null;
      for (const asset of conn.assets) {
        const normalizedExternalId = normalizeExternalAccountId(platform, asset.value);
        const pickerId = `${platform}:${conn.connection_id}:${asset.value}`;
        const displayName = deriveDisplayNameFromAsset(asset, platform);
        if (!asset.selectable) {
          unavailableAssets.push({
            pickerId,
            platform,
            displayName,
            externalAccountId: normalizedExternalId,
            permission: asset.permission || "unavailable",
          });
          continue;
        }
        const alreadyAdded = existingSet.has(normalizedExternalId.toLowerCase());
        if (alreadyAdded) alreadyTrackedCount += 1;
        const isPinned =
          asset.value === conn.selected ||
          (pinnedNorm !== null && normalizedExternalId.toLowerCase() === pinnedNorm);
        selectableAssets.push({
          pickerId,
          connectionId: conn.connection_id,
          connectionAccount: conn.account,
          platform,
          externalAccountId: normalizedExternalId,
          loginCustomerId:
            platform === "google" && asset.login_customer_id
              ? normalizeGoogleCustomerId(asset.login_customer_id)
              : null,
          displayName,
          currency: asset.currency?.trim().toUpperCase() || "HKD",
          timezone: asset.timezone?.trim() || "Asia/Hong_Kong",
          isPinned,
          alreadyAdded,
        });
      }
    }

    if (selectableAssets.length === 1 && !selectableAssets[0]!.alreadyAdded) {
      defaultSelectedIds.push(selectableAssets[0]!.pickerId);
    }

    const state: ProviderPickerSection["state"] =
      selectableAssets.length > 0
        ? "ready"
        : unavailableAssets.length > 0
          ? "unavailable"
          : "empty";

    providers.push({
      platform,
      connected: true,
      needsReconnect: false,
      state,
      selectableAssets,
      unavailableAssets,
      connectionError: connErr,
    });
  }

  return { visiblePlatforms, providers, defaultSelectedIds, alreadyTrackedCount };
}

function cleanToolkitAccountId(platform: Platform, externalAccountId: string): string {
  const trimmed = externalAccountId.trim();
  if (platform === "meta") {
    return /^act_\d+$/.test(trimmed) ? trimmed : normalizeExternalAccountId("meta", trimmed);
  }
  return trimmed.replace(/^customers\//i, "").replace(/-/g, "");
}

function cleanLoginCustomerId(loginCustomerId: string | null): string | undefined {
  if (!loginCustomerId) return undefined;
  const digits = loginCustomerId.trim().replace(/^customers\//i, "").replace(/-/g, "");
  return /^\d{10}$/.test(digits) ? digits : undefined;
}

export async function syncSingleAccountCampaigns(input: {
  scope: DisplayScope;
  call?: BridgeCaller;
  account: StoredRecord<AdAccountProfile>;
  connectionId: string;
  existingCampaigns: StoredRecord<AdCampaignProfile>[];
}): Promise<AccountSyncOutcome> {
  const call: BridgeCaller =
    input.call ?? ((verb, args, quiet = false) => serviceCall(input.scope, verb, args, quiet));
  const { account, connectionId, existingCampaigns } = input;
  const platform = account.profile.platform;
  const toolkit = platform === "meta" ? "metaads" : "googleads";
  const accountId = cleanToolkitAccountId(platform, account.profile.external_account_id);
  const loginCustomerId =
    platform === "google" ? cleanLoginCustomerId(account.profile.login_customer_id) : undefined;

  try {
    const raw = await call(
      "connections.ads.campaigns",
      {
        toolkit,
        connection_id: connectionId,
        account_id: accountId,
        ...(loginCustomerId ? { login_customer_id: loginCustomerId } : {}),
      },
      true,
    );
    const reply = parseImportedCampaignsReply(raw);
    for (const row of reply.campaigns) {
      const campaignKey = normalizeCampaignKey(account.profile.account_key, row.external_campaign_id);
      const matchIndex = existingCampaigns.findIndex(
        (c) =>
          (c.profile.account_key === account.profile.account_key &&
            c.profile.external_campaign_id === row.external_campaign_id) ||
          c.profile.campaign_key === campaignKey,
      );
      const existing = matchIndex >= 0 ? existingCampaigns[matchIndex]! : null;
      const profile: AdCampaignProfile = {
        campaign_key: existing?.profile.campaign_key ?? campaignKey,
        account_key: account.profile.account_key,
        platform,
        external_campaign_id: row.external_campaign_id,
        name: row.name,
        objective: row.objective,
        status: row.status,
        daily_budget_minor: row.daily_budget_minor,
        spend_7d_minor: row.spend_7d_minor,
        impressions_7d: row.impressions_7d,
        clicks_7d: row.clicks_7d,
        google_conversions: platform === "google" ? row.google_conversions : null,
        meta_actions_json: platform === "meta" ? row.meta_actions_json : null,
        cpa_minor: row.cpa_minor,
        ad_sets_json: existing?.profile.ad_sets_json ?? [],
      };
      if (existing) {
        const res = (await call(
          "records.update",
          {
            table: "ad_campaigns",
            record_id: existing.id,
            expected_revision: existing.revision,
            profile,
          },
          true,
        )) as { record?: StoredRecord<AdCampaignProfile> } | null;
        if (res?.record) existingCampaigns[matchIndex] = res.record;
      } else {
        const recordId = `camp-${profile.campaign_key}`;
        const res = (await call(
          "records.create",
          {
            table: "ad_campaigns",
            record_id: recordId,
            profile,
          },
          true,
        )) as { record?: StoredRecord<AdCampaignProfile> } | null;
        existingCampaigns.push(res?.record ?? { id: recordId, revision: 1, profile });
      }
    }
    notifyWritten();
    return {
      accountKey: account.profile.account_key,
      displayName: account.profile.display_name,
      platform,
      connectionId,
      externalAccountId: account.profile.external_account_id,
      status: reply.status === "partial" ? "partial" : reply.campaigns.length === 0 ? "empty" : "ok",
      importedCount: reply.campaigns.length,
      truncated: reply.truncated,
      warnings: reply.warnings,
      retryable: reply.status === "partial",
      needsReconnect: false,
    };
  } catch (err) {
    const e = err as { status?: number; code?: string; message?: string };
    const code = typeof e?.code === "string" ? e.code : "sync_failed";
    const status = typeof e?.status === "number" ? e.status : 500;
    const needsReconnect = code === "needs_reconnect" || status === 401;
    const retryable = !needsReconnect && code !== "account_not_authorized";
    return {
      accountKey: account.profile.account_key,
      displayName: account.profile.display_name,
      platform,
      connectionId,
      externalAccountId: account.profile.external_account_id,
      status: "failed",
      importedCount: 0,
      truncated: false,
      warnings: [],
      code,
      message: err instanceof Error ? err.message : "Could not import campaigns for this account.",
      retryable,
      needsReconnect,
    };
  }
}

export async function confirmAndImportAccounts(input: {
  scope: DisplayScope;
  call?: BridgeCaller;
  picks: readonly AccountPickSelection[];
  existingAccounts: readonly StoredRecord<AdAccountProfile>[];
  existingCampaigns: readonly StoredRecord<AdCampaignProfile>[];
  onProgress?: (info: { index: number; total: number; pick: AccountPickSelection }) => void;
}): Promise<ConfirmImportResult> {
  const call: BridgeCaller =
    input.call ?? ((verb, args, quiet = false) => serviceCall(input.scope, verb, args, quiet));
  const savedAccounts: Array<{
    pick: AccountPickSelection;
    account: StoredRecord<AdAccountProfile>;
  }> = [];
  const mutableAccounts = [...input.existingAccounts];
  const mutableCampaigns = [...input.existingCampaigns];

  // Phase 1: Persist/enable all selected ad_accounts BEFORE querying or writing ad_campaigns.
  for (const pick of input.picks) {
    const normExt = normalizeExternalAccountId(pick.platform, pick.externalAccountId).toLowerCase();
    const expectedKey = normalizeImportedAccountKey(pick.platform, pick.externalAccountId);
    const existingIdx = mutableAccounts.findIndex(
      (a) =>
        (a.profile.platform === pick.platform &&
          normalizeExternalAccountId(a.profile.platform, a.profile.external_account_id).toLowerCase() ===
            normExt) ||
        a.profile.account_key === expectedKey,
    );

    if (existingIdx >= 0) {
      let current = mutableAccounts[existingIdx]!;
      const needsUpdate =
        current.profile.status !== "active" ||
        (pick.loginCustomerId && current.profile.login_customer_id !== pick.loginCustomerId);
      if (needsUpdate) {
        const updatedProfile: AdAccountProfile = {
          ...current.profile,
          status: "active",
          login_customer_id: pick.loginCustomerId ?? current.profile.login_customer_id,
        };
        const res = (await call(
          "records.update",
          {
            table: "ad_accounts",
            record_id: current.id,
            expected_revision: current.revision,
            profile: updatedProfile,
          },
          true,
        )) as { record?: StoredRecord<AdAccountProfile> } | null;
        current = res?.record ?? { ...current, revision: current.revision + 1, profile: updatedProfile };
        mutableAccounts[existingIdx] = current;
      }
      savedAccounts.push({ pick, account: current });
      continue;
    }

    const validated = validateAccountInput({
      platform: pick.platform,
      external_account_id: normalizeExternalAccountId(pick.platform, pick.externalAccountId),
      login_customer_id: pick.loginCustomerId,
      display_name: pick.displayName,
      currency: pick.currency || "HKD",
      timezone: pick.timezone || "Asia/Hong_Kong",
      daily_guardrail_minor: 150000,
    });
    if (!validated.ok) {
      throw new Error(validated.error);
    }
    const profile: AdAccountProfile = {
      ...validated.value,
      account_key: expectedKey,
    };
    const recordId = `acct-${profile.account_key}`;
    const res = (await call(
      "records.create",
      {
        table: "ad_accounts",
        record_id: recordId,
        profile,
      },
      true,
    )) as { record?: StoredRecord<AdAccountProfile> } | null;
    const created: StoredRecord<AdAccountProfile> = res?.record ?? {
      id: recordId,
      revision: 1,
      profile,
    };
    mutableAccounts.push(created);
    savedAccounts.push({ pick, account: created });
  }

  // Phase 2: Sequentially import campaigns + 7-day metrics for each confirmed account.
  const outcomes: AccountSyncOutcome[] = [];
  let importedCampaignCount = 0;
  for (let i = 0; i < savedAccounts.length; i += 1) {
    const entry = savedAccounts[i]!;
    input.onProgress?.({ index: i + 1, total: savedAccounts.length, pick: entry.pick });
    const outcome = await syncSingleAccountCampaigns({
      scope: input.scope,
      call,
      account: entry.account,
      connectionId: entry.pick.connectionId,
      existingCampaigns: mutableCampaigns,
    });
    importedCampaignCount += outcome.importedCount;
    outcomes.push(outcome);
  }

  // Phase 3: Append one audit summary event.
  const suffix = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
  const event: AuditEventProfile = {
    event_key: `evt_${suffix}`,
    kind: "sync",
    summary: `Tracked ${savedAccounts.length} account(s); imported ${importedCampaignCount} campaign(s) (Campaigns only — individual ads not imported)`,
    summary_zh: `已追蹤 ${savedAccounts.length} 個帳號並匯入 ${importedCampaignCount} 個廣告活動（僅含廣告活動層級，尚未匯入個別廣告）`,
    occurred_at: new Date().toISOString().slice(0, 16).replace("T", " "),
  };
  await call(
    "records.create",
    {
      table: "audit_events",
      record_id: `evt-${suffix}`,
      profile: event,
    },
    true,
  );
  notifyWritten();

  return {
    importedCampaignCount,
    adsStatus: "not_imported",
    savedAccountKeys: savedAccounts.map((s) => s.account.profile.account_key),
    outcomes,
  };
}
