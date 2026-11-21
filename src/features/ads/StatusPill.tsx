import type { ReactNode } from "react";

export type Tone = "neutral" | "ok" | "warn" | "fail" | "info" | "accent";

export function StatusPill({
  tone = "neutral",
  className = "",
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={`ads-pill ${className}`.trim()} data-tone={tone}>
      {children}
    </span>
  );
}

export function statusTone(status: string): Tone {
  if (status === "ACTIVE" || status === "applied" || status === "active" || status === "approval") {
    return "ok";
  }
  if (
    status === "LIMITED" ||
    status === "pending" ||
    status === "alert" ||
    status === "over_hosted_cap"
  ) {
    return "warn";
  }
  if (status === "rejected" || status === "inactive") return "fail";
  if (status === "workspace_only") return "info";
  if (status === "synced_meta" || status === "synced_google") return "ok";
  return "neutral";
}
