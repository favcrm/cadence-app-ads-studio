import { ApiError } from "@cadence/screen-ui";
import { assertCurrentScope, requireOperation, type DisplayScope } from "./scope";
import { channel } from "./channel";

type Bag = Record<string, unknown>;

export const SECTIONS = ["overview", "campaigns", "creatives", "accounts"] as const;
export type Section = (typeof SECTIONS)[number];

export type FilterValue = string | number | boolean;

export interface RecordFilter {
  field: string;
  op: "eq" | "contains" | "prefix" | "gte" | "lte" | "in";
  value: FilterValue | FilterValue[];
}

export interface RecordOrder {
  field: string;
  direction?: "asc" | "desc";
}

export interface BatchItemArgs {
  table: string;
  record_id: string;
  profile: unknown;
}

export interface CallArgs {
  "records.list": {
    table?: string;
    query?: string;
    limit?: number;
    cursor?: string;
    filters?: RecordFilter[];
    order_by?: RecordOrder;
  };
  "records.show": {
    table?: string;
    record_id: string;
  };
  "records.create": {
    table?: string;
    record_id: string;
    profile: unknown;
  };
  "records.update": {
    table?: string;
    record_id: string;
    expected_revision: number;
    profile: unknown;
  };
  "records.batch": {
    items: BatchItemArgs[];
  };
  "connections.assets": {
    toolkit: "metaads" | "googleads";
  };
  "connections.connect": {
    toolkit: "metaads" | "googleads";
    section?: string;
  };
  "connections.ads.campaigns": {
    toolkit: "metaads" | "googleads";
    connection_id: string;
    account_id: string;
    login_customer_id?: string;
  };
  "screen.route.patch": {
    section?: Section;
    view?: "list" | "new";
    record_id?: string | null;
    segment_id?: string | null;
    params?: Readonly<Record<string, string>>;
    replace?: boolean;
  };
}

export const CALL_FIELDS: Record<keyof CallArgs, readonly string[]> = {
  "records.list": ["table", "query", "limit", "cursor", "filters", "order_by"],
  "records.show": ["table", "record_id"],
  "records.create": ["table", "record_id", "profile"],
  "records.update": ["table", "record_id", "expected_revision", "profile"],
  "records.batch": ["items"],
  "connections.assets": ["toolkit"],
  "connections.connect": ["toolkit", "section"],
  "connections.ads.campaigns": ["toolkit", "connection_id", "account_id", "login_customer_id"],
  "screen.route.patch": ["section", "view", "record_id", "segment_id", "params", "replace"],
};

export const OPERATIONS = Object.keys(CALL_FIELDS);
export const WRITES: readonly string[] = ["records.create", "records.update", "records.batch"];
export const isWrite = (verb: string): boolean => WRITES.includes(verb);

export const WRITE_REQUEST_BUDGET = 49152;
export const REQUEST_BUDGET = 16384;
export const requestBudget = (verb: string): number =>
  isWrite(verb) ? WRITE_REQUEST_BUDGET : REQUEST_BUDGET;

export function cleanArgs(verb: string, args: Bag): Bag {
  const fields = CALL_FIELDS[verb as keyof CallArgs] as readonly string[] | undefined;
  if (!fields || !args || typeof args !== "object" || Array.isArray(args)) {
    throw new ApiError("Unlisted Ads Studio operation", 400);
  }
  for (const key of Object.keys(args)) {
    if (!fields.includes(key)) {
      throw new ApiError(`Refused Ads Studio field: ${key}`, 400);
    }
  }
  const value = Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined));
  if (new TextEncoder().encode(JSON.stringify(value)).length > requestBudget(verb)) {
    throw new ApiError("Ads Studio request exceeds its operation budget", 413);
  }
  return value;
}

export const onWrite = (f: () => void): (() => void) => channel.onWrite(f);
export const notifyWritten = (): void => {
  channel.notifyWritten();
};

export type HostCall = <Verb extends keyof CallArgs>(
  verb: Verb,
  args: CallArgs[Verb],
) => Promise<unknown>;

export async function serviceCall<Verb extends keyof CallArgs>(
  scope: DisplayScope,
  verb: Verb,
  args: CallArgs[Verb],
  quiet = false,
): Promise<unknown> {
  assertCurrentScope(scope);
  requireOperation(verb);
  const cleaned = cleanArgs(verb, args as Bag);
  try {
    return await channel.call(scope, verb, cleaned, { quiet });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const e = err as { status?: number; code?: string };
    const status = typeof e?.status === "number" ? e.status : 500;
    const code = typeof e?.code === "string" ? e.code : "failed";
    const msg = err instanceof Error ? err.message : "Host request failed.";
    throw new ApiError(msg, status, { code });
  }
}

export function clientFor(scope: DisplayScope): HostCall {
  return (verb, args) => serviceCall(scope, verb, args);
}
