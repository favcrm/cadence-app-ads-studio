import { Button, EmptyState } from "@cadence/screen-ui";
import { useState } from "react";
import {
  isOverDailyGuardrail,
  type AdAccountProfile,
  type AdProposalProfile,
  type StoredRecord,
} from "../../domain/ads";
import { fmtCompactMoney } from "../../domain/money";
import { useLocale } from "./locale";
import { StatusPill, statusTone } from "./StatusPill";

export function ProposalsTab({
  proposals,
  accounts,
  canWrite,
  onReviewProposal,
}: {
  proposals: readonly StoredRecord<AdProposalProfile>[];
  accounts: readonly StoredRecord<AdAccountProfile>[];
  canWrite: boolean;
  onReviewProposal: (proposal: StoredRecord<AdProposalProfile>) => void;
}) {
  const { t } = useLocale();
  const [filter, setFilter] = useState<"all" | "pending" | "history">("all");

  const pendingCount = proposals.filter((p) => p.profile.status === "pending").length;
  const rows = proposals.filter((p) => {
    if (filter === "pending") return p.profile.status === "pending";
    if (filter === "history") return p.profile.status !== "pending";
    return true;
  });

  const statusText = (s: AdProposalProfile["status"]) =>
    s === "pending"
      ? t("Pending owner approval")
      : s === "applied"
        ? t("Applied")
        : t("Rejected");

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <div className="ads-banner" data-tone="info">
        <div className="ads-banner-body">
          <strong>{t("All live ad spend changes require explicit owner approval")}</strong>
          <p>
            {t(
              "Ad spend mutations stage here first and apply only once an owner confirms the exact diff.",
            )}
          </p>
        </div>
        <StatusPill tone="info">once-only gate</StatusPill>
      </div>

      <div className="ads-chips" role="group" aria-label={t("Changes")}>
        <button
          type="button"
          className="ads-chip"
          aria-pressed={filter === "all"}
          onClick={() => setFilter("all")}
        >
          {t("All")} ({proposals.length})
        </button>
        <button
          type="button"
          className="ads-chip"
          aria-pressed={filter === "pending"}
          onClick={() => setFilter("pending")}
        >
          {t("Pending")} ({pendingCount})
        </button>
        <button
          type="button"
          className="ads-chip"
          aria-pressed={filter === "history"}
          onClick={() => setFilter("history")}
        >
          {t("History")} ({proposals.length - pendingCount})
        </button>
      </div>

      {rows.length === 0 ? (
        <EmptyState name="proposals" title={t("No proposals in this view")}>
          {t("Switch back to All to inspect pending or resolved ad changes.")}
        </EmptyState>
      ) : (
        <div style={{ display: "grid", gap: "14px" }}>
          {rows.map((rec) => {
            const p = rec.profile;
            const acct = accounts.find((a) => a.profile.account_key === p.account_key)?.profile;
            const guardMinor = acct?.daily_guardrail_minor ?? 250000;
            const overGuard = isOverDailyGuardrail(p.new_budget_minor, guardMinor);
            return (
              <article key={rec.id} className="ads-card">
                <div className="ads-row-between">
                  <div>
                    <div style={{ fontWeight: 600, color: "var(--color-ink-100)" }}>
                      {p.campaign_name}
                    </div>
                    <div className="text-micro text-ink-500 num">
                      {p.platform === "meta" ? t("Meta Ads") : t("Google Ads")} · {p.tool_slug} ·{" "}
                      {p.proposed_by}
                    </div>
                  </div>
                  <StatusPill tone={statusTone(p.status)}>{statusText(p.status)}</StatusPill>
                </div>

                <div className="ads-diff-strip num">
                  <span style={{ display: "inline-flex", gap: "8px", flexWrap: "wrap" }}>
                    <span className="text-ink-400" style={{ textDecoration: "line-through" }}>
                      {p.before_label}
                    </span>
                    <span aria-hidden="true">→</span>
                    <strong style={{ color: "var(--color-ink-100)" }}>{p.after_label}</strong>
                  </span>
                  <StatusPill tone={overGuard ? "warn" : "ok"}>
                    {overGuard ? t("Exceeds guardrail") : t("Within guardrail")} (
                    {fmtCompactMoney(guardMinor)})
                  </StatusPill>
                </div>

                <div className="text-secondary text-ink-300">{p.rationale}</div>

                <div className="ads-row-between">
                  <span className="text-micro text-ink-500 num">
                    action_id: {p.action_id_hex.slice(0, 12)}…
                  </span>
                  {canWrite && p.status === "pending" && (
                    <Button variant="primary" onClick={() => onReviewProposal(rec)}>
                      {t("Review approval card")}
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
