// ==UserScript==
// @name         florr menu
// @namespace    florr-protocol
// @match        https://florr.io/*
// @run-at       document-idle
// @grant        none
// @version      0.1
// @description  florr.io mod menu. currently: a petal/mob database browser (real names, icons, stats, descriptions, search, sort, rarity).
// @homepageURL  https://github.com/Afarouni/florr-protocol
// @downloadURL  https://raw.githubusercontent.com/Afarouni/florr-protocol/main/mod-menu/florr-menu.user.js
// @updateURL    https://raw.githubusercontent.com/Afarouni/florr-protocol/main/mod-menu/florr-menu.user.js
// ==/UserScript==

(function () {
  'use strict';
  if (window.__florrMenu) return; window.__florrMenu = true;

  // florr's UI font is the bundled webfont "Game".
  const C = {
    panel: '#db9d5a', panelEdge: '#bd8444', panelDark: '#c98f4e',
    cell: '#b17f49', cellEdge: '#9c6f40', green: '#7eef6d', greenEdge: '#5fc94f',
    gray: '#9a9a9a', grayEdge: '#7c7c7c', red: '#cf5b5b', redEdge: '#b04a4a', ink: '#ffffff'
  };

  const KEY = 'florrMenuSettings';
  let S = {}; try { S = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { S = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
  const get = (k, d) => (k in S ? S[k] : d);
  const set = (k, v) => { S[k] = v; save(); };

  // ---- florr build version ------------------------------------------------------------------
  // florr serves a per-build hash (window.versionHash, also in the static.florr.io/<hash>/client.js
  // URL). it changes on every game update, so it's our signal for "the game changed under us".
  const KNOWN_VERSION = 'f73aca8408fb6cc409607f0ffe7c0e93aa88a4c5'; // build this menu was verified on
  function florrVer() {
    try { if (window.versionHash) return String(window.versionHash); } catch (e) {}
    const s = (document.querySelector('script[src*="static.florr.io"]') || {}).src || '';
    const m = s.match(/static\.florr\.io\/([a-f0-9]{8,})\//i); return m ? m[1] : '';
  }
  const VER = florrVer();
  const verShort = v => v ? v.slice(0, 7) : '?';

  // ---- styles -------------------------------------------------------------------------------
  const css = `
  #fm-root, #fm-root *, #fm-db, #fm-db *, #fm-fab, #fm-warn, #fm-warn * { box-sizing:border-box; font-family:'Game','Ubuntu',system-ui,sans-serif; }
  #fm-root { position:fixed; top:70px; left:24px; width:340px; z-index:2147483600; color:${C.ink};
    -webkit-text-stroke:0.6px #000; paint-order:stroke fill; user-select:none; }
  #fm-panel { background:${C.panel}; border:3px solid ${C.panelEdge}; border-bottom-width:6px; border-radius:9px;
    overflow:hidden; box-shadow:0 6px 0 rgba(0,0,0,.18),0 10px 24px rgba(0,0,0,.35); }
  #fm-head { display:flex; align-items:center; gap:8px; padding:9px 11px; cursor:grab; background:${C.panelDark}; }
  #fm-head.drag { cursor:grabbing; }
  #fm-title { font-size:18px; flex:1; } #fm-title small { font-size:11px; opacity:.8; -webkit-text-stroke:0; margin-left:6px; }
  #fm-tabs { display:flex; gap:5px; padding:8px 9px 0; }
  .fm-tab { flex:1; padding:6px 0; text-align:center; font-size:12.5px; cursor:pointer; border-radius:7px 7px 0 0;
    background:${C.cell}; border:2px solid ${C.cellEdge}; border-bottom:0; opacity:.72; }
  .fm-tab.on { opacity:1; background:${C.panel}; }
  #fm-body { padding:10px 11px 12px; min-height:96px; max-height:56vh; overflow-y:auto; }
  #fm-body::-webkit-scrollbar { width:8px; } #fm-body::-webkit-scrollbar-thumb { background:${C.cellEdge}; border-radius:4px; }
  .fm-row { display:flex; align-items:center; gap:10px; padding:7px 8px; margin:5px 0; background:${C.cell};
    border:2px solid ${C.cellEdge}; border-radius:8px; min-height:38px; }
  .fm-row .lbl { flex:1; font-size:13px; } .fm-row .lbl .sub { display:block; font-size:10.5px; opacity:.75; -webkit-text-stroke:0; }
  .fm-btn { background:${C.green}; border:0; border-bottom:3px solid ${C.greenEdge}; color:#fff; border-radius:7px;
    padding:6px 12px; font-size:12.5px; cursor:pointer; -webkit-text-stroke:0.5px #000; }
  .fm-btn.gray { background:${C.gray}; border-bottom-color:${C.grayEdge}; }
  .fm-btn.red { background:${C.red}; border-bottom-color:${C.redEdge}; }
  .fm-btn:active { transform:translateY(2px); border-bottom-width:1px; }
  .fm-soon { text-align:center; font-size:12px; opacity:.6; -webkit-text-stroke:0; padding:32px 10px; }
  .fm-note { text-align:center; font-size:10.5px; opacity:.75; -webkit-text-stroke:0; padding:8px 4px 2px; }
  .fm-note.warn { color:#ffd24a; opacity:.95; }
  .fm-x { width:24px; height:24px; border-radius:6px; background:${C.red}; border:0; border-bottom:3px solid ${C.redEdge};
    color:#fff; font-size:14px; cursor:pointer; -webkit-text-stroke:0.6px #000; line-height:1; }
  .fm-x:active { transform:translateY(2px); border-bottom-width:1px; }
  #fm-fab { position:fixed; right:18px; bottom:18px; width:50px; height:50px; border-radius:50%; z-index:2147483600;
    background:${C.panel}; border:3px solid ${C.panelEdge}; border-bottom-width:5px; cursor:pointer;
    display:flex; align-items:center; justify-content:center; font-size:24px; box-shadow:0 4px 10px rgba(0,0,0,.4); }
  #fm-fab:active { transform:translateY(2px); }

  /* ---- version-mismatch warning ---- */
  #fm-warn { position:fixed; inset:0; z-index:2147483646; display:flex; align-items:center; justify-content:center;
    background:rgba(0,0,0,.55); color:${C.ink}; -webkit-text-stroke:0.5px #000; }
  #fm-warn-box { width:min(440px,92vw); background:${C.panel}; border:3px solid ${C.panelEdge}; border-bottom-width:6px;
    border-radius:12px; padding:18px 22px 20px; box-shadow:0 16px 50px rgba(0,0,0,.6); text-align:center; }
  .fm-warn-title { font-size:20px; margin-bottom:12px; }
  .fm-warn-body { font-size:13px; -webkit-text-stroke:0; line-height:1.5; opacity:.95; }
  .fm-warn-body b { color:#ffe9b0; }
  .fm-warn-btns { display:flex; gap:10px; justify-content:center; margin-top:18px; }

  /* ---- database browser ---- */
  #fm-db { position:fixed; inset:0; z-index:2147483640; display:none; align-items:center; justify-content:center;
    background:rgba(0,0,0,.4); color:${C.ink}; }
  #fm-db.open { display:flex; }
  #fm-db-panel { width:min(900px,95vw); height:84vh; background:${C.panel}; border:3px solid ${C.panelEdge}; border-bottom-width:6px;
    border-radius:12px; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 14px 44px rgba(0,0,0,.55); }
  #fm-db-head { display:flex; align-items:center; gap:9px; padding:11px 13px; background:${C.panelDark};
    -webkit-text-stroke:0.6px #000; paint-order:stroke fill; position:relative; z-index:3; }
  .fm-dd { position:relative; }
  .fm-dd-btn { background:${C.cell}; border:2px solid ${C.cellEdge}; border-bottom-width:3px; border-radius:8px;
    padding:6px 10px; font-size:13px; cursor:pointer; display:flex; align-items:center; gap:7px; white-space:nowrap; }
  .fm-dd-arr { margin-left:auto; font-size:10px; opacity:.85; -webkit-text-stroke:0; padding-left:4px; }
  .fm-dd-list { position:absolute; top:calc(100% + 4px); left:0; min-width:100%; background:${C.panelDark};
    border:2px solid ${C.cellEdge}; border-radius:8px; padding:4px; display:none; z-index:20; max-height:280px;
    overflow-y:auto; box-shadow:0 8px 20px rgba(0,0,0,.45); }
  .fm-dd-list.show { display:block; }
  .fm-dd-item { display:flex; align-items:center; gap:8px; padding:6px 10px; border-radius:6px; cursor:pointer; font-size:13px; white-space:nowrap; }
  .fm-dd-item:hover { background:${C.cell}; }
  .fm-dd-dot { width:11px; height:11px; border-radius:50%; border:1px solid rgba(0,0,0,.5); flex:0 0 auto; -webkit-text-stroke:0; }
  .fm-dd-list::-webkit-scrollbar { width:8px; } .fm-dd-list::-webkit-scrollbar-thumb { background:${C.cellEdge}; border-radius:4px; }
  .fm-kind { display:flex; gap:4px; }
  .fm-kind span { padding:7px 16px; border-radius:8px; background:${C.cell}; border:2px solid ${C.cellEdge}; border-bottom-width:3px;
    cursor:pointer; opacity:.7; font-size:14px; -webkit-text-stroke:0.6px #000; }
  .fm-kind span.on { opacity:1; background:${C.green}; border-color:${C.greenEdge}; }
  #fm-db-search { background:${C.cell}; border:2px solid ${C.cellEdge}; border-radius:8px; color:#fff; padding:7px 10px;
    width:160px; font-size:13px; -webkit-text-stroke:0.5px #000; outline:0; }
  #fm-db-search::placeholder { color:rgba(255,255,255,.6); -webkit-text-stroke:0; }
  .fm-dsel { background:${C.cell}; color:#fff; border:2px solid ${C.cellEdge}; border-bottom-width:3px; border-radius:8px;
    padding:6px 9px; font-size:13px; cursor:pointer; -webkit-text-stroke:0.5px #000; }
  .fm-dsel option { background:${C.panelDark}; -webkit-text-stroke:0; }
  #fm-db-count { font-size:11px; opacity:.85; -webkit-text-stroke:0; min-width:54px; text-align:right; }
  #fm-db-x { width:28px; height:28px; font-size:15px; }
  #fm-db-grid { flex:1; overflow-y:auto; padding:13px; display:grid; gap:11px; align-content:start;
    grid-template-columns:repeat(auto-fill,minmax(132px,1fr)); }
  #fm-db-grid::-webkit-scrollbar,#fm-db-detail::-webkit-scrollbar { width:9px; }
  #fm-db-grid::-webkit-scrollbar-thumb,#fm-db-detail::-webkit-scrollbar-thumb { background:${C.cellEdge}; border-radius:5px; }
  .fm-card { position:relative; background:${C.cell}; border:2px solid ${C.cellEdge}; border-bottom-width:4px; border-radius:10px;
    padding:11px 8px 9px; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:5px; text-align:center; transition:transform .08s; }
  .fm-card:hover { transform:translateY(-2px); }
  .fm-card img { width:60px; height:60px; object-fit:contain; }
  .fm-card.baked img { width:84px; height:84px; }
  .fm-card.baked { justify-content:space-between; }
  .fm-card .nm { font-size:13.5px; line-height:1.1; }
  .fm-card .id { position:absolute; top:5px; left:7px; font-size:10px; opacity:.5; -webkit-text-stroke:0; }
  .fm-pills { display:flex; gap:5px; flex-wrap:wrap; justify-content:center; margin-top:1px; }
  .fm-pill { display:inline-flex; align-items:center; gap:3px; font-size:11px; padding:2px 7px; border-radius:7px;
    background:rgba(0,0,0,.26); border:1.5px solid rgba(0,0,0,.28); -webkit-text-stroke:0.5px #000; }
  .fm-pill .k { font-size:8.5px; opacity:.92; letter-spacing:.2px; }
  .fm-pill.hp { background:rgba(108,207,99,.34); border-color:rgba(60,140,55,.5); }
  .fm-pill.dmg { background:rgba(228,116,76,.36); border-color:rgba(170,70,40,.5); }
  .fm-pill.pas { opacity:.85; }
  .fm-dots { display:flex; gap:3px; flex-wrap:wrap; justify-content:center; }
  .fm-dot { width:8px; height:8px; border-radius:50%; border:1px solid rgba(0,0,0,.45); }
  .fm-dot.on { width:11px; height:11px; box-shadow:0 0 0 1.5px #fff; }
  #fm-db-detail { flex:1; overflow-y:auto; padding:16px 20px; display:none; }
  .fm-back { cursor:pointer; font-size:13px; background:${C.gray}; border-bottom:3px solid ${C.grayEdge}; border-radius:7px;
    padding:6px 13px; -webkit-text-stroke:0.5px #000; display:inline-block; }
  .fm-back:active { transform:translateY(2px); border-bottom-width:1px; }
  .fm-dtop { display:flex; gap:18px; align-items:center; margin-top:13px; }
  .fm-dtop img { width:116px; height:116px; object-fit:contain; background:rgba(0,0,0,.13); border-radius:12px; padding:8px; }
  .fm-dname { font-size:26px; } .fm-dsub { font-size:12px; opacity:.7; -webkit-text-stroke:0; margin-top:2px; }
  .fm-desc { font-size:13.5px; -webkit-text-stroke:0; opacity:.95; line-height:1.45; white-space:pre-line; margin:14px 0 2px; max-width:660px; }
  .fm-flag { display:inline-block; font-size:11px; -webkit-text-stroke:0; background:rgba(0,0,0,.2); border-radius:5px; padding:3px 8px; margin:5px 5px 0 0; }
  .fm-rtabs { display:flex; gap:6px; flex-wrap:wrap; margin:16px 0 10px; }
  .fm-rtab { padding:5px 12px; border-radius:7px; cursor:pointer; font-size:12.5px; border:2px solid rgba(0,0,0,.35); border-bottom-width:3px; -webkit-text-stroke:0.5px #000; }
  .fm-grid2 { display:grid; grid-template-columns:1fr 1fr; gap:7px 10px; }
  .fm-stat { display:flex; justify-content:space-between; padding:7px 11px; background:${C.cell}; border:2px solid ${C.cellEdge}; border-radius:8px; font-size:13px; }
  .fm-stat .v { -webkit-text-stroke:0; opacity:.95; }
  .fm-dh { font-size:12px; opacity:.7; -webkit-text-stroke:0; margin:18px 0 7px; text-transform:uppercase; letter-spacing:.6px; }
  .fm-drops { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:8px; }
  .fm-drop { display:flex; align-items:center; gap:9px; background:${C.cell}; border:2px solid ${C.cellEdge}; border-radius:8px; padding:7px; font-size:12.5px; }
  .fm-drop img { width:36px; height:36px; object-fit:contain; flex:0 0 auto; }
  .fm-drop .pct { font-size:11px; opacity:.7; -webkit-text-stroke:0; }
  `;
  document.head.appendChild(Object.assign(document.createElement('style'), { textContent: css }));

  // ---- game data (from the wasm's _Util_* exports + bundled localization) ---------------------
  function readCString(ptr) { const u = window.Module.HEAPU8; let e = ptr >>> 0; while (u[e]) e++; return new TextDecoder().decode(u.subarray(ptr >>> 0, e)); }
  let _petals = null, _mobs = null;
  function loadNd(fn) { const out = []; try { readCString(window.Module[fn]()).split('\n').forEach(l => { const s = l.trim(); if (s) try { out.push(JSON.parse(s)); } catch (e) {} }); } catch (e) {} return out; }
  // don't cache an EMPTY result: the menu can load before the game's Module is ready (race at
  // document-idle), so retry on each call until _Util_* returns real data, then cache it.
  function loadPetals() { if (!_petals || !_petals.length) _petals = (window.Module && window.Module._Util_GetPetals) ? loadNd('_Util_GetPetals') : []; return _petals; }
  function loadMobs() { if (!_mobs || !_mobs.length) _mobs = (window.Module && window.Module._Util_GetMobs) ? loadNd('_Util_GetMobs') : []; return _mobs; }

  // names + descriptions live in the wasm's localization DB (every language bundled; English is the first
  // block, so the first match for a key is English). read it straight out of the heap and cache.
  let _loca = null;
  function loca() {
    if (_loca && (Object.keys(_loca.petals).length || Object.keys(_loca.mobs).length)) return _loca; // retry until heap has data
    _loca = { petals: {}, mobs: {} };
    try {
      const u = window.Module.HEAPU8, L = u.length, dec = new TextDecoder();
      const idxOf = str => { const f = str.charCodeAt(0); for (let i = 0; i + str.length <= L; i++) { if (u[i] !== f) continue; let ok = 1; for (let j = 1; j < str.length; j++) if (u[i + j] !== str.charCodeAt(j)) { ok = 0; break; } if (ok) return i; } return -1; };
      const block = (prefix, into) => {
        const a = idxOf(prefix + '/'); if (a < 0) return;
        const chunk = dec.decode(u.subarray(a, Math.min(L, a + 200000)));
        // some entries (e.g. mjolnir) have a rarity-dependent name: a base "{#...}" template plus
        // per-rarity sub-keys (Petals/mjolnir/default/Name, .../unique/Name). capture both.
        const re = new RegExp(prefix + '\\/([a-z0-9_]+)(?:\\/([a-z0-9_]+))?\\/(Name|Description)=([^\\r\\n]*)', 'g'); let m;
        while ((m = re.exec(chunk))) {
          const s = m[1], sub = m[2], f = m[3].toLowerCase(), val = m[4], o = (into[s] = into[s] || {});
          if (sub) { const vs = (o.variants = o.variants || {}), v = (vs[sub] = vs[sub] || {}); if (v[f] == null) v[f] = val; }
          else if (o[f] == null) o[f] = val;
        }
      };
      block('Petals', _loca.petals); block('Mobs', _loca.mobs);
    } catch (e) {}
    return _loca;
  }
  const entryLoca = (kind, sid) => (kind === 'petals' ? loca().petals : loca().mobs)[sid] || {};
  const cleanDesc = d => d ? d.replace(/<n\/>/g, '\n').replace(/<[^>]+>/g, '').replace(/\{[^}]*\}/g, '').trim() : '';
  // resolve a name/description, handling rarity-dependent "{#...}" templates (mjolnir: Fragment / Mjölnir).
  function variantVal(kind, e, field, r) {
    const o = entryLoca(kind, e.sid); let v = o[field];
    if (v && v.indexOf('{#') !== -1) { const vs = o.variants || {}, rk = (RARITY[r] || '').toLowerCase(); v = (vs[rk] && vs[rk][field]) || (vs.default && vs.default[field]) || ''; }
    return v;
  }
  const dispName = (kind, e, r) => variantVal(kind, e, 'name', r == null ? maxR(e) : r) || pretty(e.sid);
  const descText = (kind, e, r) => cleanDesc(variantVal(kind, e, 'description', r == null ? maxR(e) : r));

  const RARITY = ['Common', 'Unusual', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Ultra', 'Super', 'Unique', 'Tier 9'];
  const RAR_COL = ['#7eef6d', '#ffe65d', '#4d52e3', '#861fde', '#de1f1f', '#1fdbde', '#ff2b75', '#2bffca', '#ff5500', '#888'];
  const pretty = s => String(s || '').split('_').map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
  const lastKey = k => String(k).split('/').pop();
  const niceLabel = k => lastKey(k).replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  const _ic = {};
  function tryIcon(fn, id, r) { try { return readCString(window.Module[fn](96, id, r)); } catch (e) { return ''; } }
  function petalIcon(id, r) { const k = 'p' + id + '.' + r; return k in _ic ? _ic[k] : (_ic[k] = tryIcon('_Util_GeneratePetalImage', id, r)); }
  function mobIcon(id, r) { const k = 'm' + id + '.' + r; return k in _ic ? _ic[k] : (_ic[k] = tryIcon('_Util_GenerateMobImage', id, r)); }
  function raritiesOf(e) { const out = []; (e.rarities || []).forEach((rr, r) => { if (rr && Object.keys(rr).length) out.push(r); }); return out.length ? out : [0]; }
  const maxR = e => raritiesOf(e).slice(-1)[0];
  const rarObj = (e, r) => (e.rarities || [])[r] || {};
  function attrVals(rr, name) { if (rr && rr.tooltip) for (const t of rr.tooltip) if (lastKey(t[0]) === name) return t.slice(1); return null; }
  const hpVals = rr => attrVals(rr, 'Health') || attrVals(rr, 'HealthRange');
  const lastNum = v => v ? +v[v.length - 1] : 0;
  const compact = n => { n = Math.round(+n); const a = Math.abs(n); if (a >= 1e6) return (Math.round(n / 1e5) / 10) + 'M'; if (a >= 1e4) return Math.round(n / 1e3) + 'k'; if (a >= 1e3) return (Math.round(n / 100) / 10) + 'k'; return '' + n; };
  const compactVals = v => v.map(compact).join('–');
  // tidy a value for the detail view: integers stay exact, floats round to 1 dp, non-numbers pass through.
  const fnum = x => { const n = +x; if (x === '' || x == null || !isFinite(n)) return x; return Number.isInteger(n) ? '' + n : '' + (Math.round(n * 10) / 10); };
  function statList(rr) {
    const out = [];
    if (rr && rr.tooltip) rr.tooltip.forEach(t => out.push([niceLabel(t[0]), t.slice(1).map(fnum).join(' – ')]));
    if (rr && rr.reloadTime != null) out.push(['Reload', fnum(rr.reloadTime / 1000) + 's']);
    if (rr && rr.exp != null) out.push(['EXP', '' + rr.exp]);
    return out;
  }
  // which rarity to show for an entry given the global selector ('max' or an index)
  function viewR(e) { const rs = raritiesOf(e); if (dbState.rar === 'max') return rs[rs.length - 1]; const r = +dbState.rar; return rs.includes(r) ? r : rs[rs.length - 1]; }

  // ---- database browser ----------------------------------------------------------------------
  const dbState = { kind: 'petals', q: '', sort: 'id', rar: 'max' };
  let dbEl = null, gridEl, detailEl, searchEl, sortSlot, rarSlot, countEl;

  // small custom dropdown so rarity items can carry a colour dot (native <select> can't do that).
  function dropdown(items, current, onPick) {
    const dd = document.createElement('div'); dd.className = 'fm-dd';
    const btn = document.createElement('div'); btn.className = 'fm-dd-btn';
    const list = document.createElement('div'); list.className = 'fm-dd-list';
    const dot = c => c ? `<span class="fm-dd-dot" style="background:${c}"></span>` : '';
    const draw = () => { const c = items.find(i => i.value === current) || items[0]; btn.innerHTML = dot(c.color) + `<span>${c.label}</span><span class="fm-dd-arr">▾</span>`; };
    items.forEach(it => { const el = document.createElement('div'); el.className = 'fm-dd-item'; el.innerHTML = dot(it.color) + `<span>${it.label}</span>`; el.onclick = ev => { ev.stopPropagation(); current = it.value; draw(); list.classList.remove('show'); onPick(it.value); }; list.appendChild(el); });
    btn.onclick = ev => { ev.stopPropagation(); list.classList.toggle('show'); };
    document.addEventListener('mousedown', ev => { if (!dd.contains(ev.target)) list.classList.remove('show'); });
    dd.append(btn, list); draw(); return dd;
  }

  function buildDB() {
    dbEl = document.createElement('div'); dbEl.id = 'fm-db';
    dbEl.innerHTML = `<div id="fm-db-panel">
      <div id="fm-db-head">
        <div class="fm-kind"><span data-k="petals">Petals</span><span data-k="mobs">Mobs</span></div>
        <input id="fm-db-search" placeholder="search…" spellcheck="false">
        <span id="fm-db-rar-slot"></span>
        <span id="fm-db-sort-slot"></span>
        <div style="flex:1"></div><span id="fm-db-count"></span>
        <button class="fm-x" id="fm-db-x">✕</button>
      </div>
      <div id="fm-db-grid"></div>
      <div id="fm-db-detail"></div>
    </div>`;
    document.body.appendChild(dbEl);
    gridEl = dbEl.querySelector('#fm-db-grid'); detailEl = dbEl.querySelector('#fm-db-detail');
    searchEl = dbEl.querySelector('#fm-db-search'); countEl = dbEl.querySelector('#fm-db-count');
    rarSlot = dbEl.querySelector('#fm-db-rar-slot'); sortSlot = dbEl.querySelector('#fm-db-sort-slot');
    ['keydown', 'keyup', 'keypress'].forEach(ev => dbEl.addEventListener(ev, e => e.stopPropagation()));
    dbEl.addEventListener('mousedown', e => { if (e.target === dbEl) closeDB(); });
    dbEl.querySelector('#fm-db-x').onclick = closeDB;
    dbEl.querySelectorAll('.fm-kind span').forEach(s => s.onclick = () => { dbState.kind = s.dataset.k; dbState.q = ''; searchEl.value = ''; renderDB(); });
    // florr swallows key events at the window, so the box never types on its own. preventDefault still
    // lets our own keydown run, so we maintain the value ourselves and re-filter.
    searchEl.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      let v = searchEl.value;
      if (e.key === 'Backspace') v = v.slice(0, -1);
      else if (e.key === 'Escape') { v = ''; searchEl.blur(); }
      else if (e.key.length === 1) v += e.key;
      else return;
      e.preventDefault(); searchEl.value = v; dbState.q = v.trim().toLowerCase(); renderGrid();
    });
    searchEl.addEventListener('paste', e => { e.stopPropagation(); e.preventDefault(); const t = ((e.clipboardData || window.clipboardData).getData('text') || ''); searchEl.value += t; dbState.q = searchEl.value.trim().toLowerCase(); renderGrid(); });
  }
  const showGrid = () => { detailEl.style.display = 'none'; gridEl.style.display = 'grid'; };
  const showDetail = () => { gridEl.style.display = 'none'; detailEl.style.display = 'block'; };

  function renderDB() {
    const k = dbState.kind, data = k === 'petals' ? loadPetals() : loadMobs();
    dbEl.querySelectorAll('.fm-kind span').forEach(s => s.classList.toggle('on', s.dataset.k === k));
    const opts = k === 'petals'
      ? [['id', 'ID'], ['name', 'Name'], ['rarity', 'Max rarity'], ['damage', 'Damage'], ['health', 'Health'], ['reload', 'Reload']]
      : [['id', 'ID'], ['name', 'Name'], ['health', 'Health'], ['damage', 'Damage'], ['exp', 'EXP']];
    if (!opts.some(o => o[0] === dbState.sort)) dbState.sort = 'id';
    sortSlot.innerHTML = '';
    sortSlot.appendChild(dropdown(opts.map(o => ({ value: o[0], label: 'Sort: ' + o[1] })), dbState.sort, v => { dbState.sort = v; renderGrid(); }));
    // rarity dropdown: Max + every tier present, each with its colour dot
    let top = 0; data.forEach(e => { const m = maxR(e); if (m > top) top = m; });
    if (dbState.rar !== 'max' && +dbState.rar > top) dbState.rar = 'max';
    const rarItems = [{ value: 'max', label: 'Max rarity' }];
    for (let r = 0; r <= top; r++) rarItems.push({ value: String(r), label: RARITY[r] || ('Tier ' + r), color: RAR_COL[r] || '#888' });
    rarSlot.innerHTML = '';
    rarSlot.appendChild(dropdown(rarItems, dbState.rar, v => { dbState.rar = v; renderGrid(); }));
    showGrid(); renderGrid();
  }

  function renderGrid() {
    const k = dbState.kind, data = k === 'petals' ? loadPetals() : loadMobs();
    let list = data.slice();
    if (dbState.q) { const q = dbState.q; list = list.filter(e => dispName(k, e).toLowerCase().includes(q) || String(e.sid).toLowerCase().includes(q) || String(e.id) === q); }
    const at = e => rarObj(e, viewR(e));
    const sortVal = {
      id: e => e.id, name: e => pretty(e.sid), rarity: e => maxR(e),
      damage: e => lastNum(attrVals(at(e), 'Damage')), health: e => lastNum(hpVals(at(e))),
      reload: e => rarObj(e, raritiesOf(e)[0]).reloadTime || 0, exp: e => at(e).exp || 0
    }[dbState.sort] || (e => e.id);
    if (dbState.sort === 'name') list.sort((a, b) => sortVal(a).localeCompare(sortVal(b)));
    else if (dbState.sort === 'id') list.sort((a, b) => a.id - b.id);
    else list.sort((a, b) => (sortVal(b) - sortVal(a)) || (a.id - b.id));
    countEl.textContent = list.length + ' / ' + data.length;
    gridEl.innerHTML = '';
    const frag = document.createDocumentFragment();
    list.forEach(e => {
      const r = viewR(e), rr = rarObj(e, r);
      const ic = k === 'petals' ? petalIcon(e.id, r) : mobIcon(e.id, r);
      const dots = raritiesOf(e).map(rx => `<span class="fm-dot${rx === r ? ' on' : ''}" style="background:${RAR_COL[rx] || '#aaa'}" title="${RARITY[rx] || rx}"></span>`).join('');
      const hpV = hpVals(rr), dmgV = attrVals(rr, 'Damage');
      let pills = '';
      if (hpV) pills += `<span class="fm-pill hp"><span class="k">HP</span>${compactVals(hpV)}</span>`;
      if (dmgV) pills += `<span class="fm-pill dmg"><span class="k">DMG</span>${compactVals(dmgV)}</span>`;
      if (!pills && e.isPassive) pills = `<span class="fm-pill pas">Passive</span>`;
      const baked = k === 'petals';  // petal icons already render the name; mob icons don't
      const card = document.createElement('div'); card.className = 'fm-card' + (baked ? ' baked' : '');
      const nm = baked ? '' : `<div class="nm">${dispName(k, e, r)}</div>`;
      card.innerHTML = `<span class="id">#${e.id}</span><img src="${ic}">${nm}<div class="fm-dots">${dots}</div>${pills ? `<div class="fm-pills">${pills}</div>` : ''}`;
      card.onclick = () => openDetail(e);
      frag.appendChild(card);
    });
    gridEl.appendChild(frag);
  }

  function openDetail(e) {
    const k = dbState.kind, rs = raritiesOf(e);
    let cur = viewR(e);
    showDetail(); detailEl.scrollTop = 0;
    function paint() {
      const rr = rarObj(e, cur);
      const ic = k === 'petals' ? petalIcon(e.id, cur) : mobIcon(e.id, cur);
      const flags = k === 'petals' ? [e.isPassive && 'Passive', rr.droppable && 'Droppable', rr.shoppable && 'Buyable'].filter(Boolean) : [];
      const stats = statList(rr);
      let drops = '';
      if (k === 'mobs') {
        const ds = e.drops || [];
        if (ds.length) drops = `<div class="fm-dh">Drops</div><div class="fm-drops">` + ds.map(dr => { const p = loadPetals().find(x => x.id === dr.type); return `<div class="fm-drop"><img src="${p ? petalIcon(p.id, raritiesOf(p)[0]) : ''}"><div>${p ? pretty(p.sid) : '#' + dr.type}<div class="pct">${(dr.baseChance * 100).toFixed(2)}% base</div></div></div>`; }).join('') + `</div>`;
      } else {
        const src = loadMobs().filter(m => (m.drops || []).some(dr => dr.type === e.id));
        if (src.length) drops = `<div class="fm-dh">Dropped by</div><div class="fm-drops">` + src.map(m => { const dr = m.drops.find(x => x.type === e.id); return `<div class="fm-drop"><img src="${mobIcon(m.id, raritiesOf(m)[0])}"><div>${pretty(m.sid)}<div class="pct">${(dr.baseChance * 100).toFixed(2)}% base</div></div></div>`; }).join('') + `</div>`;
      }
      detailEl.innerHTML = `<span class="fm-back">← back</span>
        <div class="fm-dtop"><img src="${ic}"><div>
          <div class="fm-dname">${dispName(k, e, cur)}</div>
          <div class="fm-dsub">#${e.id} · ${e.sid}</div>
          <div>${flags.map(f => `<span class="fm-flag">${f}</span>`).join('')}</div>
        </div></div>
        <div class="fm-desc"></div>
        <div class="fm-rtabs">${rs.map(r => `<span class="fm-rtab" data-r="${r}" style="background:${cur === r ? (RAR_COL[r] || '#888') : 'rgba(0,0,0,.16)'};border-color:${cur === r ? 'rgba(0,0,0,.4)' : 'rgba(0,0,0,.25)'}">${RARITY[r] || ('T' + r)}</span>`).join('')}</div>
        <div class="fm-grid2">${stats.length ? stats.map(s => `<div class="fm-stat"><span>${s[0]}</span><span class="v">${s[1]}</span></div>`).join('') : '<div class="fm-dsub">no listed stats at this rarity</div>'}</div>
        ${drops}`;
      detailEl.querySelector('.fm-desc').textContent = descText(k, e, cur);
      detailEl.querySelector('.fm-back').onclick = showGrid;
      detailEl.querySelectorAll('.fm-rtab').forEach(t => t.onclick = () => { cur = +t.dataset.r; paint(); });
    }
    paint();
  }

  function openDB(kind) {
    if (!window.Module || !window.Module._Util_GetPetals) { toast('game still loading…'); return; }
    dbState.kind = kind || dbState.kind;
    if (!dbEl) buildDB();
    dbEl.classList.add('open'); renderDB();
  }
  function closeDB() { if (dbEl) dbEl.classList.remove('open'); }

  // ---- menu tabs -----------------------------------------------------------------------------
  function row(label, sub, control) {
    const r = document.createElement('div'); r.className = 'fm-row';
    const l = document.createElement('div'); l.className = 'lbl'; l.innerHTML = label + (sub ? `<span class="sub">${sub}</span>` : '');
    r.append(l, control); return r;
  }
  function actionBtn(text, fn) { const b = document.createElement('button'); b.className = 'fm-btn'; b.textContent = text; b.onclick = fn; return b; }
  const soon = b => { const d = document.createElement('div'); d.className = 'fm-soon'; d.textContent = 'Coming soon.'; b.appendChild(d); };

  // placeholder tabs show "?"; Info holds the real database browser. id is internal, label is shown.
  const TABS = [
    { id: 't1', label: '?', render: soon },
    { id: 't2', label: '?', render: soon },
    { id: 't3', label: '?', render: soon },
    { id: 't4', label: '?', render: soon },
    { id: 'Info', label: 'Info', render: b => b.append(
        row('Petal database', (loadPetals().length || 118) + ' petals', actionBtn('Browse', () => openDB('petals'))),
        row('Mob database', (loadMobs().length || 73) + ' mobs', actionBtn('Browse', () => openDB('mobs')))) }
  ];

  // ---- toast ---------------------------------------------------------------------------------
  let toastEl;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.style.cssText = `position:fixed;left:50%;bottom:80px;transform:translateX(-50%);background:${C.panelDark};color:#fff;-webkit-text-stroke:0.5px #000;border:2px solid ${C.panelEdge};border-radius:8px;padding:8px 14px;font-family:'Game','Ubuntu',sans-serif;font-size:13px;z-index:2147483646;transition:opacity .25s;pointer-events:none;`; document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.style.opacity = '1'; clearTimeout(toastEl._t); toastEl._t = setTimeout(() => toastEl.style.opacity = '0', 1600);
  }

  // ---- menu shell (built only after the version gate) -----------------------------------------
  function buildMenu() {
    const mismatch = VER && VER !== KNOWN_VERSION;
    const foot = VER ? ('florr build ' + verShort(VER) + (mismatch ? ' ⚠ untested' : '')) : 'florr version unknown';
    const root = document.createElement('div'); root.id = 'fm-root';
    root.innerHTML = `<div id="fm-panel">
        <div id="fm-head"><div id="fm-title">florr menu<small>v0.1</small></div><button class="fm-x">&#10005;</button></div>
        <div id="fm-tabs"></div><div id="fm-body"></div>
        <div class="fm-note${mismatch ? ' warn' : ''}">${foot}</div>
      </div>`;
    document.body.appendChild(root);

    const tabsEl = root.querySelector('#fm-tabs'), bodyEl = root.querySelector('#fm-body');
    function renderTab(id) {
      const t = TABS.find(x => x.id === id) || TABS[TABS.length - 1];
      set('tab', t.id);
      [...tabsEl.children].forEach(el => el.classList.toggle('on', el.dataset.t === t.id));
      bodyEl.innerHTML = ''; t.render(bodyEl);
    }
    TABS.forEach(t => { const el = document.createElement('div'); el.className = 'fm-tab'; el.dataset.t = t.id; el.textContent = t.label; el.onclick = () => renderTab(t.id); tabsEl.appendChild(el); });
    renderTab(TABS.some(t => t.id === get('tab', 'Info')) ? get('tab', 'Info') : 'Info');

    // launcher: florr's logo (green keyed out of the apple-touch-icon)
    const fab = document.createElement('div'); fab.id = 'fm-fab'; document.body.appendChild(fab);
    (function () {
      const url = (document.querySelector('link[rel="apple-touch-icon"]') || document.querySelector('link[rel~="icon"]') || {}).href || 'https://florr.io/apple-touch-icon.png';
      const setImg = (src, extra) => fab.innerHTML = '<img src="' + src + '" draggable="false" style="width:36px;height:36px;object-fit:contain;pointer-events:none;' + (extra || '') + '">';
      const img = new Image();
      img.onload = function () {
        try {
          const s = img.naturalWidth || 180, cv = document.createElement('canvas'); cv.width = cv.height = s;
          const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, s, s);
          const d = cx.getImageData(0, 0, s, s), p = d.data, br = p[0], bg = p[1], bb = p[2];
          for (let i = 0; i < p.length; i += 4) { const dr = p[i] - br, dg = p[i + 1] - bg, db = p[i + 2] - bb; if (dr * dr + dg * dg + db * db < 70 * 70) p[i + 3] = 0; }
          cx.putImageData(d, 0, 0); setImg(cv.toDataURL());
        } catch (e) { setImg(url, 'border-radius:8px;'); }
      };
      img.onerror = () => fab.textContent = '🙂'; img.src = url;
    })();

    function show(v) { root.style.display = v ? '' : 'none'; fab.style.display = v ? 'none' : 'flex'; set('open', v); }
    root.querySelector('.fm-x').onclick = () => show(false);
    fab.onclick = () => show(true);
    show(get('open', true));
    window.addEventListener('keydown', e => { if (e.code === 'Backquote' && !e.repeat && (!dbEl || !dbEl.classList.contains('open'))) show(root.style.display === 'none'); });

    const head = root.querySelector('#fm-head'); let dx = 0, dy = 0, drag = false;
    head.addEventListener('mousedown', e => { drag = true; head.classList.add('drag'); dx = e.clientX - root.offsetLeft; dy = e.clientY - root.offsetTop; e.preventDefault(); });
    window.addEventListener('mousemove', e => { if (drag) { root.style.left = (e.clientX - dx) + 'px'; root.style.top = (e.clientY - dy) + 'px'; } });
    window.addEventListener('mouseup', () => { drag = false; head.classList.remove('drag'); });

    console.log('[florr menu] v0.1 loaded — build ' + verShort(VER) + (mismatch ? ' (UNTESTED build)' : '') + '. press ` or the logo to toggle.');
  }

  // ---- version gate: warn before running if florr updated past the build we verified ----------
  function showVersionWarning(onProceed) {
    const w = document.createElement('div'); w.id = 'fm-warn';
    w.innerHTML = `<div id="fm-warn-box">
      <div class="fm-warn-title">⚠ florr has updated</div>
      <div class="fm-warn-body">This menu was verified on build <b>${verShort(KNOWN_VERSION)}</b>, but florr is now running <b>${verShort(VER)}</b>.<br><br>An update can move the memory offsets and data this menu reads, so features may misbehave — and there's a small chance a new build changes what's detectable. Running on an untested build is at your own risk.</div>
      <div class="fm-warn-btns">
        <button class="fm-btn" id="fm-warn-no">Don't run</button>
        <button class="fm-btn red" id="fm-warn-run">Run anyway</button>
      </div></div>`;
    document.body.appendChild(w);
    w.querySelector('#fm-warn-no').onclick = () => { w.remove(); console.log('[florr menu] not running — version mismatch declined by user.'); };
    w.querySelector('#fm-warn-run').onclick = () => { set('ackVer', VER); w.remove(); onProceed(); };
  }

  if (VER && VER !== KNOWN_VERSION && VER !== get('ackVer')) showVersionWarning(buildMenu);
  else buildMenu();
})();
