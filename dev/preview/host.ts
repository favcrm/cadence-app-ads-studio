type SectionId = "overview" | "campaigns" | "proposals" | "creatives" | "accounts";

interface StoredRow {
  id: string;
  revision: number;
  profile: Record<string, unknown>;
}

const SECTIONS: { id: SectionId; en: string; zh: string }[] = [
  { id: "overview", en: "Overview", zh: "總覽" },
  { id: "campaigns", en: "Campaigns", zh: "廣告活動" },
  { id: "proposals", en: "Changes", zh: "變更提案" },
  { id: "creatives", en: "Creatives", zh: "廣告素材" },
  { id: "accounts", en: "Accounts", zh: "帳號與連線" },
];

const VIEW_PRESETS: Record<string, { section: SectionId; params: Record<string, string> }> = {
  default: { section: "overview", params: {} },
  campaign_audit: {
    section: "campaigns",
    params: { range: "7d", platform: "meta", status: "LIMITED" },
  },
  overview_range: {
    section: "overview",
    params: { range: "30d", platform: "google" },
  },
};

function randomNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const DIGEST = `sha256:${"a".repeat(64)}`;
const TABLES = new Map<string, StoredRow[]>([
  ["ad_accounts", []],
  ["ad_campaigns", []],
  ["ad_proposals", []],
  ["creative_assets", []],
  ["audit_events", []],
]);

let seq = 1;
const state = {
  nonce: randomNonce(),
  generation: 1,
  section: "overview" as SectionId,
  params: {} as Record<string, string>,
  canvas: false,
  theme: "dark" as "dark" | "light",
  locale: "en" as "en" | "zh-TW",
  port: null as MessagePort | null,
  ready: false,
};

const frame = document.getElementById("ads-frame") as HTMLIFrameElement;
const frameWrap = document.getElementById("pv-frame-wrap")!;
const tabsEl = document.getElementById("pv-tabs")!;
const statusEl = document.getElementById("pv-status")!;
const btnSurface = document.getElementById("btn-surface") as HTMLButtonElement;
const selView = document.getElementById("sel-view") as HTMLSelectElement;
const btnTheme = document.getElementById("btn-theme") as HTMLButtonElement;
const btnLocale = document.getElementById("btn-locale") as HTMLButtonElement;
const btnReset = document.getElementById("btn-reset") as HTMLButtonElement;

function tableRows(name?: unknown): StoredRow[] | null {
  const key = typeof name === "string" && name.length > 0 ? name : "ad_accounts";
  return TABLES.get(key) ?? null;
}

function rowCountSummary(): string {
  let total = 0;
  for (const list of TABLES.values()) total += list.length;
  return `${state.ready ? "ready" : "connecting"} · ${total} rows · ${state.canvas ? "canvas(ro)" : "primary"}`;
}

function renderChrome(): void {
  document.documentElement.setAttribute("data-theme", state.theme);
  frameWrap.classList.toggle("is-canvas", state.canvas);
  btnSurface.textContent = state.canvas ? "Surface: Chat Canvas" : "Surface: Full App";
  btnSurface.setAttribute("aria-pressed", String(state.canvas));
  btnTheme.textContent = state.theme === "light" ? "Theme: Light" : "Theme: Dark";
  btnTheme.setAttribute("aria-pressed", String(state.theme === "light"));
  btnLocale.textContent = state.locale === "zh-TW" ? "Locale: zh-TW" : "Locale: EN";
  btnLocale.setAttribute("aria-pressed", String(state.locale === "zh-TW"));
  statusEl.textContent = rowCountSummary();

  tabsEl.innerHTML = "";
  for (const sec of SECTIONS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pv-tab";
    btn.dataset.section = sec.id;
    btn.textContent = state.locale === "zh-TW" ? sec.zh : sec.en;
    btn.setAttribute("aria-selected", String(state.section === sec.id));
    btn.addEventListener("click", () => {
      state.section = sec.id;
      pushScreen();
      renderChrome();
    });
    tabsEl.appendChild(btn);
  }
}

function pushScreen(): void {
  if (!state.port) return;
  state.port.postMessage({
    v: 2,
    op: "screen",
    tag: "ads-studio",
    install_id: "install_ads_preview",
    context_id: "default",
    digest: DIGEST,
    installation: {
      install_id: "install_ads_preview",
      name: "ads-studio",
      title: "Ads Studio",
      version: "0.1.0",
      digest: DIGEST,
      summary: "Synthetic Ads Studio host preview.",
    },
    contexts: SECTIONS.map((s) => ({
      id: s.id,
      label: state.locale === "zh-TW" ? s.zh : s.en,
    })),
    actions: [
      "records.list",
      "records.show",
      "records.create",
      "records.update",
      "records.batch",
      "screen.route.patch",
    ],
    presentation_locale: state.locale,
    route: {
      section: state.section,
      view: "list",
      record_id: null,
      segment_id: null,
      params: { ...state.params },
    },
  });
}

function pushSurface(): void {
  if (!state.port) return;
  if (state.canvas) {
    state.port.postMessage({ v: 1, op: "surface", role: "canvas", modal: false, readOnly: true });
  } else {
    state.port.postMessage({ v: 1, op: "surface", role: "primary", modal: false });
  }
}

function okReply(id: string, data: unknown): void {
  state.port?.postMessage({ v: 2, op: "reply", id, ok: true, data });
}

function failReply(id: string, code: string, text: string): void {
  state.port?.postMessage({ v: 2, op: "reply", id, ok: false, refusal: { code, text } });
}

