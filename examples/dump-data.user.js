// ==UserScript==
// @name         florr data dumper
// @namespace    florr-protocol
// @match        https://florr.io/*
// @run-at       document-idle
// @grant        none
// @version      0.1
// @description  dumps florr's built-in game data (petals / mobs / talents) to JSON. run dumpFlorrData() in the console.
// ==/UserScript==

// florr ships its whole game database inside the client and exposes it through _Util_* exports.
// this just reads those, parses the newline-JSON they return, and downloads clean JSON files.
// it's how data/*.json in this repo was generated; run it yourself to refresh for a new build.

(function () {
  'use strict';

  function readCString(ptr) {            // the _Util_ funcs return a char* into the wasm heap
    var u = window.Module.HEAPU8, end = ptr >>> 0;
    while (u[end]) end++;
    return new TextDecoder().decode(u.subarray(ptr >>> 0, end));
  }
  function ndjson(s) { return s.trim().split('\n').filter(Boolean).map(function (l) { return JSON.parse(l); }); }
  function download(name, obj) {
    var blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  window.dumpFlorrData = function () {
    var M = window.Module;
    if (!M || !M._Util_GetPetals) { console.warn('[florr-protocol] Module/_Util not ready, wait for the game to load'); return; }
    var petals = ndjson(readCString(M._Util_GetPetals()));
    var mobs = ndjson(readCString(M._Util_GetMobs()));
    var talents = ndjson(readCString(M._Util_GetTalents()));
    console.log('[florr-protocol] petals', petals.length, 'mobs', mobs.length, 'talents', talents.length);
    download('petals.json', petals);
    download('mobs.json', mobs);
    download('talents.json', talents);
    return { petals: petals.length, mobs: mobs.length, talents: talents.length };
  };

  // bonus: grab a single icon as a PNG data URL, e.g. florrPetalIcon(6, 1) for a stinger at unusual
  window.florrPetalIcon = function (id, rarity, size) { return readCString(window.Module._Util_GeneratePetalImage(size || 64, id, rarity || 0)); };
  window.florrMobIcon = function (id, rarity, size) { return readCString(window.Module._Util_GenerateMobImage(size || 64, id, rarity || 0)); };

  console.log('[florr-protocol] data dumper ready. run dumpFlorrData() to download petals/mobs/talents JSON.');
  console.log('[florr-protocol] (your browser may ask to allow multiple file downloads.)');
})();
