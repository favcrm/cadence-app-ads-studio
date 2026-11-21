import "@cadence/screen-ui/styles.css";
import { createRoot } from "react-dom/client";
import { channel } from "./bridge/channel";
import { installSandboxFormActions } from "./bridge/sandboxForms";
import AdsStudioScreen from "./features/ads/AdsStudioScreen";

const outlet =
  document.getElementById("root") ??
  document.body.appendChild(Object.assign(document.createElement("div"), { id: "root" }));

const root = createRoot(outlet);

try {
  installSandboxFormActions(document);
  channel.start();
} catch {
  channel.retire();
}

root.render(<AdsStudioScreen />);
