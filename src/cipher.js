// florr cipher helpers. the body is a 6-byte repeating XOR pad; byte0 is a substituted type.
// works in node (require) and in the browser (window.florrCipher).

(function (root) {
  'use strict';

  var PERIOD = 6;

  function hexToBytes(h) {
    h = h.replace(/\s+/g, '');
    var a = new Uint8Array(h.length / 2);
    for (var i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16);
    return a;
  }

  function bytesToHex(b) {
    var s = '';
    for (var i = 0; i < b.length; i++) s += (b[i] & 0xff).toString(16).padStart(2, '0');
    return s;
  }

  // keystream from a matched pair. ct = ciphertext, pt = the game's decrypted buffer.
  function keystream(ct, pt) {
    var n = Math.min(ct.length, pt.length);
    var ks = new Uint8Array(n);
    for (var i = 0; i < n; i++) ks[i] = ct[i] ^ pt[i];
    return ks;
  }

  // confirm the period. returns { lag: matchFraction } for lag 1..max.
  function autocorr(ks, max, from) {
    max = max || 24; from = from || 0;
    var out = {};
    for (var lag = 1; lag <= max; lag++) {
      var m = 0, t = 0;
      for (var i = from; i + lag < ks.length; i++) { t++; if (ks[i] === ks[i + lag]) m++; }
      out[lag] = t ? m / t : 0;
    }
    return out;
  }

  // recover the 6-byte pad from a pair. pt's first bytes can be garbage (freed buffer), so we fold
  // the keystream by phase over a tail region and take the majority value for each of the 6 phases.
  function recoverPad(ct, pt, opts) {
    opts = opts || {};
    var from = opts.from != null ? opts.from : 16; // skip the freelist-corrupted head
    var ks = keystream(ct, pt);
    var votes = []; for (var p = 0; p < PERIOD; p++) votes.push({});
    for (var i = from; i < ks.length; i++) {
      var ph = i % PERIOD, v = ks[i];
      votes[ph][v] = (votes[ph][v] || 0) + 1;
    }
    var pad = new Uint8Array(PERIOD);
    for (var ph2 = 0; ph2 < PERIOD; ph2++) {
      var best = -1, bestN = -1;
      for (var k in votes[ph2]) if (votes[ph2][k] > bestN) { bestN = votes[ph2][k]; best = +k; }
      pad[ph2] = best < 0 ? 0 : best;
    }
    return pad;
  }

  // decrypt the body with a known pad. byte0 is the substituted type, left as-is.
  // works on the original ciphertext, so freelist garbage in the read-back buffer is irrelevant.
  function decryptBody(ct, pad) {
    var out = new Uint8Array(ct.length);
    out[0] = ct[0];
    for (var i = 1; i < ct.length; i++) out[i] = ct[i] ^ pad[i % PERIOD];
    return out;
  }

  // encrypt the body the same way (XOR is symmetric). byte0 left as-is.
  function encryptBody(pt, pad) { return decryptBody(pt, pad); }

  var api = {
    PERIOD: PERIOD,
    hexToBytes: hexToBytes,
    bytesToHex: bytesToHex,
    keystream: keystream,
    autocorr: autocorr,
    recoverPad: recoverPad,
    decryptBody: decryptBody,
    encryptBody: encryptBody
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.florrCipher = api;
})(typeof self !== 'undefined' ? self : this);
