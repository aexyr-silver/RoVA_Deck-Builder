/* RoVA Deck Builder — static, no build step. Data comes from data/cards.json. */
(() => {
  "use strict";
  // Image paths get ?v=<assetVersion> from cards.json, so replaced pictures load fresh after a normal refresh.
  function versionImages(data) {
    const q = data.assetVersion ? `?v=${data.assetVersion}` : "";
    const fix = (o, keys) => { for (const k of keys) if (o[k]) o[k] = o[k].replace(/\?v=\d+$/, "") + q; };
    for (const c of [...data.cards, ...data.tokens]) fix(c, ["image", "imageDark", "inscription", "inscriptionDark", "official", "inscriptionOfficial"]);
    for (const b of [data.backs, data.backsDark]) if (b) fix(b, ["card", "token"]);
  }

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
    if (next === cur) { toast(`Max ${MAX_COPIES} copies`); return; }
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
    $("#pool-title").textContent = state.mode === "summons" ? "All summons" : "All tokens";
    $("#f-kind").hidden = state.mode !== "summons";
    $("#f-cost").hidden = state.mode !== "summons";
    $("#search").placeholder = state.mode === "summons" ? "Search" : "Search tokens";
    renderChosen();
    renderPool();
    if (detailId && byId[detailId]) showDetail(byId[detailId]);   // keep the counts in the text panel current
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
      stats.append(el("span", { text: `${zero} cost 0` }));
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
        if (n) stats.append(el("span", { text: `${n}× ${v}` }));
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
      const img = el("img", { src: item.official || face(item), alt: item.name, loading: "lazy" });   // grid: official card art
      const tile = el("button", {
        class: `tile${item.kind === "token" ? " token" : ""}${n >= cap(item) ? " maxed" : ""}`,
        title: `${item.name} — click to add, right-click to remove`,
        onclick: () => { add(item.id); showDetail(item); },
        oncontextmenu: (e) => { e.preventDefault(); if (n) remove(item.id); },
      }, img,
        n ? el("span", { class: "badge", text: String(n) }) : null,
        el("span", { class: "cap", text: item.kind === "card" ? `${item.cardType} · ${item.arcanaType}`
          : (item.special ? `${item.arcanaType} · Value ${item.value}` : `Normal · Value ${item.value} · no limit`) }));
      attachPreview(tile, item);
      grid.append(tile);
    }
    if (!grid.children.length) grid.append(el("p", { class: "empty", text: "No matches." }));
  }

  /* ---------- hover preview (desktop only) ---------- */
  // On the light site theme, show the dark card images (and the reverse). Printing always uses the light, ink-saving images.
  const siteLight = () => getComputedStyle(document.documentElement).colorScheme === "light";
  // my proxy images match the theme: dark set on the dark theme, white set on the light theme (printing always uses white)
  const face = (item) => (!siteLight() && item.imageDark) || item.image;
  const insFace = (item) => item.inscription && ((!siteLight() && item.inscriptionDark) || item.inscription);

  /* ---------- preview box + full card text (right column) ---------- */
  const ROMAN_N = { 0: "N", 1: "I", 2: "II", 3: "III", 4: "IV", 5: "V", 6: "VI", 7: "VII", 8: "VIII", 9: "IX", 13: "XIII" };
  const PLACE = {
    Full: "Any empty arena slot. Strong; effects are rare and restrictive.",
    Half: "Any empty arena slot. Typical cost and strength.",
    Quarter: "Quarter zone only (the 4 diamond slots). Can't intercept.",
    Fragment: "Fragment Recall Altar only (shared; at most 1 Fragment per turn by either player, none on either player's first turn). Counts as 0 emission / 0 capacity, can't attack, and is sacrificed when its effect ends or at the end of the turn.",
  };
  let detailId = null;
  function attachPreview(node, item) {
    node.addEventListener("mouseenter", () => showDetail(item));
    node.addEventListener("focus", () => showDetail(item));
  }
  function showDetail(item) {
    if (!item) return;
    detailId = item.id;
    const img = $("#detail-img");
    const src = item.inscriptionOfficial || item.official || insFace(item) || face(item);
    img.src = src; img.alt = item.inscription ? `${item.name} inscription card` : item.name;
    $("#detail").classList.toggle("wide", Boolean(item.inscription));
    $("#detail").classList.add("has");
    const box = $("#detail-text"); box.replaceChildren();
    const n = (item.kind === "card" ? state.summons : state.tokens)[item.id] || 0;
    const fact = (k, v) => [el("dt", { text: k }), el("dd", { text: v })];
    const block = (k, v, cls) => el("div", { class: `dblock ${cls || ""}` }, el("h4", { text: k }), el("p", { text: v }));
    if (item.kind === "card") {
      const frag = item.cardType === "Fragment";
      box.append(el("h3", { text: item.name }), el("p", { class: "dsub", text: `${item.cardType} · ${item.arcanaType}${item.setNo ? ` · No. ${item.setNo} of ${DATA.setSize || DATA.cards.length}` : ""}` }));
      box.append(el("dl", { class: "facts" },
        ...fact("Title", item.title || "None (tutorial card)"),
        ...fact("Cost", item.cost ? `${ROMAN_N[item.cost]} (${item.cost} unit${item.cost > 1 ? "s" : ""})` : "N (no cost)"),
        ...fact("Arcana Level", `${item.level} (rarity: 5 most common, 1 rarest)`),
        ...fact("Emission", frag ? "— (Fragment: counts as 0)" : String(item.emission)),
        ...fact("Capacity", frag ? "— (Fragment: counts as 0)" : String(item.capacity)),
        ...fact("Origin", frag ? "Badge: Fragments" : "None (tutorial card)"),
        ...fact("In your deck", `${n} of ${MAX_COPIES} max`)));
      box.append(block("Effect", item.effect && item.effect !== "None" ? item.effect : "No effect."));
      box.append(block("+ Affinity · Radiant Arcana Field only", item.affinity || "None.", "aff"));
      box.append(block("− Restriction · Radiant Arcana Field only", item.restriction || "None.", "res"));
      box.append(block("Placement", PLACE[item.cardType] || ""));
      box.append(block("Paying the cost", item.cost
        ? "Stash tokens (from the top) or card sacrifices from hand or field; each sacrifice is 1 unit and makes the opponent generate a token."
        : "Free: play it in the summon step like any other card (it counts toward the 0-cost minimum)."));
      box.append(el("p", { class: "dfoot", text: [item.credit, DATA.copyright].filter(Boolean).join(" · ") }));
    } else if (item.special) {
      box.append(el("h3", { text: item.name }), el("p", { class: "dsub", text: `Special Void Token (rune) · ${item.arcanaType}` }));
      box.append(el("dl", { class: "facts" },
        ...fact("Value", `${ROMAN_N[item.value] || item.value} (${item.value} charge to claim)`),
        ...fact("Arcana Type", item.arcanaType),
        ...fact("Trigger", item.trigger || "—"),
        ...fact("In your stack", `${n} of ${MAX_COPIES} max`)));
      box.append(block("Effect", item.effect || "—"));
      box.append(block("Inscription card", "One inscription card per kind of special token in your stack, shown to both players. The face shows the value, name, trigger and Arcana Type emblem."));
      box.append(block("How tokens move", "Generated onto your Void Altar when the opponent sacrifices; charged by summons; a fully charged token goes to its owner's stash (an enemy token charged to full is sacrificed to its owner's Abyss); stash tokens pay for summons from the top."));
    } else {
      box.append(el("h3", { text: `Void Token · Value ${ROMAN_N[item.value] || item.value}` }), el("p", { class: "dsub", text: "Normal Void Token" }));
      box.append(el("dl", { class: "facts" },
        ...fact("Value", `${ROMAN_N[item.value] || item.value} (${item.value} charge to claim)`),
        ...fact("Arcana Type", "None"),
        ...fact("Effect", "None"),
        ...fact("In your stack", `${n} (no copy limit)`)));
      box.append(block("How tokens move", "Generated onto your Void Altar when the opponent sacrifices; charged by summons; a fully charged token goes to its owner's stash (an enemy token charged to full is sacrificed to its owner's Abyss); stash tokens pay for summons from the top."));
    }
  }

  /* ---------- clear (two-step, no browser dialog) ---------- */
  let armTimer = null;
  function onClear() {
    const btn = $("#btn-clear");
    if (!btn.classList.contains("armed")) {
      btn.classList.add("armed");
      btn.textContent = state.mode === "summons" ? "Confirm?" : "Confirm?";
      clearTimeout(armTimer);
      armTimer = setTimeout(disarm, 3000);
      return;
    }
    if (state.mode === "summons") state.summons = {}; else state.tokens = {};
    disarm(); save(); render(); toast(state.mode === "summons" ? "Summons cleared" : "Tokens cleared");
  }
  function disarm() { const btn = $("#btn-clear"); btn.classList.remove("armed"); btn.textContent = "Clear"; }

  /* ---------- export / import ---------- */
  function tokenLabel(t) {
    return t.special ? `${t.name} Token v.${t.value}` : `Void Token v.${t.value}`;
  }

  function listText() {
    const lines = [`RoVA Decklist - ${state.name.trim() || "Untitled deck"}`, ""];
    const cards = Object.entries(state.summons).map(([id, n]) => [byId[id], n]);
    for (const t of TYPE_ORDER) {
      const g = cards.filter(([c]) => c.cardType === t).sort(sortCards);
      if (!g.length) continue;
      lines.push(`${t} (${g.reduce((s, [, n]) => s + n, 0)})`);
      for (const [c, n] of g) lines.push(`${n} ${c.name} ${c.title ? c.title : "-"} Lv. ${c.level}`);
      lines.push("");
    }
    const zero = cards.filter(([c]) => c.cost === 0).reduce((s, [, n]) => s + n, 0);
    lines.push(`Total: ${total(state.summons)}x summons (${zero}x 0-Cost)`, "");
    const toks = Object.entries(state.tokens).map(([id, n]) => [byId[id], n])
      .sort((a, z) => (a[0].special - z[0].special) || a[0].value - z[0].value || a[0].name.localeCompare(z[0].name));
    for (const [t, n] of toks) lines.push(`${n} ${tokenLabel(t)}`);
    const kinds = toks.filter(([t]) => t.special).length;
    lines.push(`Total: ${total(state.tokens)}x tokens (${kinds}x Inscription)`);
    return lines.join("\n");
  }

  // the longest known card name the text starts with; what follows is the title (or "-")
  function matchCard(rest) {
    const low = rest.toLowerCase();
    let best = null;
    for (const c of DATA.cards) {
      const nm = c.name.toLowerCase();
      if ((low === nm || low.startsWith(nm + " ")) && (!best || nm.length > best.name.length)) best = c;
    }
    return best;
  }

  function importText(text) {
    const cardByName = {}, tokByName = {}, normalByValue = {};
    for (const c of DATA.cards) cardByName[c.name.toLowerCase()] = c;
    for (const t of DATA.tokens) {
      if (t.special) tokByName[t.name.toLowerCase()] = t; else normalByValue[t.value] = t;
    }
    const s = {}, t = {}, unknown = [];
    let name = "";
    const put = (it, n) => {
      const b = it.kind === "card" ? s : t;
      b[it.id] = Math.min((b[it.id] || 0) + n, cap(it));
    };
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || /^total\s*:/i.test(line) || line.startsWith("#")) continue;
      const head = line.match(/^RoVA decklist\s*[—–-]\s*(.+)$/i);
      if (head) { name = head[1].trim(); continue; }
      let m;
      // tokens: "7 Void Token v.3" or "3 Refract Rune Token v.3"
      if ((m = line.match(/^(\d+)\s*[x×]?\s+(.+?)\s+Token\s+v\.?\s*(\d+)$/i))) {
        const n = Number(m[1]), nm = m[2].trim(), v = Number(m[3]);
        const it = /^void$/i.test(nm) ? normalByValue[v] : tokByName[nm.toLowerCase()];
        if (it) put(it, n); else unknown.push(`${nm} Token v.${v}`);
        continue;
      }
      // summons: "2 Blaze Spark - Lv. 5" or "2 Name Title Lv. 5"
      if ((m = line.match(/^(\d+)\s*[x×]?\s+(.+?)\s+Lv\.?\s*(\d+)$/i))) {
        const rest = m[2].trim();
        const it = matchCard(rest);
        if (it) put(it, Number(m[1])); else unknown.push(rest.replace(/\s+-$/, ""));
        continue;
      }
      // fallback: "3 Blaze Spark" / "3 Ember Rune" / "4 Void Token 3"
      if ((m = line.match(/^(\d+)\s*[x×]?\s+(.+)$/i))) {
        const nm = m[2].trim().toLowerCase();
        const vt = nm.match(/^void token\s*(\d+)$/);
        const it = cardByName[nm] || tokByName[nm] || (vt && normalByValue[Number(vt[1])]);
        if (it) put(it, Number(m[1])); else unknown.push(m[2].trim());
      }
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
    if (!imgs.length) { toast("Deck is empty"); return; }
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
    fa.append(el("option", { value: "None", text: "None (Void Tokens)" }));
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
    btn.addEventListener("click", () => { cur = order[(order.indexOf(cur) + 1) % order.length]; apply(); if (DATA) render(); });
    window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => { if (DATA) render(); });
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
      catch (_) { ta.select(); try { document.execCommand("copy"); toast("Decklist copied"); } catch (__) { toast("Copy failed. Select and copy."); } }
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
      if (!text.trim()) { $("#import-msg").textContent = "Paste a list."; return; }
      const unknown = importText(text);
      if (unknown.length) { $("#import-msg").textContent = `Loaded. Unknown: ${unknown.join(", ")}`; return; }
      $("#import-dialog").close(); $("#import-text").value = ""; toast("List loaded");
    });
  }

  fetch("data/cards.json", { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((data) => {
      versionImages(data); DATA = data;
      for (const c of data.cards) { c.kind = "card"; byId[c.id] = c; }
      for (const t of data.tokens) { t.kind = "token"; byId[t.id] = t; }
      // order: by Arcana Type, then cost, then name
      data.cards.sort((a, z) => ARCANA_ORDER.indexOf(a.arcanaType) - ARCANA_ORDER.indexOf(z.arcanaType) || a.cost - z.cost || a.name.localeCompare(z.name));
      data.tokens.sort((a, z) => (z.special - a.special) || ARCANA_ORDER.indexOf(a.arcanaType) - ARCANA_ORDER.indexOf(z.arcanaType) || a.value - z.value);
      load(); fillFilters(); wire(); render();
    })
    .catch(() => {
      $("#pool-grid").replaceChildren(el("p", { class: "empty", text: "Card data failed to load. Open the site from GitHub Pages, not as a local file." }));
    });
})();
