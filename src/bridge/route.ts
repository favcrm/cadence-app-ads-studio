import { ApiError } from "@cadence/screen-ui";
import { withoutLeaveWarning } from "./leave";
import { getScope } from "./scope";
import { serviceCall, type CallArgs } from "./services";

export function patchRoute(patch: CallArgs["screen.route.patch"]): Promise<unknown> {
  const s = getScope();
  if (!s) return Promise.reject(new ApiError("Ads Studio route is unavailable", 403));
  return withoutLeaveWarning(() => serviceCall(s.scope, "screen.route.patch", patch));
}
