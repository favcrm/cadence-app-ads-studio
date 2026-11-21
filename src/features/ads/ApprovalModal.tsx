import { ConfirmDialog, Detail } from "@cadence/screen-ui";
import { useState } from "react";
import {
  isOverDailyGuardrail,
  type AdAccountProfile,
  type AdProposalProfile,
  type StoredRecord,
} from "../../domain/ads";
import { useLocale } from "./locale";
import { StatusPill } from "./StatusPill";

export function ApprovalModal({
  proposal,
  accounts,
  onConfirm,
  onCancel,
}: {
  proposal: StoredRecord<AdProposalProfile>;
  accounts: readonly StoredRecord<AdAccountProfile>[];
  onConfirm: (decision: "applied" | "rejected") => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useLocale();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const p = proposal.profile;
  const acct = accounts.find((a) => a.profile.account_key === p.account_key)?.profile;
  const guardMinor = acct?.daily_guardrail_minor ?? 250000;
  const over = isOverDailyGuardrail(p.new_budget_minor, guardMinor);

  const act = async (decision: "applied" | "rejected") => {
    setPending(true);
    setError(null);
    try {
      await onConfirm(decision);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply proposal.");
    } finally {
      setPending(false);
    }
  };

  return (
    <ConfirmDialog
      title={t("Approve live ad change?")}
      confirmLabel={t("Approve & Apply")}
      pending={pending}
      error={error}
      onConfirm={() => void act("applied")}
      onCancel={onCancel}
      body={
        <div style={{ display: "grid", gap: "12px" }}>
          <p style={{ margin: 0 }}>
            {t(
              "Modifies live advertising spend billed directly by Google/Meta when connected, and updates workspace budget state now.",
            )}
          </p>
          <Detail
            items={[
              { key: "camp", term: t("Campaign"), value: p.campaign_name },
              { key: "tool", term: t("Upstream Tool"), value: <span className="num">{p.tool_slug}</span> },
              {
                key: "diff",
                term: t("Before → After"),
                value: (
                  <span className="num">
                    {p.before_label} → <strong>{p.after_label}</strong>
                  </span>
                ),
              },
              {
                key: "guard",
                term: t("Guardrail Check"),
                value: (
                  <StatusPill tone={over ? "warn" : "ok"}>
                    {over ? t("Exceeds guardrail") : t("Within guardrail")}
                  </StatusPill>
                ),
              },
            ]}
          />
          <div>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={pending}
              onClick={() => void act("rejected")}
            >
              {t("Reject")}
            </button>
          </div>
        </div>
      }
    />
  );
}
