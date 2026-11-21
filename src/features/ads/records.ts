import type { DisplayScope } from "../../bridge/scope";
import { clientFor, notifyWritten, serviceCall } from "../../bridge/services";
import {
  STARTER_SEED,
  type AdAccountProfile,
  type AdCampaignProfile,
  type AdProposalProfile,
  type AuditEventProfile,
  type CreativeAssetProfile,
  type ProposalActionType,
  type StoredRecord,
} from "../../domain/ads";
import { fmtMoney } from "../../domain/money";

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

export async function registerAssetPointer(
  scope: DisplayScope,
  asset: CreativeAssetProfile,
): Promise<void> {
  await serviceCall(scope, "records.create", {
    table: "creative_assets",
    record_id: `ast-${asset.asset_key}`,
    profile: asset,
  });
  notifyWritten();
}
