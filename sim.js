/* RoVA Playtest simulator — sandbox with helpers.
   The host's browser holds the game state; the guest sends actions and receives its own view. */
(() => {
  "use strict";

  const SLOTS = ["1F", "1B", "2M", "3F", "3B", "4M", "5F", "5B"];
  const QUARTER_SLOTS = ["2M", "3F", "3B", "4M"];
  const SLOT_LABEL = { "1F": "Front", "1B": "Back", "2M": "Corner", "3F": "Front · Q", "3B": "Back · Q", "4M": "Corner", "5F": "Front", "5B": "Back" };
  const ARCANA_ORDER = ["Blaze", "Frost", "Seal", "Static", "Flow", "Hidden", "Refract", "Chaos"];
  const WIN_TARGET = 6;

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
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* ignore */ } },
  };

  // One id per browser, so a player can't join a room they are hosting (same tab or another tab)
  const CLIENT_ID = (() => {
    let id = store.get("rova-client-id");
    if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); store.set("rova-client-id", id); }
    return id;
  })();

  let DATA = null, PRESETS = [];
  const REF = {};          // card/token id -> data
  const BACKS = { card: "backs/card-back.png", token: "backs/token-back.png" };
  let BACKS_DARK = null;
  const ROMAN = { 0: "0", 1: "I", 2: "II", 3: "III", 4: "IV", 5: "V", 6: "VI", 7: "VII", 8: "VIII", 9: "IX", 13: "XIII" };
  // Light site theme shows the dark card images, dark theme shows the light ones
  const siteLight = () => getComputedStyle(document.documentElement).colorScheme === "light";
  const face = (ref) => (siteLight() && ref.imageDark) || ref.image;
  const insFace = (ref) => ref.inscription && ((siteLight() && ref.inscriptionDark) || ref.inscription);
  const back = (k) => (siteLight() && BACKS_DARK && BACKS_DARK[k]) || BACKS[k];

  /* =================================================================== */
  /* Decklist parsing (same format as the deck builder)                  */
  /* =================================================================== */
  function parseDeck(text) {
    const cardByName = {}, tokByName = {}, normalByValue = {};
    for (const c of DATA.cards) cardByName[c.name.toLowerCase()] = c;
    for (const t of DATA.tokens) { if (t.special) tokByName[t.name.toLowerCase()] = t; else normalByValue[t.value] = t; }
    const matchCard = (rest) => {
      const low = rest.toLowerCase(); let best = null;
      for (const c of DATA.cards) {
        const nm = c.name.toLowerCase();
        if ((low === nm || low.startsWith(nm + " ")) && (!best || nm.length > best.name.length)) best = c;
      }
      return best;
    };
    const cards = [], tokens = [], unknown = [];
    let name = "";
    for (const raw of String(text || "").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || /^total\s*:/i.test(line) || line.startsWith("#")) continue;
      const head = line.match(/^RoVA decklist\s*[—–-]\s*(.+)$/i);
      if (head) { name = head[1].trim(); continue; }
      let m, it = null, n = 0;
      if ((m = line.match(/^(\d+)\s*[x×]?\s+(.+?)\s+Token\s+v\.?\s*(\d+)$/i))) {
        n = +m[1]; const nm = m[2].trim();
        it = /^void$/i.test(nm) ? normalByValue[+m[3]] : tokByName[nm.toLowerCase()];
        if (!it) unknown.push(`${nm} Token v.${m[3]}`);
      } else if ((m = line.match(/^(\d+)\s*[x×]?\s+(.+?)\s+Lv\.?\s*(\d+)$/i))) {
        n = +m[1]; it = matchCard(m[2].trim()); if (!it) unknown.push(m[2].trim());
      } else if ((m = line.match(/^(\d+)\s*[x×]?\s+(.+)$/i))) {
        n = +m[1]; const nm = m[2].trim().toLowerCase(); const vt = nm.match(/^void token\s*(\d+)$/);
        it = matchCard(m[2].trim()) || tokByName[nm] || (vt && normalByValue[+vt[1]]);
        if (!it) unknown.push(m[2].trim());
      }
      if (it) for (let i = 0; i < n; i++) (it.kind === "card" ? cards : tokens).push(it.id);
    }
    return { name, cards, tokens, unknown };
  }

  /* =================================================================== */
  /* Game engine                                                          */
  /* =================================================================== */
  const opp = (p) => 1 - p;
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  function newGame(decks, names) {
    const S = { started: true, phase: "setup", turn: 0, turnNo: 0, first: 0, field: null, alert: null, aseq: 0, attack: null, undo: { count: 0, label: "", req: null }, fra: null, altarUsed: [false, false],
      activeAbyss: null, objects: {}, players: [], log: [], chat: [], seq: 0, cseq: 0, over: false };
    let n = 0;
    const mk = (kind, ref, owner) => { const iid = `o${++n}`; S.objects[iid] = { iid, kind, ref, owner, rested: false, em: 0, cp: 0, charge: 0, down: false }; return iid; };
    for (let p = 0; p < 2; p++) {
      const cards = decks[p].cards.map((id) => mk("card", id, p)), tokens = decks[p].tokens.map((id) => mk("token", id, p));
      S.players.push({ name: names[p] || `Player ${p + 1}`, deck: cards.slice(), order: { cards, tokens },
        hand: [], arena: Object.fromEntries(SLOTS.map((s) => [s, null])), abyss: [],
        stack: tokens.slice(), altar: [[], [], []], stash: [],
        pendingGen: 0, handRevealed: false, peek: null, setupDone: false, ready: false, vote: null });
    }
    log(S, "sys", "Table open. Each player: Setup, vote, Ready.");
    return S;
  }

  // Setup: shuffle, draw 4, reveal 3 tokens (owner only)
  function setupSide(S, p) {
    const P = S.players[p]; if (P.setupDone) return;
    shuffle(P.deck); shuffle(P.stack);
    drawCards(S, p, 4, true);
    const vals = [];
    for (let k = 0; k < 3 && P.stack.length; k++) { const t = P.stack.shift(); P.altar[k].push(t); vals.push(REF[S.objects[t].ref].value); }
    P.setupDone = true;
    log(S, "", `${pn(S, p)} sets up. Setup tokens: ${vals.join(", ")}.`);
  }
  // Reset: everything of that player's back into deck and stack, as before Setup
  function resetSide(S, p) {
    const P = S.players[p];
    for (const iid of [...P.order.cards, ...P.order.tokens]) Object.assign(S.objects[iid], { rested: false, em: 0, cp: 0, charge: 0, down: false });
    if (S.fra && S.fra.owner === p) S.fra = null;
    if (S.activeAbyss && S.objects[S.activeAbyss].owner === p) S.activeAbyss = null;
    for (const Q of S.players) if (Q.peek && Q.peek.owner === p) Q.peek = null;
    Object.assign(P, { deck: P.order.cards.slice(), stack: P.order.tokens.slice(), hand: [], abyss: [], stash: [],
      arena: Object.fromEntries(SLOTS.map((s) => [s, null])), altar: [[], [], []],
      pendingGen: 0, handRevealed: false, setupDone: false, ready: false, vote: null });
    log(S, "sys", `${pn(S, p)} resets their side.`);
    if (S.phase === "play") {
      S.phase = "setup"; S.over = false; S.turnNo = 0; S.altarUsed = [false, false];
      S.field = null;
      for (const Q of S.players) { Q.ready = false; Q.vote = null; }
      log(S, "sys", "Back to setup. Vote and Ready again.");
    }
  }
  function castVote(S, p, choice) {
    const P = S.players[p];
    if (S.phase !== "setup" || P.ready || !["Radiant", "Dormant"].includes(choice)) return;
    P.vote = choice;
    log(S, "", `${pn(S, p)} voted.`);     // the choice stays secret until the tally
  }
  function toggleReady(S, p) {
    const P = S.players[p]; if (!P.setupDone || !P.vote || S.phase !== "setup") return;
    P.ready = !P.ready;
    log(S, "", `${pn(S, p)} is ${P.ready ? "ready" : "not ready"}.`);
    if (!S.players.every((Q) => Q.ready)) return;
    // tally the Arcana Field vote
    const [a, b] = S.players.map((Q) => Q.vote);
    if (a !== b) {
      for (const Q of S.players) Q.ready = false;
      const text = `${pn(S, 0)}: ${a} · ${pn(S, 1)}: ${b}. Vote again.`;
      S.alert = { n: ++S.aseq, text };
      log(S, "sys", text);
      return;
    }
    S.field = a;
    log(S, "sys", `Field vote: ${a}. Locked for this game.`);
    beginGame(S);
  }
  // Both ready: compare setup tokens to pick the first player, then start turn 1
  function beginGame(S) {
    let decided = false;
    for (let attempt = 0; attempt < 30 && !decided; attempt++) {
      const vals = S.players.map((P) => P.altar.map((sl) => (sl[0] ? REF[S.objects[sl[0]].ref].value : 0)));
      for (let k = 1; k <= 3 && !decided; k++) {
        const a = vals[0].slice(0, k).reduce((x, y) => x + y, 0), b = vals[1].slice(0, k).reduce((x, y) => x + y, 0);
        if (a !== b) { S.first = a > b ? 0 : 1; decided = true;
          log(S, "sys", `${S.players[0].name} ${vals[0].join("+")} vs ${S.players[1].name} ${vals[1].join("+")}: ${S.players[S.first].name} goes first.`); }
      }
      if (!decided) {
        for (const P of S.players) {
          for (const sl of P.altar) P.stack.push(...sl.splice(0)); shuffle(P.stack);
          for (let k = 0; k < 3 && P.stack.length; k++) P.altar[k].push(P.stack.shift());
        }
        log(S, "sys", "Setup tokens tied. Revealing again.");
      }
    }
    if (!decided) { S.first = 0; log(S, "sys", "Setup kept tying; Player 1 goes first."); }
    S.phase = "play"; S.turn = S.first; S.turnNo = 1;
    log(S, "sys", "Game begins.");
    startTurn(S);
  }

  function log(S, kind, text) { S.log.push({ kind, text, n: ++S.seq, turn: S.turnNo }); if (S.log.length > 600) S.log.splice(0, S.log.length - 600); }
  const nm = (S, iid) => { const o = S.objects[iid]; return o ? REF[o.ref].name : "?"; };
  const pn = (S, p) => S.players[p].name;

  function drawCards(S, p, k, quiet) {
    const P = S.players[p]; let got = 0;
    for (let i = 0; i < k; i++) { if (!P.deck.length) { log(S, "sys", `${pn(S, p)} can't draw: deck empty.`); break; } P.hand.push(P.deck.shift()); got++; }
    if (!quiet && got) log(S, "", `${pn(S, p)} draws ${got}.`);
    return got;
  }

  function startTurn(S) {
    const p = S.turn, P = S.players[p];
    for (const s of SLOTS) if (P.arena[s]) S.objects[P.arena[s]].rested = false;
    S.step = "summon";
    log(S, "turn", `Turn ${S.turnNo}: ${pn(S, p)}`);
    drawCards(S, p, S.turnNo === 1 ? 1 : 2);
  }

  // where is an object?
  function locate(S, iid) {
    for (let p = 0; p < 2; p++) {
      const P = S.players[p];
      for (const z of ["deck", "hand", "abyss", "stack", "stash"]) { const i = P[z].indexOf(iid); if (i >= 0) return { p, zone: z, i }; }
      for (const s of SLOTS) if (P.arena[s] === iid) return { p, zone: "arena", slot: s };
      for (let k = 0; k < 3; k++) { const i = P.altar[k].indexOf(iid); if (i >= 0) return { p, zone: "altar", slot: k, i, top: i === P.altar[k].length - 1 }; }
    }
    if (S.fra && S.fra.iid === iid) return { p: S.fra.owner, zone: "fra" };
    return null;
  }
  function detach(S, iid) {
    const L = locate(S, iid); if (!L) return null;
    const P = S.players[L.p];
    if (L.zone === "arena") P.arena[L.slot] = null;
    else if (L.zone === "altar") P.altar[L.slot].splice(L.i, 1);
    else if (L.zone === "fra") S.fra = null;
    else P[L.zone].splice(L.i, 1);
    if (S.activeAbyss === iid) S.activeAbyss = null;
    const o = S.objects[iid]; o.rested = false; o.em = 0; o.cp = 0; o.charge = 0;
    if (S.attack && (S.attack.to === iid || S.attack.from === iid)) S.attack = null;
    for (const Q of S.players) if (Q.peek) Q.peek.iids = Q.peek.iids.filter((x) => x !== iid);
    return L;
  }

  function sendToAbyss(S, iid) {
    const o = S.objects[iid]; detach(S, iid);
    o.down = false;
    S.players[o.owner].abyss.unshift(iid);       // index 0 = newest
    const ref = REF[o.ref];
    if (ref.effect && /^abyss effect/i.test(ref.effect)) setActive(S, iid);
  }
  function setActive(S, iid) {
    if (S.activeAbyss && S.activeAbyss !== iid) { S.objects[S.activeAbyss].down = true; log(S, "sys", `${nm(S, S.activeAbyss)} dissipates.`); }
    S.activeAbyss = iid; S.objects[iid].down = false;
    log(S, "sys", `${nm(S, iid)} is active in the Abyss.`);
  }

  function generate(S, p, slot) {
    const P = S.players[p];
    if (!P.stack.length) {
      const back = []; for (const sl of P.altar) back.push(...sl.splice(0));
      if (!back.length) { log(S, "sys", `${pn(S, p)} has no tokens left and loses.`); return false; }
      for (const t of back) S.objects[t].charge = 0;
      P.stack.push(...shuffle(back));
      log(S, "sys", `${pn(S, p)}'s stack ran out: altar tokens reshuffled, 3 generated.`);
      for (let k = 0; k < 3 && P.stack.length; k++) P.altar[k].push(P.stack.shift());
      if (!P.stack.length) return true;
    }
    const t = P.stack.shift(); S.objects[t].charge = 0; P.altar[slot].push(t);
    log(S, "", `${pn(S, p)} generates ${nm(S, t)} (slot ${slot + 1}).`);
    return true;
  }

  function apply(S, actor, a, solo) {
    if (!a || typeof a !== "object") return;
    const me = actor, P = S.players[me];
    const own = (iid) => { const o = S.objects[iid]; return o && o.owner === me; };
    const L = a.iid ? locate(S, a.iid) : null;
    const side = solo && (a.player === 0 || a.player === 1) ? a.player : me;   // solo may act for either side
    if (S.phase === "setup" && !["say", "setup", "ready", "reset", "coin", "vote"].includes(a.type)) return;
    switch (a.type) {
      case "setup": if (S.phase === "setup") setupSide(S, side); break;
      case "ready": toggleReady(S, side); break;
      case "vote": castVote(S, side, a.choice); break;
      case "reset": resetSide(S, side); break;
      case "say": if (a.text) { S.chat.push({ who: me, name: pn(S, me), text: String(a.text).slice(0, 300), n: ++S.cseq, at: Date.now() }); if (S.chat.length > 300) S.chat.splice(0, S.chat.length - 300); } break;
      case "draw": drawCards(S, me, Math.max(1, Math.min(5, a.n | 0))); break;
      case "shuffle": shuffle(P.deck); log(S, "", `${pn(S, me)} shuffles their deck.`); break;
      case "standAll": for (const s of SLOTS) if (P.arena[s]) S.objects[P.arena[s]].rested = false; log(S, "", `${pn(S, me)} stands all.`); break;
      case "revealHand": P.handRevealed = !P.handRevealed; log(S, "", `${pn(S, me)} ${P.handRevealed ? "reveals" : "hides"} their hand.`); break;
      case "coin": log(S, "sys", `${pn(S, me)} flips: ${Math.random() < 0.5 ? "Radiant" : "Dormant"}.`); break;

      case "summon": {
        if (!L || L.zone !== "hand" || L.p !== me) return;
        if (S.step === "attack" && S.turn === me) return;      // the attack phase ends summoning (Fragments still go to the Recall Altar)
        if (!SLOTS.includes(a.slot) || P.arena[a.slot]) return;
        detach(S, a.iid); P.arena[a.slot] = a.iid;
        log(S, "", `${pn(S, me)} summons ${nm(S, a.iid)} to ${slotName(a.slot)}.`); break;
      }
      case "toAltar": {
        if (!L || L.zone !== "hand" || L.p !== me || S.fra) return;
        detach(S, a.iid); S.fra = { iid: a.iid, owner: me }; S.altarUsed[me] = true;
        log(S, "", `${pn(S, me)} places ${nm(S, a.iid)} on the Fragment Recall Altar.`); break;
      }
      case "move": {
        if (!L || L.zone !== "arena") return;
        const Q = S.players[L.p];
        if (!SLOTS.includes(a.slot) || Q.arena[a.slot]) return;
        Q.arena[L.slot] = null; Q.arena[a.slot] = a.iid;
        log(S, "", `${pn(S, me)} moves ${nm(S, a.iid)}${L.p !== me ? ` (${pn(S, L.p)})` : ""} to ${slotName(a.slot)}.`); break;
      }
      case "rest": if (L && L.zone === "arena") { const o = S.objects[a.iid]; o.rested = !o.rested; log(S, "", `${nm(S, a.iid)} ${o.rested ? "rests" : "stands"}.`); } break;
      case "mod": if (L && L.zone === "arena") {
        const o = S.objects[a.iid];
        if (a.clear) o.em = o.cp = 0;
        else if (a.stat === "em" || a.stat === "cp") o[a.stat] += a.d > 0 ? 1 : -1;
        else return;
        const what = a.clear ? "effects cleared" : `${a.stat === "em" ? "emission" : "capacity"} ${a.d > 0 ? "+1" : "−1"}`;
        log(S, "", `${nm(S, a.iid)}: ${what} → ${statText(S.objects[a.iid])}.`); } break;
      case "nextPhase": {
        if ((S.turn !== me && !solo) || S.step !== "summon") return;
        S.step = "attack"; log(S, "sys", `${pn(S, S.turn)}: attack phase. No more summoning this turn (Fragments still allowed).`); break;
      }
      case "attack": {
        if (!L || L.zone !== "arena" || S.objects[a.iid].rested) return;
        if (S.step !== "attack" || L.p !== S.turn) return;
        const T = a.target ? locate(S, a.target) : null;
        if (!T || a.target === a.iid) return;
        const isTok = T.zone === "altar" && T.top;
        if (!(T.zone === "arena" || T.zone === "fra" || isTok)) return;
        S.objects[a.iid].rested = true;
        S.attack = { from: a.iid, to: a.target };
        if (isTok) {
          const e = Math.max(0, stats(S.objects[a.iid])[0]);
          log(S, "", `${nm(S, a.iid)} charges ${nm(S, a.target)} on ${pn(S, T.p)}'s altar (+${e}).`);
          chargeToken(S, me, a.target, T, e);
        } else log(S, "", `${nm(S, a.iid)} attacks ${nm(S, a.target)}${T.zone === "fra" ? " on the Recall Altar" : ` (${pn(S, T.p)})`}.`);
        break;
      }
      case "sacrifice": {
        if (!L) return;
        if (L.zone === "stash" && L.i !== S.players[L.p].stash.length - 1) return;   // stash: top only
        if (L.zone === "altar" && !L.top) return;
        const owner = S.objects[a.iid].owner, what = nm(S, a.iid);
        const wasFra = L.zone === "fra";
        sendToAbyss(S, a.iid);
        S.players[opp(owner)].pendingGen++;
        log(S, "", `${pn(S, me)} sacrifices ${what}${owner !== me ? ` (${pn(S, owner)})` : ""}${wasFra ? " from the Fragment Recall Altar" : ""}. ${pn(S, opp(owner))} generates a token.`);
        break;
      }
      case "toHand": {
        if (!L || ["deck", "stack", "stash", "altar"].includes(L.zone)) return;
        const o = S.objects[a.iid]; if (o.kind !== "card") return;
        detach(S, a.iid); o.down = false; S.players[o.owner].hand.push(a.iid);
        log(S, "", `${nm(S, a.iid)} returns to ${pn(S, o.owner)}'s hand.`); break;
      }
      case "toDeck": {
        if (!L || ["stack", "stash", "altar"].includes(L.zone)) return;
        const o = S.objects[a.iid]; if (o.kind !== "card") return;
        detach(S, a.iid); o.down = false;
        if (a.where === "bottom") S.players[o.owner].deck.push(a.iid); else S.players[o.owner].deck.unshift(a.iid);
        log(S, "", `A card goes to ${pn(S, o.owner)}'s deck ${a.where === "bottom" ? "bottom" : "top"}.`); break;
      }
      case "abyssActive": if (L && L.zone === "abyss" && !S.objects[a.iid].down) setActive(S, a.iid); break;
      case "dissipate": if (L && L.zone === "abyss") { S.objects[a.iid].down = true; if (S.activeAbyss === a.iid) S.activeAbyss = null; log(S, "", `${pn(S, me)} dissipates ${nm(S, a.iid)}.`); } break;
      case "abyssInactive": if (S.activeAbyss === a.iid) { S.activeAbyss = null; log(S, "", `${nm(S, a.iid)} is no longer active.`); } break;

      case "generate": {
        const p = a.player === 0 || a.player === 1 ? a.player : me;
        if (!(a.slot >= 0 && a.slot < 3)) return;
        if (generate(S, p, a.slot) && a.pending && S.players[p].pendingGen > 0) S.players[p].pendingGen--;
        break;
      }
      case "skipGen": { const p = a.player === 0 || a.player === 1 ? a.player : me; if (S.players[p].pendingGen > 0) { S.players[p].pendingGen--; log(S, "", `${pn(S, me)} skips a token for ${pn(S, p)}.`); } break; }
      case "charge": if (L && L.zone === "altar" && L.top) chargeToken(S, me, a.iid, L, a.d | 0); break;
      case "claim": if (L && L.zone === "altar" && L.top) {
        const o = S.objects[a.iid]; detach(S, a.iid); S.players[o.owner].stash.push(a.iid);
        log(S, "", `${pn(S, o.owner)} claims ${nm(S, a.iid)} (stash ${S.players[o.owner].stash.length}).`); } break;
      case "moveToken": if (L && L.zone === "altar" && L.top && a.slot >= 0 && a.slot < 3 && a.slot !== L.slot) {
        const Q = S.players[L.p]; Q.altar[L.slot].pop(); Q.altar[a.slot].push(a.iid);
        log(S, "", `${pn(S, me)} moves ${nm(S, a.iid)} to altar slot ${a.slot + 1}.`); } break;
      case "activateWin": {
        S.altarUsed[me] = true;
        const n = P.stash.length;
        log(S, n >= WIN_TARGET ? "turn" : "sys", `${pn(S, me)} activates the win on the Fragment Recall Altar with ${n} stashed tokens${n >= WIN_TARGET ? ". WIN!" : ` (needs ${WIN_TARGET}).`}`);
        if (n >= WIN_TARGET) S.over = true; break;
      }
      case "peek": {
        const owner = a.owner === 0 || a.owner === 1 ? a.owner : me;
        const k = Math.max(1, Math.min(10, a.n | 0));
        P.peek = { owner, iids: S.players[owner].deck.slice(0, k) };
        log(S, "", `${pn(S, me)} peeks at ${P.peek.iids.length} from ${owner === me ? "their" : pn(S, owner) + "'s"} deck.`); break;
      }
      case "peekPut": {
        if (!P.peek || !P.peek.iids.includes(a.iid)) return;
        const Q = S.players[P.peek.owner]; const i = Q.deck.indexOf(a.iid); if (i < 0) return;
        Q.deck.splice(i, 1);
        if (a.where === "hand" && P.peek.owner === me) { P.hand.push(a.iid); P.peek.iids = P.peek.iids.filter((x) => x !== a.iid); log(S, "", `${pn(S, me)} takes a peeked card.`); }
        else if (a.where === "bottom") { Q.deck.push(a.iid); P.peek.iids = P.peek.iids.filter((x) => x !== a.iid); log(S, "", `${pn(S, me)} bottoms a peeked card.`); }
        else { Q.deck.unshift(a.iid); P.peek.iids = [a.iid, ...P.peek.iids.filter((x) => x !== a.iid)]; }
        break;
      }
      case "peekReveal": if (P.peek) log(S, "", `${pn(S, me)} reveals: ${P.peek.iids.map((x) => nm(S, x)).join(", ") || "nothing"}.`); break;
      case "peekClose": P.peek = null; break;

      case "endTurn": {
        if (S.turn !== me && !solo) return;
        if (S.step !== "attack") return;                         // both phases must be passed
        const ender = S.turn;
        for (const Q of S.players) for (const sl of Q.altar) for (const t of sl) S.objects[t].charge = 0;
        S.attack = null;
        log(S, "sys", "End of turn: charge reset.");
        if (S.fra) { const f = S.fra; const what = nm(S, f.iid); sendToAbyss(S, f.iid); S.players[opp(f.owner)].pendingGen++;
          log(S, "sys", `${what} leaves the altar (sacrificed). ${pn(S, opp(f.owner))} generates a token.`); }
        log(S, "sys", "Check: sacrifice 0-capacity summons.");
        S.altarUsed = [false, false];
        S.turn = opp(ender); S.turnNo++;
        startTurn(S); break;
      }
      default: return;
    }
  }
  // Charge a token. Full charge: an enemy token is sacrificed to its owner's Abyss (the charger generates);
  // your own token stays on the altar until you press Claim.
  function chargeToken(S, me, iid, L, d) {
    const o = S.objects[iid]; o.charge = Math.max(0, o.charge + d);
    const v = REF[o.ref].value;
    log(S, "", `${nm(S, iid)} (${pn(S, L.p)}): ${o.charge}/${v} charged.`);
    if (o.charge < v) return;
    if (L.p !== me) {
      sendToAbyss(S, iid); S.players[me].pendingGen++;
      log(S, "", `${nm(S, iid)} is sacrificed to ${pn(S, L.p)}'s Abyss. ${pn(S, me)} generates a token.`);
    } else log(S, "", `${nm(S, iid)} is fully charged. Claim it from its menu.`);
  }
  const stats = (o) => { const r = REF[o.ref]; return [r.emission + (o.em || 0), r.capacity + (o.cp || 0)]; };
  const statText = (o) => stats(o).join("/");
  function slotName(s) { return `column ${s[0]} ${s[1] === "F" ? "front" : s[1] === "B" ? "back" : "corner"}`; }

  /* views: what one player may see */
  function viewFor(S, p, all) {
    const V = JSON.parse(JSON.stringify(S));
    for (let q = 0; q < 2; q++) {
      const Q = V.players[q];
      const showHand = all || q === p || Q.handRevealed;
      Q.handCount = Q.hand.length; if (!showHand) Q.hand = Q.hand.map(() => null);
      Q.deckCount = Q.deck.length; Q.deck = []; Q.order = null;
      Q.stackCount = Q.stack.length; Q.stack = [];
      Q.stashCount = Q.stash.length; Q.stash = Q.stash.length ? [Q.stash[Q.stash.length - 1]] : [];
      if (q !== p && !all) { Q.peek = null; if (Q.vote) Q.vote = "secret"; }
    }
    // keep only visible objects
    const vis = new Set();
    for (const Q of V.players) {
      for (const x of Q.hand) if (x) vis.add(x);
      for (const x of Q.abyss) vis.add(x);
      for (const x of Q.stash) vis.add(x);
      for (const s of SLOTS) if (Q.arena[s]) vis.add(Q.arena[s]);
      for (const sl of Q.altar) for (const x of sl) vis.add(x);
      if (Q.peek) for (const x of Q.peek.iids) vis.add(x);
    }
    if (V.fra) vis.add(V.fra.iid);
    const objs = {}; for (const x of vis) objs[x] = V.objects[x]; V.objects = objs;
    V.log = V.log.slice(-300); V.chat = (V.chat || []).slice(-150);
    return V;
  }

  /* =================================================================== */
  /* Controllers: solo, host, guest                                       */
  /* =================================================================== */
  const ctl = { mode: null, me: 0, S: null, V: null, peer: null, conn: null, guestDeck: null, guestName: "", soloActing: 0 };

  function act(a) {
    if (ctl.mode === "guest") { if (ctl.conn && ctl.conn.open) ctl.conn.send({ t: "action", a }); else toast("Not connected"); return; }
    if (!ctl.S) return;
    const actor = ctl.mode === "solo" ? ctl.soloActing : 0;
    const before = ctl.S.phase;
    runAction(ctl.S, actor, a, ctl.mode === "solo");
    if (ctl.mode === "solo" && (a.type === "endTurn" || a.type === "undoReq" || (before === "setup" && ctl.S.phase === "play"))) ctl.soloActing = ctl.S.turn;
    publish();
  }

  /* Undo: the host keeps the last UNDO_MAX game states. Online, the other player must allow it. */
  const UNDO_MAX = 10, NO_HISTORY = ["say", "peekPut", "peekReveal", "peekClose", "undoReq", "undoAns", "undoCancel"];
  ctl.hist = [];
  function snapshot(S) { const { log: _l, chat: _c, seq: _s, cseq: _cs, alert: _a, aseq: _as, undo: _u, ...rest } = S; return JSON.stringify(rest); }
  function syncUndo(S) { const h = ctl.hist; S.undo = { count: h.length, label: h.length ? h[h.length - 1].label : "", req: S.undo ? S.undo.req : null }; }
  function doUndo(S) {
    const h = ctl.hist.pop(); if (!h) return;
    Object.assign(S, JSON.parse(h.snap));
    S.undo.req = null;
    log(S, "sys", `Undone: ${h.label}`);
  }
  function runAction(S, actor, a, solo) {
    if (!a || typeof a !== "object") return;
    const U = S.undo;
    if (a.type === "undoReq") {
      if (!ctl.hist.length || U.req) return;
      const label = ctl.hist[ctl.hist.length - 1].label;
      if (solo) doUndo(S);
      else { U.req = { by: actor, label }; log(S, "sys", `${pn(S, actor)} asks to undo: ${label}`); }
    } else if (a.type === "undoAns") {
      if (!U.req || U.req.by === actor) return;
      if (a.ok) doUndo(S);
      else { log(S, "sys", `${pn(S, actor)} refuses the undo.`); U.req = null; }
    } else if (a.type === "undoCancel") {
      if (U.req && U.req.by === actor) { U.req = null; log(S, "sys", `${pn(S, actor)} cancels the undo request.`); }
    } else if (NO_HISTORY.includes(a.type)) {
      apply(S, actor, a, solo);
    } else {
      const before = snapshot(S), seq0 = S.seq;
      apply(S, actor, a, solo);
      if (snapshot(S) !== before) {
        const first = S.log.find((l) => l.n > seq0);
        ctl.hist.push({ snap: before, label: first ? first.text : a.type });
        if (ctl.hist.length > UNDO_MAX) ctl.hist.shift();
        if (U.req) { U.req = null; log(S, "sys", "Undo request dropped: the game moved on."); }
      }
    }
    syncUndo(S);
  }
  function publish() {
    if (ctl.mode === "host" && ctl.conn && ctl.conn.open) ctl.conn.send({ t: "view", v: viewFor(ctl.S, 1) });
    const me = ctl.mode === "solo" ? ctl.soloActing : 0;
    ctl.V = viewFor(ctl.S, me, ctl.mode === "solo"); ctl.me = me;
    render();
  }

  function netStatus(text, cls) { const n = $("#net-status"); n.hidden = !text; n.textContent = text || ""; n.className = `pill ${cls || ""}`; }

  function code6() { const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s = ""; for (let i = 0; i < 6; i++) s += A[Math.floor(Math.random() * A.length)]; return s; }

  function host() {
    if (ctl.mode === "guest") { toast("Joined in this tab. Reload to host."); return; }
    if (ctl.mode === "host") return;
    const deck = readDeck(0); if (!deck) return;
    if (typeof Peer === "undefined") { toast("Online play couldn't load"); return; }
    const code = code6();
    ctl.mode = "host";
    netStatus("Creating room…");
    ctl.peer = new Peer(`rova-pt-${code}`);
    ctl.peer.on("open", () => {
      $("#host-box").hidden = false; $("#room-code").textContent = code; netStatus("Room open", "ok");
      $("#btn-host").disabled = true;
      $("#btn-join").disabled = true; $("#join-code").disabled = true;
      $("#join-msg").textContent = "Hosting in this tab.";
    });
    ctl.peer.on("error", (e) => { netStatus("Connection problem", "bad"); toast(`Online error: ${e.type || e}`); });
    ctl.peer.on("connection", (conn) => {
      if (ctl.conn && ctl.conn.open) { conn.on("open", () => { conn.send({ t: "error", msg: "Room is full." }); setTimeout(() => conn.close(), 300); }); return; }
      ctl.conn = conn;
      conn.on("data", (msg) => {
        if (!msg || typeof msg !== "object") return;
        if (msg.t === "hello") {
          if (msg.client === CLIENT_ID) { conn.send({ t: "error", msg: "That's your own room." }); setTimeout(() => conn.close(), 300); ctl.conn = null; return; }
          const parsed = parseDeck(msg.deck);
          if (!parsed.cards.length || !parsed.tokens.length) { conn.send({ t: "error", msg: "Deck needs summons and tokens." }); return; }
          ctl.guestDeck = parsed; ctl.guestName = String(msg.name || "Guest").slice(0, 24);
          $("#host-wait").textContent = `${ctl.guestName} joined (${parsed.cards.length} summons, ${parsed.tokens.length} tokens).`;
          $("#btn-start-online").disabled = false;
          if (ctl.S) publish();
        } else if (msg.t === "action" && ctl.S) { runAction(ctl.S, 1, msg.a, false); publish(); }
      });
      conn.on("close", () => { netStatus("Opponent left", "bad"); toast("Opponent disconnected"); ctl.conn = null; });
    });
  }
  function startOnline() {
    const mine = readDeck(0); if (!mine || !ctl.guestDeck) return;
    ctl.S = newGame([mine, ctl.guestDeck], [myName(), ctl.guestName]); ctl.hist = [];
    showGame(); publish();
  }
  function join() {
    const code = $("#join-code").value.trim().toUpperCase();
    if (ctl.mode === "host") {
      $("#join-msg").textContent = code === $("#room-code").textContent
        ? "That's your own room."
        : "Hosting in this tab. Reload to join.";
      return;
    }
    if (ctl.mode === "guest") { $("#join-msg").textContent = "Already joined."; return; }
    const deck = readDeck(0); if (!deck) return;
    if (code.length !== 6) { $("#join-msg").textContent = "Code must be 6 characters."; return; }
    if (typeof Peer === "undefined") { toast("Online play couldn't load"); return; }
    ctl.mode = "guest"; ctl.me = 1;
    $("#btn-host").disabled = true;
    // a failed join (before the game opens) lets the player try again or host instead
    const giveUp = () => { if (!$("#game").hidden) return; try { ctl.peer && ctl.peer.destroy(); } catch (_) {} ctl.peer = null; ctl.conn = null; ctl.mode = null; $("#btn-host").disabled = false; };
    netStatus("Connecting…");
    ctl.peer = new Peer();
    ctl.peer.on("open", () => {
      const conn = ctl.peer.connect(`rova-pt-${code}`, { reliable: true });
      ctl.conn = conn;
      conn.on("open", () => {
        netStatus("Connected", "ok"); $("#join-msg").textContent = "Connected. Waiting for host…";
        conn.send({ t: "hello", name: myName(), deck: deckText(0), client: CLIENT_ID });
      });
      conn.on("data", (msg) => {
        if (!msg || typeof msg !== "object") return;
        if (msg.t === "view") { ctl.V = msg.v; if ($("#game").hidden) showGame(); render(); }
        else if (msg.t === "error") { $("#join-msg").textContent = msg.msg; toast(msg.msg); netStatus("Not joined", "bad"); giveUp(); }
      });
      conn.on("close", () => { if ($("#game").hidden) { giveUp(); return; } netStatus("Disconnected", "bad"); toast("Host disconnected"); });
    });
    ctl.peer.on("error", (e) => { netStatus("Couldn't connect", "bad"); $("#join-msg").textContent = e.type === "peer-unavailable" ? "No room with that code." : `Connection error: ${e.type || e}`; giveUp(); });
  }
  function solo() {
    const a = readDeck(0), b = readDeck(1); if (!a || !b) return;
    ctl.mode = "solo";
    ctl.S = newGame([a, b], [myName(), "Player 2"]); ctl.hist = [];
    ctl.soloActing = 0;
    showGame(); publish();
  }
  function showGame() { $("#lobby").hidden = true; $("#game").hidden = false; document.body.classList.add("in-game"); fitBoard(); }

  /* Size the cards so the whole board fits the screen without scrolling */
  function fitBoard() {
    const b = $(".board-wrap"); if (!b || $("#game").hidden) return;
    const H = b.clientHeight, W = b.clientWidth;
    let ch = innerWidth <= 1000 ? (W - 50) / 5.05 : Math.min((H - 150) / 7.98, (W - 50) / 5.05);
    ch = Math.max(40, Math.min(132, Math.floor(ch)));
    document.documentElement.style.setProperty("--ch", ch + "px");
  }

  /* =================================================================== */
  /* Lobby: deck pickers                                                  */
  /* =================================================================== */
  function myName() { return ($("#my-name").value.trim() || "Player 1").slice(0, 24); }
  function buildPicker(k) {
    const box = $(`#deck-pick-${k}`);
    const sel = el("select", { "aria-label": "Deck" });
    sel.append(el("option", { value: "paste", text: "Paste a decklist…" }));
    PRESETS.forEach((p, i) => sel.append(el("option", { value: String(i), text: p.name })));
    const ta = el("textarea", { rows: "10", placeholder: "Paste the decklist exported from the deck builder", "aria-label": "Decklist" });
    const sum = el("div", { class: "summary" });
    const saved = store.get(`rova-sim-deck-${k}`);
    if (saved) ta.value = saved; else if (PRESETS[k]) { sel.value = String(k); ta.value = PRESETS[k].list; }
    sel.addEventListener("change", () => { if (sel.value !== "paste") ta.value = PRESETS[+sel.value].list; update(); });
    ta.addEventListener("input", () => { sel.value = "paste"; update(); });
    function update() {
      store.set(`rova-sim-deck-${k}`, ta.value);
      if (!ta.value.trim()) { sum.textContent = "No deck yet."; sum.className = "summary bad"; return; }
      const d = parseDeck(ta.value);
      const zero = d.cards.filter((id) => REF[id].cost === 0).length;
      sum.textContent = `${d.name ? d.name + ": " : ""}${d.cards.length} summons (${zero} cost 0) · ${d.tokens.length} tokens${d.unknown.length ? ` · unknown: ${d.unknown.join(", ")}` : ""}`;
      sum.className = `summary${d.unknown.length || !d.cards.length || !d.tokens.length ? " bad" : ""}`;
    }
    box.replaceChildren(sel, ta, sum); update();
    box._ta = ta;
  }
  function deckText(k) { return $(`#deck-pick-${k}`)._ta.value; }
  function readDeck(k) {
    const d = parseDeck(deckText(k));
    if (!d.cards.length || !d.tokens.length) { toast(k === 0 ? "Deck needs summons and tokens" : "Player 2 deck needs summons and tokens"); return null; }
    return d;
  }

  /* =================================================================== */
  /* Rendering                                                            */
  /* =================================================================== */
  const ui = { pick: null };   // {kind:'slot'|'altar', side, filter, onPick, label}

  function img(o, small) {
    const ref = REF[o.ref];
    if (o.kind === "token") return o.down ? back("token") : face(ref);
    return o.down ? back("card") : face(ref);
  }

  function render() {
    const V = ctl.V; if (!V) return;
    const me = ctl.me, them = opp(me);
    renderBanner(V, me);
    renderSide($("#side-me"), V, me, true);
    renderSide($("#side-opp"), V, them, false);
    renderCentre(V, me);
    renderControls(V, me);
    renderHands(V, me);
    renderLog(V);
    renderPeek(V, me);
    renderAlert(V);
  }

  let lastAlert = 0;
  function renderAlert(V) {
    if (!V.alert || V.alert.n === lastAlert) return;
    lastAlert = V.alert.n;
    const box = $("#alert");
    $("#alert-text").textContent = V.alert.text;
    box.hidden = false; $("#alert-ok").focus();
  }

  function renderBanner(V, me) {
    const b = $("#banner"); b.replaceChildren();
    const parts = [];
    const req = V.undo && V.undo.req;
    if (ui.pick) parts.push(el("span", { text: ui.pick.label }), el("button", { text: "Cancel", onclick: () => { ui.pick = null; render(); } }));
    else if (req && req.by === me) parts.push(el("span", { text: `Waiting for approval to undo: ${req.label}` }), el("button", { text: "Cancel", onclick: () => act({ type: "undoCancel" }) }));
    else if (req) parts.push(el("span", { text: `${V.players[req.by].name} asks to undo: ${req.label}` }),
      el("button", { text: "Allow", onclick: () => act({ type: "undoAns", ok: true }) }), el("button", { text: "Refuse", onclick: () => act({ type: "undoAns", ok: false }) }));
    else {
      for (const p of [me, opp(me)]) {
        const n = V.players[p].pendingGen;
        if (!n) continue;
        const mine = p === me || ctl.mode === "solo";
        parts.push(el("span", { text: `${V.players[p].name}: generate ${n}` }));
        parts.push(el("button", { text: "Pick slot", onclick: () => startPick({ kind: "altar", side: p, label: `Pick a slot on ${V.players[p].name}'s altar`,
          onPick: (slot) => act({ type: "generate", player: p, slot, pending: true }) }) }));
        parts.push(el("button", { text: "Skip", onclick: () => act({ type: "skipGen", player: p }) }));
      }
      if (V.over) parts.push(el("span", { text: "Game over. Reset to replay." }));
    }
    b.hidden = !parts.length; b.append(...parts);
  }

  function zone(area, cls, label) { const z = el("div", { class: `zone ${cls || ""}`, style: `grid-area:${area}` }); if (label) z.append(el("span", { class: "lbl", text: label })); return z; }

  function objNode(V, iid, extra) {
    const o = V.objects[iid]; if (!o) return el("span");
    const ref = REF[o.ref];
    const n = el("span", { class: `obj${o.kind === "token" ? " tok" : ""}${o.rested ? " rested" : ""}${extra ? " " + extra : ""}`, title: o.down ? "Face down" : ref.name },
      o.down ? el("img", { src: img(o), alt: o.kind === "token" ? "Face-down token" : "Face-down card", draggable: "false" }) : tileFor(ref, o));
    if (V.attack && V.attack.to === iid) n.classList.add("attacked");
    if (V.attack && V.attack.from === iid) n.classList.add("attacker");
    if (o.kind === "token" && o.charge) n.append(el("span", { class: "chg", text: `${o.charge}/${ref.value}` }));
    if (!o.down) attachPreview(n, ref);
    return n;
  }

  // Board tiles: big readable text in the site theme; the full card shows on hover
  function tileFor(ref, o) {
    const t = (ref.arcanaType || "none").toLowerCase();
    if (ref.kind === "token") {
      return el("span", { class: `face ttile t-${t}${ref.special ? " special" : ""}` }, el("span", { class: "tin" },
        el("span", { class: "tv", text: ROMAN[ref.value] || String(ref.value) }),
        el("span", { class: "tn", text: ref.special ? ref.name.replace(/ Rune$/, "") : "Void" })));
    }
    return el("span", { class: `face ctile t-${t}` },
      el("span", { class: "ct-top" }, el("span", { class: "ct-cost", title: "Cost", text: ROMAN[ref.cost] ?? String(ref.cost) }), el("span", { class: "ct-lv", text: `Lv ${ref.level}` })),
      el("span", { class: "ct-name", text: ref.name }),
      el("span", { class: "ct-type", text: ref.cardType }),
      el("span", { class: "ct-stats", title: `Emission / Capacity${o && (o.em || o.cp) ? ` (base ${ref.emission}/${ref.capacity})` : ""}` },
        el("b", { class: o && o.em ? (o.em > 0 ? "up" : "down") : "", text: String(ref.emission + ((o && o.em) || 0)) }), el("i", { text: "/" }),
        el("b", { class: o && o.cp ? (o.cp > 0 ? "up" : "down") : "", text: String(ref.capacity + ((o && o.cp) || 0)) })));
  }

  function renderSide(root, V, p, mine) {
    root.replaceChildren();
    const P = V.players[p];
    // Void Altar
    const alt = zone("alt", "altar");
    const wrap = el("div", { class: "altar-wrap" });
    for (let k = 0; k < 3; k++) {
      const sl = P.altar[k]; const top = sl[sl.length - 1];
      const picking = ui.pick && ((ui.pick.kind === "altar" && ui.pick.side === p && (!ui.pick.filter || ui.pick.filter(k))) || (ui.pick.kind === "target" && top));
      const slot = el("div", { class: `aslot${picking ? " pickable" : ""}`, title: `Altar slot ${k + 1}` });
      if (top) slot.append(objNode(V, top));
      slot.addEventListener("click", (e) => {
        if (picking) { const f = ui.pick.onPick; const kind = ui.pick.kind; ui.pick = null; f(kind === "target" ? top : k); return; }
        if (top) menuAltarToken(e, V, p, top);
      });
      wrap.append(el("div", { class: "slotcol" }, slot, el("span", { class: "under", text: sl.length > 1 ? `+${sl.length - 1} below` : `slot ${k + 1}` })));
    }
    alt.append(wrap); root.append(alt);

    // Arena
    for (const s of SLOTS) {
      const quarter = QUARTER_SLOTS.includes(s);
      const z = zone(`s${s}`, quarter ? "quarter" : "", P.arena[s] ? null : SLOT_LABEL[s]);
      const iid = P.arena[s];
      const picking = ui.pick && ui.pick.side === p && ((ui.pick.kind === "slot" && !iid && (!ui.pick.filter || ui.pick.filter(s))) || (ui.pick.kind === "target" && iid));
      if (picking) z.classList.add("pickable");
      if (iid) z.append(objNode(V, iid, V.activeAbyss === iid ? "active-ring" : ""));
      z.addEventListener("click", (e) => {
        if (picking) { const f = ui.pick.onPick; const k = ui.pick.kind; ui.pick = null; f(k === "target" ? iid : s); return; }
        if (iid) menuArena(e, V, p, iid);
      });
      root.append(z);
    }
    // Token stack
    const stk = zone("stk", "pilezone");
    const sp = el("span", { class: `pile tokpile obj${P.stackCount ? "" : " empty"}` }, el("img", { class: "back", src: back("token"), alt: "Token stack" }), el("span", { class: "cnt", text: `Stack ${P.stackCount}` }));
    sp.addEventListener("click", (e) => menuStack(e, V, p));
    stk.append(sp); root.append(stk);
    // Stash
    const sta = zone("sta", "pilezone");
    const topT = P.stash[0];
    const stNode = topT ? objNode(V, topT, P.stashCount >= WIN_TARGET ? "win-glow" : "") : el("span", { class: "pile tokpile obj empty" }, el("img", { class: "back", src: back("token"), alt: "Empty stash" }));
    stNode.classList.add("pile"); stNode.append(el("span", { class: "cnt", text: `Stash ${P.stashCount}/${WIN_TARGET}` }));
    stNode.addEventListener("click", (e) => menuStash(e, V, p, topT));
    sta.append(stNode); root.append(sta);
    // Abyss
    const aby = zone("aby", "pilezone");
    const at = P.abyss[0];
    const an = at ? objNode(V, at, V.activeAbyss === at ? "active-ring" : "") : el("span", { class: "pile obj empty" }, el("img", { class: "back", src: back("card"), alt: "Empty abyss" }));
    an.classList.add("pile"); an.append(el("span", { class: "cnt", text: `Abyss ${P.abyss.length}` }));
    an.addEventListener("click", () => openAbyss(p));
    aby.append(an); root.append(aby);
    // Deck
    const dek = zone("dek", "pilezone");
    const dn = el("span", { class: `pile obj${P.deckCount ? "" : " empty"}` }, el("img", { class: "back", src: back("card"), alt: "Deck" }), el("span", { class: "cnt", text: `Deck ${P.deckCount}` }));
    dn.addEventListener("click", (e) => menuDeck(e, V, p));
    dek.append(dn); root.append(dek);
  }

  function renderCentre(V, me) {
    const c = $("#centre"); c.replaceChildren();
    const fra = el("div", { class: `fra${V.phase === "play" && V.altarUsed[V.turn] ? " used" : ""}`, title: "Fragment Recall Altar (shared)" });
    const target = ui.pick && ui.pick.kind === "target" && V.fra;
    if (target) fra.classList.add("pickable");
    if (V.fra) { const n = objNode(V, V.fra.iid); n.addEventListener("click", (e) => {
      if (ui.pick && ui.pick.kind === "target") { const f = ui.pick.onPick; ui.pick = null; f(V.fra.iid); return; }
      menuFra(e, V); }); fra.append(n); }
    c.append(fra, el("span", { class: "fra-lbl", text: "Fragment Recall Altar" }));
  }

  // Reset needs a second click within 3 seconds
  const resetArm = {};
  function sideStatus(P) {
    if (!P.setupDone) return "Needs setup";
    if (!P.vote) return "Needs vote";
    return P.ready ? "Ready" : "Not ready";
  }
  function sideBox(V, p, title) {
    const P = V.players[p], setup = V.phase === "setup";
    const extra = ctl.mode === "solo" ? { player: p } : {};
    const armed = resetArm[p] && Date.now() - resetArm[p] < 3000;
    const reset = el("button", { class: `danger-ghost${armed ? " armed" : ""}`, text: armed ? "Confirm?" : "Reset",
      title: "Everything back to deck and stack",
      onclick: () => {
        if (resetArm[p] && Date.now() - resetArm[p] < 3000) { resetArm[p] = 0; act({ type: "reset", ...extra }); return; }
        resetArm[p] = Date.now(); render(); setTimeout(() => { if (resetArm[p]) { resetArm[p] = 0; render(); } }, 3100);
      } });
    const btns = el("div", { class: "cgrid" });
    if (setup) btns.append(
      el("button", { class: P.setupDone ? "" : "primary", text: P.setupDone ? "Set up ✓" : "Setup", disabled: P.setupDone ? "" : false,
        title: "Shuffle, draw 4, reveal 3 tokens", onclick: () => act({ type: "setup", ...extra }) }),
      el("button", { class: P.setupDone && P.vote && !P.ready ? "primary" : "", text: P.ready ? "Not ready" : "Ready", disabled: P.setupDone && P.vote ? false : "",
        title: P.vote ? "" : "Vote first", onclick: () => act({ type: "ready", ...extra }) }));
    if (setup) {
      const vote = el("div", { class: "vote", role: "group", "aria-label": "Arcana Field vote" }, el("span", { class: "vlbl", text: "Field" }));
      for (const ch of ["Radiant", "Dormant"]) vote.append(el("button", { class: P.vote === ch ? "chosen" : "", text: ch, "aria-pressed": String(P.vote === ch),
        disabled: P.ready ? "" : false, title: P.ready ? "Unready to change" : `Vote ${ch}`, onclick: () => act({ type: "vote", choice: ch, ...extra }) }));
      btns.append(vote);
    }
    btns.append(reset);
    return el("section", { class: "cbox" }, el("h3", {}, document.createTextNode(title), el("span", { class: `status${P.ready ? " ok" : ""}`, text: setup ? sideStatus(P) : "" })), btns);
  }

  function renderControls(V, me) {
    const meP = V.players[me], O = V.players[opp(me)];
    const setup = V.phase === "setup", solo = ctl.mode === "solo";
    const myTurn = V.turn === me || solo;
    $("#turnbox").replaceChildren(
      el("div", { class: "who", text: setup ? "Setup" : `${V.players[V.turn].name}'s turn` }),
      el("div", { class: "sub2", text: setup ? "Set up · vote · Ready" : `Turn ${V.turnNo}${solo ? ` · as ${meP.name}` : (V.turn === me ? " · your turn" : "")}` }),
      el("div", { class: "cgrid" },
        el("div", { class: `fieldtag wide${V.field ? " locked" : ""}`, text: V.field ? `Field: ${V.field} 🔒` : "Field: by vote",
          title: V.field ? "Locked by vote" : "Set by vote" }),
        el("button", { class: "ghost", text: "Coin flip", onclick: () => act({ type: "coin" }) }),
        el("button", { class: "ghost", text: `Undo${V.undo && V.undo.count ? ` (${V.undo.count})` : ""}`, disabled: V.undo && V.undo.count && !V.undo.req ? false : "",
          title: V.undo && V.undo.count ? `Undo: ${V.undo.label}${ctl.mode === "solo" ? "" : " (opponent must allow)"}` : "Nothing to undo",
          onclick: () => act({ type: "undoReq" }) })));
    const box = $("#ctrlbox"); box.replaceChildren();
    if (!setup) box.append(el("section", { class: "cbox" }, el("h3", { text: V.step === "attack" ? "Attack phase" : "Summon phase" }), el("div", { class: "cgrid" },
      V.step === "attack"
        ? el("button", { class: "primary wide", text: "End turn", disabled: myTurn ? false : "", onclick: () => act({ type: "endTurn" }) })
        : el("button", { class: "primary wide", text: "Next phase", title: "Go to the attack phase. Summoning ends (Fragments still allowed).", disabled: myTurn ? false : "", onclick: () => act({ type: "nextPhase" }) }),
      el("button", { text: "Draw 1", onclick: () => act({ type: "draw", n: 1 }) }),
      el("button", { text: "Stand all", onclick: () => act({ type: "standAll" }) }),
      el("button", { class: "wide", text: `Win (${meP.stashCount}/${WIN_TARGET})`, disabled: V.altarUsed[me] ? "" : false, title: "Activate win · uses your altar this turn", onclick: () => act({ type: "activateWin" }) }),
      el("button", { class: "wide", text: meP.handRevealed ? "Hide hand" : "Reveal hand", onclick: () => act({ type: "revealHand" }) }))));
    if (setup) box.append(el("p", { class: "hint small", text: "Setup: shuffle, draw 4, reveal 3 tokens. Votes stay secret until both are Ready." }));
    box.append(sideBox(V, me, solo ? meP.name : "You"));
    if (solo) box.append(sideBox(V, opp(me), O.name));
    else box.append(el("p", { class: "hint small oppstat", text: `${O.name}: ${setup ? sideStatus(O) : "in game"}` }));
    if (solo) box.append(el("button", { class: "ghost wide", text: `Switch to ${O.name}`, onclick: () => { ctl.soloActing = opp(ctl.soloActing); publish(); } }));
  }

  function renderHands(V, me) {
    const mh = $("#my-hand"), oh = $("#opp-hand");
    mh.replaceChildren(el("span", { class: "lbl", text: `${V.players[me].name} · ${V.players[me].handCount}` }));
    for (const iid of V.players[me].hand) {
      const n = objNode(V, iid); n.addEventListener("click", (e) => menuHand(e, V, me, iid)); mh.append(n);
    }
    const O = V.players[opp(me)];
    oh.replaceChildren(el("span", { class: "lbl", text: `${O.name} · ${O.handCount}${O.handRevealed ? " · shown" : ""}` }));
    for (const iid of O.hand) {
      if (iid) { const n = objNode(V, iid); if (ctl.mode === "solo") n.addEventListener("click", (e) => menuHand(e, V, opp(me), iid)); oh.append(n); }
      else oh.append(el("img", { class: "back", src: back("card"), alt: "Card" }));
    }
  }

  let lastLogSeq = 0, lastChatSeq = 0, seenChat = 0;
  function renderLog(V) {
    const ol = $("#log"); ol.replaceChildren();
    let curTurn = null;
    for (const l of V.log) {
      if (l.kind === "turn") { ol.append(el("li", { class: "turn", text: l.text })); curTurn = l.turn; continue; }
      ol.append(el("li", { class: l.kind || "" }, el("span", { class: "step", text: `T${l.turn}·${l.n}` }), document.createTextNode(l.text)));
    }
    const newest = V.log.length ? V.log[V.log.length - 1].n : 0;
    if (newest !== lastLogSeq) { ol.scrollTop = ol.scrollHeight; lastLogSeq = newest; }
    // chat
    const cl = $("#chat"); cl.replaceChildren();
    for (const m of V.chat || []) {
      const mine = m.who === ctl.me && ctl.mode !== "solo";
      const t = new Date(m.at); const hh = String(t.getHours()).padStart(2, "0"), mm = String(t.getMinutes()).padStart(2, "0");
      cl.append(el("li", { class: `msg${mine ? " mine" : ""} p${m.who}` },
        el("span", { class: "meta", text: `${m.name} · ${hh}:${mm}` }), el("span", { class: "bubble", text: m.text })));
    }
    const cNewest = V.chat && V.chat.length ? V.chat[V.chat.length - 1].n : 0;
    if (cNewest !== lastChatSeq) {
      cl.scrollTop = cl.scrollHeight; lastChatSeq = cNewest;
      const last = V.chat[V.chat.length - 1];
      if (last && last.who !== ctl.me && ctl.mode !== "solo" && document.activeElement !== $("#say")) toast(`${last.name}: ${last.text.slice(0, 60)}`);
    }
  }

  /* ---------- menus ---------- */
  function openMenu(e, title, items) {
    e.stopPropagation();
    if (ctl.V && ctl.V.phase === "setup") { toast("Game not started yet"); return; }
    const m = $("#menu"); m.replaceChildren(el("div", { class: "mt", text: title }));
    for (const it of items) {
      if (!it) continue;
      if (Array.isArray(it[0])) { const r = el("div", { class: "rowb" }); for (const [t, f] of it) r.append(el("button", { text: t, onclick: () => { closeMenu(); f(); } })); m.append(r); }
      else m.append(el("button", { text: it[0], onclick: () => { closeMenu(); it[1](); } }));
    }
    m.hidden = false;
    const r = m.getBoundingClientRect();
    let x = e.clientX + 6, y = e.clientY + 6;
    if (x + r.width > innerWidth - 8) x = innerWidth - r.width - 8;
    if (y + r.height > innerHeight - 8) y = innerHeight - r.height - 8;
    m.style.left = Math.max(8, x) + "px"; m.style.top = Math.max(8, y) + "px";
  }
  function closeMenu() { $("#menu").hidden = true; }
  function startPick(p) { ui.pick = p; closeMenu(); render(); }

  function menuHand(e, V, p, iid) {
    const ref = REF[V.objects[iid].ref];
    const items = [];
    if (ref.cardType === "Fragment") items.push(["To Recall Altar", () => act({ type: "toAltar", iid })]);
    else if (V.step === "attack" && V.turn === p) items.push(["Summon (summon phase only)", () => toast("Summoning ended with the attack phase")]);
    else items.push(["Summon…", () => startPick({ kind: "slot", side: p, label: `Pick a slot for ${ref.name}`,
      filter: ref.cardType === "Quarter" ? (s) => QUARTER_SLOTS.includes(s) : null, onPick: (slot) => act({ type: "summon", iid, slot }) })]);
    items.push(["Sacrifice", () => act({ type: "sacrifice", iid })]);
    items.push([["Deck top", () => act({ type: "toDeck", iid, where: "top" })], ["Deck bottom", () => act({ type: "toDeck", iid, where: "bottom" })]]);
    openMenu(e, ref.name, items);
  }
  function menuArena(e, V, p, iid) {
    const o = V.objects[iid], ref = REF[o.ref];
    const canAttack = !o.rested && V.step === "attack" && p === V.turn && (p === ctl.me || ctl.mode === "solo");
    openMenu(e, `${ref.name} · ${stats(o).join("/")}${o.em || o.cp ? ` (base ${ref.emission}/${ref.capacity})` : ""}`, [
      canAttack ? ["Attack/Charge…", () => startPick({ kind: "target", side: opp(p), label: `Pick a summon or token for ${ref.name}`,
        onPick: (target) => act({ type: "attack", iid, target }) })] : null,
      [o.rested ? "Stand" : "Rest", () => act({ type: "rest", iid })],
      [["Emission +1", () => act({ type: "mod", iid, stat: "em", d: 1 })], ["−1", () => act({ type: "mod", iid, stat: "em", d: -1 })]],
      [["Capacity +1", () => act({ type: "mod", iid, stat: "cp", d: 1 })], ["−1", () => act({ type: "mod", iid, stat: "cp", d: -1 })]],
      o.em || o.cp ? ["Clear effects", () => act({ type: "mod", iid, clear: true })] : null,
      ["Move…", () => startPick({ kind: "slot", side: p, label: `Pick a slot for ${ref.name}`,
        filter: ref.cardType === "Quarter" ? (s) => QUARTER_SLOTS.includes(s) : null, onPick: (slot) => act({ type: "move", iid, slot }) })],
      ["Sacrifice", () => act({ type: "sacrifice", iid })],
      ["To hand", () => act({ type: "toHand", iid })],
      [["Deck top", () => act({ type: "toDeck", iid, where: "top" })], ["Deck bottom", () => act({ type: "toDeck", iid, where: "bottom" })]],
    ]);
  }
  function menuFra(e, V) {
    const iid = V.fra.iid, ref = REF[V.objects[iid].ref];
    openMenu(e, `${ref.name} · Fragment Recall Altar`, [
      ["Sacrifice", () => act({ type: "sacrifice", iid })],
      ["To hand", () => act({ type: "toHand", iid })],
    ]);
  }
  function menuAltarToken(e, V, p, iid) {
    const o = V.objects[iid], ref = REF[o.ref];
    openMenu(e, `${ref.name} · ${o.charge}/${ref.value}`, [
      [["+1", () => act({ type: "charge", iid, d: 1 })], ["+2", () => act({ type: "charge", iid, d: 2 })], ["+3", () => act({ type: "charge", iid, d: 3 })], ["+5", () => act({ type: "charge", iid, d: 5 })]],
      [["+7", () => act({ type: "charge", iid, d: 7 })], ["−1", () => act({ type: "charge", iid, d: -1 })], ["Reset", () => act({ type: "charge", iid, d: -999 })]],
      ["Claim", () => act({ type: "claim", iid })],
      ["Move…", () => startPick({ kind: "altar", side: p, filter: (k) => V.players[p].altar[k][V.players[p].altar[k].length - 1] !== iid,
        label: `Pick a slot on ${V.players[p].name}'s altar`, onPick: (slot) => act({ type: "moveToken", iid, slot }) })],
      ["Sacrifice", () => act({ type: "sacrifice", iid })],
    ]);
  }
  function menuStack(e, V, p) {
    openMenu(e, `${V.players[p].name}'s token stack · ${V.players[p].stackCount}`, [
      ["Generate…", () => startPick({ kind: "altar", side: p, label: `Pick a slot on ${V.players[p].name}'s altar`, onPick: (slot) => act({ type: "generate", player: p, slot }) })],
    ]);
  }
  function menuStash(e, V, p, top) {
    const P = V.players[p];
    openMenu(e, `${P.name}'s stash · ${P.stashCount}${top ? ` · top: ${REF[V.objects[top].ref].name}` : ""}`, [
      top ? ["Sacrifice top", () => act({ type: "sacrifice", iid: top })] : ["Empty", () => {}],
    ]);
  }
  function menuDeck(e, V, p) {
    const mine = p === ctl.me || ctl.mode === "solo";
    const items = [];
    if (mine) items.push([["Draw 1", () => act({ type: "draw", n: 1 })], ["Draw 2", () => act({ type: "draw", n: 2 })]]);
    items.push([["Peek 1", () => act({ type: "peek", owner: p, n: 1 })], ["2", () => act({ type: "peek", owner: p, n: 2 })], ["3", () => act({ type: "peek", owner: p, n: 3 })], ["4", () => act({ type: "peek", owner: p, n: 4 })]]);
    if (mine) items.push(["Shuffle", () => act({ type: "shuffle" })]);
    openMenu(e, `${V.players[p].name}'s deck · ${V.players[p].deckCount}`, items);
  }

  /* ---------- overlays: abyss and peek ---------- */
  let overlayKind = null;
  function openAbyss(p) { overlayKind = { t: "abyss", p }; drawOverlay(); }
  function closeOverlay() { overlayKind = null; $("#overlay").hidden = true; }
  function drawOverlay() {
    const V = ctl.V; if (!overlayKind || !V) return;
    const box = $("#overlay-box"); box.replaceChildren();
    if (overlayKind.t === "abyss") {
      const P = V.players[overlayKind.p];
      box.append(el("h2", { text: `${P.name}'s Void Abyss (${P.abyss.length})` }),
        el("p", { class: "hint", text: "Newest first. One active card across both Abysses. Dissipated stays face down." }));
      const g = el("div", { class: "ogrid" });
      for (const iid of P.abyss) {
        const o = V.objects[iid], ref = REF[o.ref];
        const active = V.activeAbyss === iid;
        const btns = el("div", { class: "btns" });
        if (!o.down) {
          btns.append(active ? el("button", { text: "Deactivate", onclick: () => act({ type: "abyssInactive", iid }) }) : el("button", { text: "Activate", onclick: () => act({ type: "abyssActive", iid }) }),
            el("button", { text: "Dissipate", onclick: () => act({ type: "dissipate", iid }) }));
          if (o.kind === "card") btns.append(el("button", { text: "To hand", onclick: () => act({ type: "toHand", iid }) }), el("button", { text: "Deck top", onclick: () => act({ type: "toDeck", iid, where: "top" }) }));
        }
        const card = el("div", { class: `ocard${o.down ? " down" : ""}` }, el("img", { src: img(o), alt: ref.name, class: active ? "active-ring" : "" }),
          el("span", { class: "hint", text: `${o.down ? "Dissipated" : ref.name}${active ? " · ACTIVE" : ""}` }), btns);
        if (!o.down) attachPreview(card.querySelector("img"), ref);
        g.append(card);
      }
      if (!P.abyss.length) g.append(el("p", { class: "hint", text: "Empty." }));
      box.append(g, el("div", { class: "dlg-actions" }, el("button", { text: "Close", onclick: closeOverlay })));
    }
    $("#overlay").hidden = false;
  }
  function renderPeek(V, me) {
    const pk = V.players[me].peek;
    if (overlayKind && overlayKind.t === "abyss") { drawOverlay(); return; }
    if (!pk) { if (overlayKind && overlayKind.t === "peek") closeOverlay(); return; }
    overlayKind = { t: "peek" };
    const box = $("#overlay-box"); box.replaceChildren();
    const ownerName = V.players[pk.owner].name;
    box.append(el("h2", { text: `Top of ${pk.owner === me ? "your" : ownerName + "'s"} deck` }),
      el("p", { class: "hint", text: "Leftmost is the top. Only you see these." }));
    const g = el("div", { class: "ogrid" });
    for (const iid of pk.iids) {
      const o = V.objects[iid]; if (!o) continue; const ref = REF[o.ref];
      const btns = el("div", { class: "btns" },
        el("button", { text: "Top", onclick: () => act({ type: "peekPut", iid, where: "top" }) }),
        el("button", { text: "Bottom", onclick: () => act({ type: "peekPut", iid, where: "bottom" }) }),
        pk.owner === me ? el("button", { text: "To hand", onclick: () => act({ type: "peekPut", iid, where: "hand" }) }) : null);
      const card = el("div", { class: "ocard" }, el("img", { src: face(ref), alt: ref.name }), el("span", { class: "hint", text: ref.name }), btns);
      attachPreview(card.querySelector("img"), ref);
      g.append(card);
    }
    box.append(g, el("div", { class: "dlg-actions" },
      el("button", { text: "Reveal", onclick: () => act({ type: "peekReveal" }) }),
      el("button", { class: "primary", text: "Done", onclick: () => act({ type: "peekClose" }) })));
    $("#overlay").hidden = false;
  }

  /* ---------- preview ---------- */
  const preview = $("#preview"), pimg = $("#preview-img");
  const canHover = window.matchMedia("(hover: hover)").matches;
  function attachPreview(node, ref) {
    if (!canHover) return;
    const src = insFace(ref) || face(ref), wide = Boolean(ref.inscription);
    node.addEventListener("mouseenter", () => { pimg.src = src; preview.classList.toggle("wide", wide); preview.hidden = false; });
    node.addEventListener("mousemove", (e) => {
      const w = wide ? 430 : 310, h = wide ? 215 : 440;
      let x = e.clientX + 18, y = e.clientY - h / 2;
      if (x + w > innerWidth) x = e.clientX - w - 18;
      y = Math.max(8, Math.min(y, innerHeight - h - 8));
      preview.style.left = x + "px"; preview.style.top = y + "px";
    });
    node.addEventListener("mouseleave", () => { preview.hidden = true; });
  }

  let toastTimer = null;
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2200); }

  function rerender() { if (ctl.V) { render(); if (overlayKind && overlayKind.t === "abyss") drawOverlay(); } }
  function wireTheme() {
    const btn = $("#btn-theme"); const order = ["auto", "dark", "light"]; const label = { auto: "Auto", dark: "Dark", light: "Light" };
    let cur = store.get("rova-theme"); if (cur !== "dark" && cur !== "light") cur = "auto";
    const apply_ = () => {
      if (cur === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = cur;
      btn.textContent = label[cur]; btn.title = `Theme: ${cur}`;
      try { if (cur === "auto") localStorage.removeItem("rova-theme"); else localStorage.setItem("rova-theme", cur); } catch (_) {}
    };
    btn.addEventListener("click", () => { cur = order[(order.indexOf(cur) + 1) % 3]; apply_(); rerender(); }); apply_();
    window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", rerender);
  }

  function wire() {
    wireTheme();
    const nmIn = $("#my-name"); nmIn.value = store.get("rova-sim-name") || ""; nmIn.addEventListener("input", () => store.set("rova-sim-name", nmIn.value));
    $("#btn-host").addEventListener("click", host);
    $("#btn-start-online").addEventListener("click", startOnline);
    $("#btn-copy-code").addEventListener("click", async () => { try { await navigator.clipboard.writeText($("#room-code").textContent); toast("Code copied"); } catch (_) { toast("Copy failed. Select the code."); } });
    $("#btn-join").addEventListener("click", join);
    $("#join-code").addEventListener("keydown", (e) => { if (e.key === "Enter") join(); });
    $("#btn-solo").addEventListener("click", solo);
    $("#alert-ok").addEventListener("click", () => { $("#alert").hidden = true; });
    $("#say-form").addEventListener("submit", (e) => { e.preventDefault(); const t = $("#say").value.trim(); if (t) act({ type: "say", text: t }); $("#say").value = ""; });
    document.addEventListener("click", (e) => { if (!$("#menu").contains(e.target)) closeMenu(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") { $("#alert").hidden = true; closeMenu(); if (ui.pick) { ui.pick = null; render(); } else if (overlayKind && overlayKind.t === "abyss") closeOverlay(); } });
    $("#overlay").addEventListener("click", (e) => { if (e.target.id === "overlay" && overlayKind && overlayKind.t === "abyss") closeOverlay(); });
    window.addEventListener("resize", fitBoard);
    window.addEventListener("beforeunload", (e) => { if (ctl.S || ctl.V) { e.preventDefault(); e.returnValue = ""; } });
  }

  Promise.all([
    fetch("data/cards.json?v=10").then((r) => r.json()),
    fetch("data/presets.json?v=2").then((r) => (r.ok ? r.json() : { presets: [] })).catch(() => ({ presets: [] })),
  ]).then(([data, pre]) => {
    DATA = data; PRESETS = pre.presets || [];
    for (const c of data.cards) { c.kind = "card"; REF[c.id] = c; }
    for (const t of data.tokens) { t.kind = "token"; REF[t.id] = t; }
    if (data.backs) { BACKS.card = data.backs.card || BACKS.card; BACKS.token = data.backs.token || BACKS.token; }
    BACKS_DARK = data.backsDark || null;
    wire(); buildPicker(0); buildPicker(1);
  }).catch(() => { toast("Card data failed to load"); });

  // exposed for automated tests only
  window.__rova = { parseDeck: (t) => parseDeck(t), ctl };
})();
