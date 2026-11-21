import { ApiError } from "@cadence/screen-ui";
import {
  createScreenBridge,
  type ScreenBridge,
  type ScreenBridgeRuntimeOverrides,
  type ScreenLeaveHandle,
} from "@cadence/app-kit";
import { bindBridgeScope, type DisplayScope } from "./scope";
import { CALL_FIELDS, OPERATIONS, SECTIONS, WRITES, requestBudget, type Section } from "./services";

export const CONNECTION_LOST_TEXT =
  "The connection to the workspace was lost. Reload the page to continue.";

const lost = (status = 502) =>
  new ApiError(CONNECTION_LOST_TEXT, status, { code: "connection_lost" });

export type AdsView = "list" | "new";
export type AdsBridge = ScreenBridge<Section, AdsView, ApiError>;

function createAdsBridge(): AdsBridge {
  return createScreenBridge<Section, AdsView, ApiError>({
    tag: "ads-studio",
    appName: "ads-studio",
    records: true,
    locale: true,
    surfaces: true,
    canvas: true,
    routeParams: true,
    calls: CALL_FIELDS,
    argBytes: Object.fromEntries(OPERATIONS.map((verb) => [verb, requestBudget(verb)])),
    writeVerbs: WRITES,
    route: { sections: SECTIONS, defaultSection: "overview", views: ["list", "new"] },
    observations: ["records.list", "records.show"],
    maxInFlight: 8,
    timeoutMs: 65000,
    createError: (message, status, options) => {
      if (status === 502 || status === 504 || options?.code === "gone") {
        return lost(status === 504 ? 504 : 502);
      }
      if (status === 429) {
        return new ApiError("Ads Studio is busy; wait for the current request", 429);
      }
      return new ApiError(message, status, options);
    },
  });
}

class Channel {
  private instance: AdsBridge | null = null;

  get bridge(): AdsBridge {
    this.instance ??= createAdsBridge();
    return this.instance;
  }

  start(runtime: ScreenBridgeRuntimeOverrides = {}): void {
    bindBridgeScope(this.bridge);
    this.bridge.start(runtime);
    if (this.bridge.getState().status === "error") throw lost();
  }

  call<T = unknown>(
    scope: DisplayScope,
    verb: string,
    args: Record<string, unknown>,
    options: { quiet?: boolean } = {},
  ): Promise<T> {
    if (this.bridge.getState().status === "error" || !this.bridge.getSnapshot()) {
      return Promise.reject(lost());
    }
    return this.bridge.call<T>(scope, verb, args, options);
  }

  ownLeaveState(): ScreenLeaveHandle | null {
    return this.bridge.ownLeaveState();
  }

  onWrite(listener: () => void): () => void {
    return this.bridge.onWrite(listener);
  }

  notifyWritten(): void {
    this.bridge.notifyWritten();
  }

  retire(): void {
    this.bridge.retire(lost());
  }

  resetForTests(): void {
    this.bridge.reset();
  }
}

export const channel = new Channel();

export function admitted(verb: string, actions: readonly string[]): boolean {
  if (verb === "screen.route.patch") return true;
  return OPERATIONS.includes(verb) && actions.includes(verb);
}

export function resetChannelForTest(): void {
  channel.resetForTests();
}
