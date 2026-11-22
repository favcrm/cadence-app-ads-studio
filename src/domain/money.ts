export const BASE_CURRENCY = "HKD";

const CURRENCY_PREFIX: Readonly<Record<string, string>> = {
  HKD: "HK$",
  USD: "US$",
  EUR: "€",
  GBP: "£",
};

function currencyPrefix(currency: string): string {
  const code = currency.trim().toUpperCase() || BASE_CURRENCY;
  return CURRENCY_PREFIX[code] ?? `${code} `;
}

/**
 * Format integer minor units (cents) as localized currency text, e.g. 1842050 -> "HK$18,420.50".
 */
export function fmtMoney(minor: number | null | undefined, currency = BASE_CURRENCY): string {
  if (minor === null || minor === undefined || !Number.isFinite(minor)) return "—";
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor) / 100;
  return `${sign}${currencyPrefix(currency)}${abs.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Format whole-unit compact currency figures for chart axes and guardrails, e.g. 450000 -> "HK$4.5k".
 */
export function fmtCompactMoney(minor: number, currency = BASE_CURRENCY): string {
  const major = Math.round(minor / 100);
  const prefix = currencyPrefix(currency);
  if (Math.abs(major) >= 1000) {
    const k = major / 1000;
    return `${prefix}${Number.isInteger(k) ? k : k.toFixed(1).replace(/\.0$/, "")}k`;
  }
  return `${prefix}${major}`;
}

export function parseMajorToMinor(input: string): number | null {
  const trimmed = input.trim().replaceAll(",", "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, frac = ""] = trimmed.split(".");
  const minor = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(minor) ? minor : null;
}
