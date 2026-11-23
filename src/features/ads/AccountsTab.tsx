import { Button, Detail } from "@cadence/screen-ui";
import { useState } from "react";
import type { AdAccountProfile, StoredRecord } from "../../domain/ads";
import { useLocale } from "./locale";
import { StatusPill, statusTone } from "./StatusPill";

export function AccountsTab({
  accounts,
  canWrite,
  onSaveGuardrail,
  onAddAccount,
}: {
  accounts: readonly StoredRecord<AdAccountProfile>[];
  canWrite: boolean;
  onSaveGuardrail: (account: StoredRecord<AdAccountProfile>, dailyMinor: number) => Promise<void>;
  onAddAccount: () => void;
}) {
  const { t } = useLocale();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  return (
    <div style={{ display: "grid", gap: "18px" }}>
      <div className="ads-row-between">
        <div className="ads-title-stack">
          <h3 className="text-cardtitle">{t("Composio connections & pinned ad accounts")}</h3>
          <span className="text-micro text-ink-500">
            {t(
              "Host credentials and pinned Meta / Google Ads accounts live in Settings → Connections; daily guardrails store in app-storage/v1.",
            )}
          </span>
        </div>
        {canWrite && (
          <Button size="sm" variant="primary" onClick={onAddAccount}>
            + {t("Add ad account")}
          </Button>
        )}
      </div>

      {accounts.length === 0 ? (
        <article className="ads-card">
          <div className="text-secondary text-ink-300">
            {t("No ad accounts pinned in this workspace yet. Pin a Meta Ads ad account or Google Ads customer ID in Settings → Connections, then add it or sync in chat.")}
          </div>
        </article>
      ) : (
        accounts.map((rec) => {
          const a = rec.profile;
          const currMajor = Math.round(a.daily_guardrail_minor / 100);
          const valueStr = drafts[rec.id] ?? String(currMajor);
          return (
            <article key={rec.id} className="ads-card">
              <div className="ads-row-between">
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <span className={`ads-dot ads-dot-${a.platform}`} />
                    <strong style={{ color: "var(--color-ink-100)" }}>
                      {a.platform === "meta" ? t("Meta Ads") : t("Google Ads")} · {a.display_name}
                    </strong>
                    <StatusPill tone={statusTone(a.status)}>{t("Active")}</StatusPill>
                  </div>
                  <div className="text-micro text-ink-500 num">
                    {a.external_account_id}
                    {a.login_customer_id ? ` · MCC ${a.login_customer_id}` : ""} · {a.currency} ·{" "}
                    {a.timezone}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {a.scopes_text.split(",").map((scope) => (
                  <span key={scope.trim()} className="ads-scope-tag">
                    {scope.trim()}
                  </span>
                ))}
              </div>

              <div className="ads-row-between" style={{ borderTop: "1px solid var(--color-ink-700)", paddingTop: "12px" }}>
                <label htmlFor={`guard-${rec.id}`} className="text-label">
                  {t("Daily budget guardrail")} ({a.currency})
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input
                    id={`guard-${rec.id}`}
                    type="number"
                    min={100}
                    step={100}
                    disabled={!canWrite || savingId === rec.id}
                    className="field num"
                    style={{ width: "120px", height: "28px" }}
                    value={valueStr}
                    onChange={(e) => setDrafts((d) => ({ ...d, [rec.id]: e.target.value }))}
                  />
                  {canWrite && (
                    <Button
                      size="sm"
                      loading={savingId === rec.id}
                      onClick={async () => {
                        const major = Math.max(100, Math.round(Number(valueStr) || currMajor));
                        setSavingId(rec.id);
                        try {
                          await onSaveGuardrail(rec, major * 100);
                        } finally {
                          setSavingId(null);
                        }
                      }}
                    >
                      {t("Save guardrail")}
                    </Button>
                  )}
                </div>
              </div>
            </article>
          );
        })
      )}

      <article className="ads-card">
        <div className="ads-title-stack">
          <h3 className="text-cardtitle">{t("Workspace Media Storage (Images & Videos)")}</h3>
          <span className="text-micro text-ink-500">
            {t(
              "Workspace Files (Wiki R2 blobs) stores binaries across apps; Ads Studio keeps scalar metadata pointers only.",
            )}
          </span>
        </div>
        <Detail
          items={[
            {
              key: "folder",
              term: t("Workspace Path"),
              value: <span className="num">global/ads-studio/assets/ (wiki/&lt;ws&gt;/blobs/&lt;sha256&gt;)</span>,
            },
            {
              key: "caps",
              term: t("Size & Upload Cap"),
              value: <span className="num">15 MiB hosted (WIKI_UPLOAD_MAX) · 100 MB native (MAX_UPLOAD_BYTES)</span>,
            },
            {
              key: "storage",
              term: "app-storage/v1",
              value: "Scalar metadata + wiki_path + sha256 pointers in creative_assets (zero binary blobs)",
            },
          ]}
        />
      </article>

      <details className="ads-card">
        <summary
          className="text-secondary"
          style={{ cursor: "pointer", fontWeight: 600, color: "var(--color-ink-100)" }}
        >
          {t("Platform contract & @cadence/app-kit@0.8.0 (6/6 ready caps)")}
        </summary>
        <div style={{ display: "grid", gap: "10px", marginTop: "10px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {[
              "screen.v2",
              "screen-records.v1",
              "screen-surfaces.v1",
              "screen-canvas.v1",
              "screen-route-params.v1",
              "screen-locale.v1",
            ].map((cap) => (
              <span key={cap} className="ads-scope-tag">
                {cap}
              </span>
            ))}
          </div>
          <div className="text-micro text-ink-400 num">
            Declared views in screens.json: campaign_audit (section=campaigns, params: range,
            platform, status) · overview_range (section=overview, params: range, platform)
          </div>
        </div>
      </details>
    </div>
  );
}