function handleCall(id: string, verb: string, args: Record<string, unknown>): void {
  if (verb === "screen.route.patch") {
    if (typeof args.section === "string" && SECTIONS.some((s) => s.id === args.section)) {
      state.section = args.section as SectionId;
    }
    if (args.params && typeof args.params === "object" && !Array.isArray(args.params)) {
      state.params = { ...(args.params as Record<string, string>) };
    }
    okReply(id, {});
    pushScreen();
    renderChrome();
    return;
  }

  if (verb === "records.list") {
    const rows = tableRows(args.table);
    if (!rows) return failReply(id, "not_found", "Unknown table");
    const limit = typeof args.limit === "number" ? args.limit : 100;
    const slice = rows.slice(0, limit).map((r) => ({
      id: r.id,
      revision: r.revision,
      profile: structuredClone(r.profile),
    }));
    okReply(id, { records: slice, total: rows.length, truncated: false, next_cursor: null });
    return;
  }

  if (verb === "records.show") {
    const rows = tableRows(args.table);
    const found = rows?.find((r) => r.id === args.record_id);
    if (!found) return failReply(id, "not_found", "Record not found");
    okReply(id, { record: structuredClone(found) });
    return;
  }

  if (verb === "records.create") {
    const rows = tableRows(args.table);
    if (!rows) return failReply(id, "invalid", "Unknown table");
    const recId = typeof args.record_id === "string" ? args.record_id : `rec_${seq++}`;
    if (rows.some((r) => r.id === recId)) {
      return failReply(id, "conflict", `Duplicate record_id: ${recId}`);
    }
    const created: StoredRow = {
      id: recId,
      revision: 1,
      profile: structuredClone(args.profile as Record<string, unknown>),
    };
    rows.push(created);
    okReply(id, { record: created });
    renderChrome();
    return;
  }

  if (verb === "records.update") {
    if (args.table === "audit_events") {
      return failReply(id, "conflict", "audit_events is append_only");
    }
    const rows = tableRows(args.table);
    const found = rows?.find((r) => r.id === args.record_id);
    if (!found) return failReply(id, "not_found", "Record not found");
    if (args.expected_revision !== found.revision) {
      return failReply(id, "stale_revision", "Expected revision does not match current row");
    }
    found.revision += 1;
    found.profile = structuredClone(args.profile as Record<string, unknown>);
    okReply(id, { record: structuredClone(found) });
    renderChrome();
    return;
  }

  if (verb === "records.batch") {
    const items = Array.isArray(args.items) ? args.items : [];
    const created: StoredRow[] = [];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const entry = item as Record<string, unknown>;
      const rows = tableRows(entry.table);
      if (!rows) return failReply(id, "invalid", `Unknown table: ${String(entry.table)}`);
      const recId = typeof entry.record_id === "string" ? entry.record_id : `rec_${seq++}`;
      const row: StoredRow = {
        id: recId,
        revision: 1,
        profile: structuredClone(entry.profile as Record<string, unknown>),
      };
      rows.push(row);
      created.push(row);
    }
    okReply(id, { created_count: created.length });
    renderChrome();
    return;
  }

  failReply(id, "forbidden", `Operation ${verb} is unavailable`);
}

window.addEventListener("message", (ev) => {
  if (ev.origin !== window.location.origin || ev.source !== frame.contentWindow) return;
  const msg = ev.data;
  if (
    !msg ||
    typeof msg !== "object" ||
    msg.v !== 1 ||
    msg.op !== "init" ||
    msg.tag !== "ads-studio" ||
    msg.bridge_nonce !== state.nonce ||
    msg.generation !== state.generation
  ) {
    return;
  }
  const port = ev.ports[0];
  if (!port) return;
  state.port?.close();
  state.port = port;
  state.ready = false;

  port.onmessage = (portEv) => {
    const packet = portEv.data;
    if (!packet || typeof packet !== "object") return;
    if (packet.op === "ready") {
      state.ready = true;
      pushScreen();
      pushSurface();
      renderChrome();
      return;
    }
    if (packet.v === 2 && packet.op === "call" && typeof packet.id === "string") {
      handleCall(packet.id, String(packet.verb ?? ""), (packet.args ?? {}) as Record<string, unknown>);
    }
  };
  port.start();
});

function mountFrame(): void {
  state.nonce = randomNonce();
  state.generation += 1;
  state.ready = false;
  const qs = new URLSearchParams({
    nonce: state.nonce,
    gen: String(state.generation),
    origin: window.location.origin,
    theme: state.theme,
  });
  frame.src = `/dev/preview/frame.html?${qs.toString()}`;
  renderChrome();
}

btnSurface.addEventListener("click", () => {
  state.canvas = !state.canvas;
  pushSurface();
  renderChrome();
});

selView.addEventListener("change", () => {
  const preset = VIEW_PRESETS[selView.value] ?? VIEW_PRESETS.default;
  state.section = preset.section;
  state.params = { ...preset.params };
  pushScreen();
  renderChrome();
});

btnTheme.addEventListener("click", () => {
  state.theme = state.theme === "dark" ? "light" : "dark";
  frame.contentWindow?.postMessage(
    { type: "preview-theme", theme: state.theme },
    window.location.origin,
  );
  renderChrome();
});

btnLocale.addEventListener("click", () => {
  state.locale = state.locale === "en" ? "zh-TW" : "en";
  pushScreen();
  renderChrome();
});

btnReset.addEventListener("click", () => {
  for (const rows of TABLES.values()) rows.length = 0;
  state.section = "overview";
  state.params = {};
  selView.value = "default";
  mountFrame();
});

renderChrome();
mountFrame();
