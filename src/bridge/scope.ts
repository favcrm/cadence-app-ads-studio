import { ApiError } from "@cadence/screen-ui";
import type { ScreenScopeSnapshot } from "@cadence/app-kit";
import { useSyncExternalStore } from "react";
import { admitted, channel, CONNECTION_LOST_TEXT, type AdsBridge, type AdsView } from "./channel";
import type { Section } from "./services";

export interface DisplayScope {
  installId: string;
  digest: string;
}

export interface Route {
  section: Section;
  view: AdsView;
  record_id: string | null;
  segment_id: string | null;
  params: Readonly<Record<string, string>>;
}

export interface ScopeSnapshot {
  presentationLocale: "en" | "zh-TW";
  scope: DisplayScope;
  actions: string[];
  route: Route;
}

type Pushed = ScreenScopeSnapshot<Section, AdsView>;

const listeners = new Set<() => void>();
const retireListeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());

let active: AdsBridge | null = null;
let unsubscribe: (() => void) | null = null;
let retired = false;
let pushed: Pushed | null = null;
let snapshot: ScopeSnapshot | null = null;

export function bindBridgeScope(bridge: AdsBridge): void {
  if (active === bridge) return;
  unsubscribe?.();
  active = bridge;
  retired = bridge.getState().status === "error";
  unsubscribe = bridge.subscribe(() => {
    const failed = bridge.getState().status === "error";
    if (failed && !retired) retireListeners.forEach((f) => f());
    retired = failed;
    notify();
  });
  notify();
}

const current = (): AdsBridge => {
  if (active === null) bindBridgeScope(channel.bridge);
  return active!;
};

function project(next: Pushed | null): ScopeSnapshot | null {
  if (next === pushed) return snapshot;
  pushed = next;
  snapshot =
    next === null
      ? null
      : {
          presentationLocale: next.presentationLocale,
          scope: { installId: next.scope.installId, digest: next.digest },
          actions: [...next.actions],
          route: next.route
            ? { ...next.route, params: next.route.params ?? {} }
            : { section: "overview", view: "list", record_id: null, segment_id: null, params: {} },
        };
  return snapshot;
}

export const subscribeScope = (f: () => void) => {
  current();
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
};

export const getScope = (): ScopeSnapshot | null => project(current().getSnapshot());
export const getCanvasReadOnly = (): boolean => current().getState().surface.readOnly === true;
export function useCanvasReadOnly(): boolean {
  return useSyncExternalStore(subscribeScope, getCanvasReadOnly);
}
export function useScope(): ScopeSnapshot | null {
  return useSyncExternalStore(subscribeScope, getScope);
}
export function scopeError(): string | null {
  return current().getState().status === "error" ? CONNECTION_LOST_TEXT : null;
}
export function onScopeRetired(f: () => void) {
  retireListeners.add(f);
  return () => {
    retireListeners.delete(f);
  };
}

export function assertCurrentScope(scope: DisplayScope): void {
  const s = getScope();
  if (!s || scope.installId !== s.scope.installId || scope.digest !== s.scope.digest) {
    throw new ApiError(CONNECTION_LOST_TEXT, 403, { code: "connection_lost" });
  }
}

export function requireOperation(verb: string): void {
  const s = getScope();
  if (!s || !admitted(verb, s.actions)) {
    throw new ApiError("This workspace doesn't offer that action.", 403);
  }
}
