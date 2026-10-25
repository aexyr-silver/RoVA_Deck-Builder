/* RoVA Deck Builder — static, no build step. Data comes from data/cards.json. */
(() => {
  "use strict";

  const MAX_COPIES = 5;
  const STORE_KEY = "rova-deck-builder-v1";
  const TYPE_ORDER = ["Full", "Half", "Quarter", "Fragment"];
  const ARCANA_ORDER = ["Blaze", "Frost", "Seal", "Static", "Flow", "Hidden", "Refract", "Chaos"];
  const ROMAN = { 3: "III", 5: "V", 7: "VII", 13: "XIII" };

  const state = {
    mode: "summons",
    name: "",
    summons: {},   // id -> qty
    tokens: {},    // id -> qty
  };
  let DATA = null;
  const byId = {};

  const $ = (s) => document.querySelector(s);
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) n.setAttribute(k, v);
    }
    for (const k of kids) if (k != null) n.append(k);
    return n;
  };

  /* ---------- storage (per-viewer convenience only) ---------- */
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) { /* ignore */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s && typeof s === "object") {
        state.mode = s.mode === "tokens" ? "tokens" : "summons";
        state.name = typeof s.name === "string" ? s.name : "";
        state.summons = clean(s.summons, "card");
        state.tokens = clean(s.tokens, "token");
      }
    } catch (_) { /* ignore */ }
  }
  function clean(obj, kind) {
    const out = {};
    if (!obj || typeof obj !== "object") return out;
    for (const [id, q] of Object.entries(obj)) {
      const item = byId[id];
      const n = Math.floor(Number(q));
      if (item && item.kind === kind && n > 0) out[id] = Math.min(n, cap(item));
    }
    return out;
  }

  /* ---------- rules for copies ---------- */
  function cap(item) {
    if (item.kind === "token" && item.special === false) return Infinity; // normal tokens unlimited
    return MAX_COPIES;
  }
  const bucket = () => (state.mode === "summons" ? state.summons : state.tokens);

  function add(id, n = 1) {
    const item = byId[id]; if (!item) return;
    const b = item.kind === "card" ? state.summons : state.tokens;
    const cur = b[id] || 0;
    const next = Math.min(cur + n, cap(item));
    if (next === cur) { toast(`Max ${MAX_COPIES} copies of ${item.name}`); return; }
    b[id] = next; save(); render();
  }
  function remove(id, n = 1) {
    const item = byId[id]; if (!item) return;
    const b = item.kind === "card" ? state.summons : state.tokens;
    const next = (b[id] || 0) - n;
    if (next > 0) b[id] = next; else delete b[id];
    save(); render();
  }

  /* ---------- rendering ---------- */
  function render() {
    for (const t of document.querySelectorAll(".mode-switch button")) {
      t.setAttribute("aria-selected", String(t.dataset.mode === state.mode));
    }
    $("#chosen-title").textContent = state.mode === "summons" ? "Summons" : "Token stack";
    $("#pool-title").textContent = state.mode === "summons" ? "Available summons" : "Available tokens";
    $("#f-kind").hidden = state.mode !== "summons";
    $("#f-cost").hidden = state.mode !== "summons";
    $("#search").placeholder = state.mode === "summons" ? "Search name or text" : "Search tokens";
    renderChosen();
    renderPool();
  }

  function total(b) { return Object.values(b).reduce((a, n) => a + n, 0); }

  function renderChosen() {
    const b = bucket();
    const list = $("#chosen-list"); list.replaceChildren();
    const ids = Object.keys(b);
    $("#chosen-total").textContent = String(total(b));
    $("#chosen-empty").hidden = ids.length > 0;

    const stats = $("#chosen-stats"); stats.replaceChildren();
    if (state.mode === "summons") {
      const cards = ids.map((id) => [byId[id], b[id]]);
      const zero = cards.filter(([c]) => c.cost === 0).reduce((a, [, n]) => a + n, 0);
      stats.append(el("span", { text: `${zero} at cost 0` }));
      for (const t of TYPE_ORDER) {
        const n = cards.filter(([c]) => c.cardType === t).reduce((a, [, q]) => a + q, 0);
        if (n) stats.append(el("span", { text: `${n} ${t}` }));
      }
      for (const t of TYPE_ORDER) {
        const group = cards.filter(([c]) => c.cardType === t).sort(sortCards);
        if (!group.length) continue;
        list.append(el("div", { class: "group-title", text: `${t} (${group.reduce((a, [, n]) => a + n, 0)})` }));
        for (const [c, n] of group) list.append(row(c, n));
      }
    } else {
      const toks = ids.map((id) => [byId[id], b[id]]);
      const sp = toks.filter(([t]) => t.special).reduce((a, [, n]) => a + n, 0);
      stats.append(el("span", { text: `${sp} special` }));
      for (const v of [3, 5, 7, 13]) {
        const n = toks.filter(([t]) => t.value === v).reduce((a, [, q]) => a + q, 0);
        if (n) stats.append(el("span", { text: `${n} × value ${v}` }));
      }
      for (const [label, f] of [["Special tokens", (t) => t.special], ["Normal tokens", (t) => !t.special]]) {
        const group = toks.filter(([t]) => f(t)).sort((a, z) => a[0].value - z[0].value || a[0].name.localeCompare(z[0].name));
        if (!group.length) continue;
        list.append(el("div", { class: "group-title", text: `${label} (${group.reduce((a, [, n]) => a + n, 0)})` }));
        for (const [t, n] of group) list.append(row(t, n));
      }
    }
  }

  function sortCards(a, z) {
    return a[0].cost - z[0].cost || ARCANA_ORDER.indexOf(a[0].arcanaType) - ARCANA_ORDER.indexOf(z[0].arcanaType)
      || a[0].name.localeCompare(z[0].name);
  }

  function row(item, n) {
    const meta = item.kind === "card" ? `${item.cost}` : `V${item.value}`;
    const name = el("span", { class: "name", text: item.name });
    attachPreview(name, item);
    return el("div", { class: "row" },
      el("span", { class: "qty", text: `${n}×` }),
      el("span", { class: "dot", style: `background: var(--${(item.arcanaType || "hidden").toLowerCase()})` }),
      el("span", {}, name, el("span", { class: "meta", text: meta })),
      el("span", { class: "ctrls" },
        el("button", { "aria-label": `Remove one ${item.name}`, onclick: () => remove(item.id), text: "−" }),
        el("button", { "aria-label": `Add one ${item.name}`, onclick: () => add(item.id), text: "+",
          disabled: n >= cap(item) ? "" : false })));
  }

  function renderPool() {
    const q = $("#search").value.trim().toLowerCase();
    const fa = $("#f-arcana").value, fk = $("#f-kind").value, fc = $("#f-cost").value;
    const grid = $("#pool-grid"); grid.replaceChildren();
    const b = bucket();
    const items = state.mode === "summons" ? DATA.cards : DATA.tokens;
    for (const item of items) {
      if (fa && (item.arcanaType || "None") !== fa) continue;
      if (state.mode === "summons") {
        if (fk && item.cardType !== fk) continue;
        if (fc !== "" && String(item.cost) !== fc) continue;
      }
      if (q) {
        const hay = [item.name, item.effect, item.affinity, item.restriction, item.trigger, item.arcanaType, item.cardType]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) continue;
      }
      const n = b[item.id] || 0;
      const img = el("img", { src: item.image, alt: item.name, loading: "lazy" });
      const tile = el("button", {
        class: `tile${item.kind === "token" ? " token" : ""}${n >= cap(item) ? " maxed" : ""}`,
        title: `${item.name} — click to add, right-click to remove`,
        onclick: () => add(item.id),
        oncontextmenu: (e) => { e.preventDefault(); if (n) remove(item.id); },
      }, img,
        n ? el("span", { class: "badge", text: String(n) }) : null,
        el("span", { class: "cap", text: item.kind === "card" ? `${item.cardType} · ${item.arcanaType}`
          : (item.special ? `${item.arcanaType} · Value ${item.value}` : `Normal · Value ${item.value} · no limit`) }));
      attachPreview(tile, item);
      grid.append(tile);
    }
    if (!grid.children.length) grid.append(el("p", { class: "empty", text: "Nothing matches these filters." }));
  }

  /* ---------- hover preview (desktop only) ---------- */
  const preview = $("#preview"), pimg = $("#preview-img");
  const canHover = window.matchMedia("(hover: hover)").matches;
  function attachPreview(node, item) {
    if (!canHover) return;
    // special tokens preview their inscription card; everything else previews its own image
    const src = item.inscription || item.image;
    const wide = Boolean(item.inscription);
    node.addEventListener("mouseenter", () => {
      pimg.src = src; pimg.alt = wide ? `${item.name} inscription card` : item.name;
      preview.classList.toggle("wide", wide); preview.hidden = false;
    });
    node.addEventListener("mousemove", (e) => {
      const w = wide ? 430 : 310, h = wide ? 215 : 440;
      let x = e.clientX + 18, y = e.clientY - h / 2;
      if (x + w > innerWidth) x = e.clientX - w - 18;
      y = Math.max(8, Math.min(y, innerHeight - h - 8));
      preview.style.left = x + "px"; preview.style.top = y + "px";
    });
    node.addEventListener("mouseleave", () => { preview.hidden = true; });
  }

  /* ---------- clear (two-step, no browser dialog) ---------- */
  let armTimer = null;
  function onClear() {
    const btn = $("#btn-clear");
    if (!btn.classList.contains("armed")) {
      btn.classList.add("armed");
      btn.textContent = state.mode === "summons" ? "Clear all summons?" : "Clear all tokens?";
      clearTimeout(armTimer);
      armTimer = setTimeout(disarm, 3000);
      return;
    }
    if (state.mode === "summons") state.summons = {}; else state.tokens = {};
    disarm(); save(); render(); toast(state.mode === "summons" ? "Summons cleared" : "Tokens cleared");
  }
  function disarm() { const btn = $("#btn-clear"); btn.classList.remove("armed"); btn.textContent = "Clear"; }

  /* ---------- export / import ---------- */
  function listText() {
    const lines = [];
    const nm = state.name.trim() || "Untitled deck";
    lines.push(`RoVA decklist — ${nm}`);
    const cards = Object.entries(state.summons).map(([id, n]) => [byId[id], n]);
    lines.push("", `Summons (${total(state.summons)})`);
    for (const t of TYPE_ORDER) {
      const g = cards.filter(([c]) => c.cardType === t).sort(sortCards);
      if (!g.length) continue;
      lines.push(`# ${t}`);
      for (const [c, n] of g) lines.push(`${n} ${c.name}`);
    }
    lines.push("", `Tokens (${total(state.tokens)})`);
    const toks = Object.entries(state.tokens).map(([id, n]) => [byId[id], n])
      .sort((a, z) => (z[0].special - a[0].special) || a[0].value - z[0].value || a[0].name.localeCompare(z[0].name));
    for (const [t, n] of toks) lines.push(`${n} ${t.name}`);
    return lines.join("\n");
  }

  function importText(text) {
    const byName = {};
    for (const it of [...DATA.cards, ...DATA.tokens]) byName[it.name.toLowerCase()] = it;
    const s = {}, t = {}, unknown = [];
    let name = "";
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const head = line.match(/^RoVA decklist\s*[—-]\s*(.+)$/i);
      if (head) { name = head[1].trim(); continue; }
      const m = line.match(/^(\d+)\s*[x×]?\s+(.+)$/i);
      if (!m) continue;
      const it = byName[m[2].trim().toLowerCase()];
      if (!it) { unknown.push(m[2].trim()); continue; }
      const b = it.kind === "card" ? s : t;
      b[it.id] = Math.min((b[it.id] || 0) + Number(m[1]), cap(it));
    }
    state.summons = s; state.tokens = t;
    if (name && name !== "Untitled deck") { state.name = name; $("#deck-name").value = name; }
    save(); render();
    return unknown;
  }

  function printList() {
    const area = $("#print-list"); area.replaceChildren();
    area.append(el("h1", { text: `RoVA decklist — ${state.name.trim() || "Untitled deck"}` }),
      el("p", { text: `${total(state.summons)} summons · ${total(state.tokens)} tokens · tutorial set, not for release` }));
    const section = (title, rows) => {
      area.append(el("h2", { text: title }));
      const tb = el("table");
      for (const [n, label, extra] of rows) tb.append(el("tr", {}, el("td", { class: "q", text: String(n) }), el("td", { text: label }), el("td", { text: extra })));
      area.append(tb);
    };
    const cards = Object.entries(state.summons).map(([id, n]) => [byId[id], n]);
    for (const t of TYPE_ORDER) {
      const g = cards.filter(([c]) => c.cardType === t).sort(sortCards);
      if (g.length) section(`${t} (${g.reduce((a, [, n]) => a + n, 0)})`, g.map(([c, n]) => [n, c.name, `${c.arcanaType} · cost ${c.cost}`]));
    }
    const toks = Object.entries(state.tokens).map(([id, n]) => [byId[id], n]);
    if (toks.length) section(`Tokens (${total(state.tokens)})`, toks.map(([t, n]) => [n, t.name, t.special ? `${t.arcanaType} · value ${t.value}` : `value ${t.value}`]));
    doPrint("print-list");
  }

  function printProxies() {
    const area = $("#print-proxies"); area.replaceChildren();
    const imgs = [];
    for (const [id, n] of Object.entries(state.summons)) for (let i = 0; i < n; i++) imgs.push(["card", byId[id].image]);
    for (const [id, n] of Object.entries(state.tokens)) for (let i = 0; i < n; i++) imgs.push(["tok", byId[id].image]);
    for (const id of Object.keys(state.tokens)) if (byId[id].inscription) imgs.push(["ins", byId[id].inscription]);
    if (!imgs.length) { toast("The deck is empty"); return; }
    const sheet = el("div", { class: "proxy-sheet" });
    for (const [cls, src] of imgs) sheet.append(el("img", { class: cls, src, alt: "" }));
    area.append(sheet);
    const pending = [...sheet.querySelectorAll("img")].filter((i) => !i.complete);
    if (!pending.length) return doPrint("print-proxies");
    let left = pending.length;
    const done = () => { if (--left === 0) doPrint("print-proxies"); };
    for (const i of pending) { i.addEventListener("load", done); i.addEventListener("error", done); }
  }

  function doPrint(which) {
    document.body.classList.add(which);
    $("#export-dialog").close();
    setTimeout(() => {
      window.print();
      setTimeout(() => document.body.classList.remove(which), 300);
    }, 50);
  }

  /* ---------- misc ---------- */
  let toastTimer = null;
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
  }

  function fillFilters() {
    const fa = $("#f-arcana");
    for (const a of ARCANA_ORDER) fa.append(el("option", { value: a, text: a }));
    fa.append(el("option", { value: "None", text: "No type (normal tokens)" }));
    const fk = $("#f-kind");
    for (const t of TYPE_ORDER) fk.append(el("option", { value: t, text: t }));
    const fc = $("#f-cost");
    const costs = [...new Set(DATA.cards.map((c) => c.cost))].sort((a, b) => a - b);
    for (const c of costs) fc.append(el("option", { value: String(c), text: `Cost ${c}` }));
  }

  function wireTheme() {
    const btn = $("#btn-theme");
    const icons = { auto: "Auto", dark: "Dark", light: "Light" };
    const order = ["auto", "dark", "light"];
    let cur = "auto";
    try { const t = localStorage.getItem("rova-theme"); if (t === "dark" || t === "light") cur = t; } catch (_) {}
    const apply = () => {
      if (cur === "auto") delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = cur;
      btn.textContent = icons[cur];
      btn.title = btn.ariaLabel = `Theme: ${cur}`;
      try { if (cur === "auto") localStorage.removeItem("rova-theme"); else localStorage.setItem("rova-theme", cur); } catch (_) {}
    };
    btn.addEventListener("click", () => { cur = order[(order.indexOf(cur) + 1) % order.length]; apply(); });
    apply();
  }

  function wire() {
    wireTheme();
    for (const t of document.querySelectorAll(".mode-switch button")) {
      t.addEventListener("click", () => { state.mode = t.dataset.mode; disarm(); save(); render(); });
    }
    for (const id of ["#search", "#f-arcana", "#f-kind", "#f-cost"]) $(id).addEventListener("input", renderPool);
    $("#btn-clear").addEventListener("click", onClear);
    $("#deck-name").value = state.name;
    $("#deck-name").addEventListener("input", (e) => { state.name = e.target.value; save(); });
    $("#btn-export").addEventListener("click", () => {
      $("#export-text").value = listText();
      $("#export-dialog").showModal();
    });
    $("#btn-copy").addEventListener("click", async () => {
      const ta = $("#export-text");
      try { await navigator.clipboard.writeText(ta.value); toast("Decklist copied"); }
      catch (_) { ta.select(); try { document.execCommand("copy"); toast("Decklist copied"); } catch (__) { toast("Select the text and copy it"); } }
    });
    $("#btn-print-list").addEventListener("click", printList);
    $("#btn-print-proxies").addEventListener("click", printProxies);
    $("#btn-import-open").addEventListener("click", () => {
      $("#import-msg").textContent = "";
      $("#import-dialog").showModal();
      $("#import-text").focus();
    });
    $("#btn-import").addEventListener("click", () => {
      const text = $("#import-text").value;
      if (!text.trim()) { $("#import-msg").textContent = "Paste a list first."; return; }
      const unknown = importText(text);
      if (unknown.length) { $("#import-msg").textContent = `Loaded. Not found: ${unknown.join(", ")}`; return; }
      $("#import-dialog").close(); $("#import-text").value = ""; toast("List loaded");
    });
  }

  fetch("data/cards.json?v=4")
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((data) => {
      DATA = data;
      for (const c of data.cards) { c.kind = "card"; byId[c.id] = c; }
      for (const t of data.tokens) { t.kind = "token"; byId[t.id] = t; }
      // order: by Arcana Type, then cost, then name
      data.cards.sort((a, z) => ARCANA_ORDER.indexOf(a.arcanaType) - ARCANA_ORDER.indexOf(z.arcanaType) || a.cost - z.cost || a.name.localeCompare(z.name));
      data.tokens.sort((a, z) => (z.special - a.special) || ARCANA_ORDER.indexOf(a.arcanaType) - ARCANA_ORDER.indexOf(z.arcanaType) || a.value - z.value);
      load(); fillFilters(); wire(); render();
    })
    .catch(() => {
      $("#pool-grid").replaceChildren(el("p", { class: "empty", text: "Couldn't load the card data. If you opened index.html straight from your computer, run it from a web server or GitHub Pages instead." }));
    });
})();
