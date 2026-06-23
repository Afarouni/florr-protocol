// ==UserScript==
// @name         florr packet sniffer (inbound)
// @namespace    florr-protocol
// @match        https://florr.io/*
// @run-at       document-start
// @grant        none
// @version      0.1
// @description  logs decrypted inbound packets. see florr-protocol for how it works.
// ==/UserScript==

// the game copies each inbound packet's ciphertext into its wasm heap and decrypts it in place.
// we hook the copy to grab the heap address + the ciphertext, read the address back after the game
// decrypts, recover the 6-byte pad from the clean tail, and decrypt the whole body from the
// ciphertext we saved. no need to touch the cipher itself, the game does the work.

(function () {
  'use strict';
  var PERIOD = 6;

  function heap() { return (window.Module && window.Module.HEAPU8) || null; }

  // the copy into the heap is a typed-array .set(bytes, ptr). hook the SHARED typed-array prototype
  // so it catches the copy whichever heap view (HEAP8 / HEAPU8 / ...) the game used.
  var TA = Object.getPrototypeOf(Uint8Array.prototype);
  var origSet = TA.set;
  TA.set = function (src, off) {
    var ret = origSet.apply(this, arguments);
    try { onCopy(this, src, off); } catch (e) {}
    return ret;
  };

  function onCopy(dst, src, off) {
    var H = heap();
    if (!H || dst.buffer !== H.buffer) return;                 // dst must be the wasm heap
    if (!src || !src.buffer || src.buffer === H.buffer) return; // src must be external (the ws bytes)
    var len = src.length;
    if (len < 1 || len > 16384) return;
    var d = off >>> 0;

    var ct = new Uint8Array(len);                               // save ciphertext before it's decrypted
    for (var i = 0; i < len; i++) ct[i] = src[i] & 0xff;

    Promise.resolve().then(function () {                        // runs after the game decrypts in place
      var H2 = heap(); if (!H2) return;
      onPacket(ct, H2.subarray(d, d + len));
    });
  }

  // majority-vote the keystream by phase over the clean tail (the first ~16 bytes of the read-back
  // buffer are freelist garbage because it's been freed by now).
  function recoverPad(ct, pt) {
    var n = Math.min(ct.length, pt.length);
    var votes = []; for (var p = 0; p < PERIOD; p++) votes.push(Object.create(null));
    for (var i = 16; i < n; i++) { var ph = i % PERIOD, v = ct[i] ^ pt[i]; votes[ph][v] = (votes[ph][v] | 0) + 1; }
    var pad = new Uint8Array(PERIOD);
    for (var q = 0; q < PERIOD; q++) { var best = 0, bn = -1; for (var k in votes[q]) if (votes[q][k] > bn) { bn = votes[q][k]; best = +k; } pad[q] = best; }
    return pad;
  }

  function hex(b, n) {
    var s = '', m = n == null ? b.length : Math.min(n, b.length);
    for (var i = 0; i < m; i++) s += (b[i] & 0xff).toString(16).padStart(2, '0');
    return s;
  }

  function onPacket(ct, pt) {
    if (ct.length < 12) { console.log('%cIN ', 'color:#39f', ct.length + 'B', hex(ct)); return; } // too short to bother
    var pad = recoverPad(ct, pt);
    var dec = new Uint8Array(ct.length);
    dec[0] = ct[0];                                             // byte0 is the substituted type, leave it
    for (var i = 1; i < ct.length; i++) dec[i] = ct[i] ^ pad[i % PERIOD];
    console.log('%cIN ', 'color:#39f', ct.length + 'B',
      'type=' + ct[0].toString(16).padStart(2, '0'),
      'pad=' + hex(pad),
      hex(dec, 80));
  }

  // outbound: easy to grab the ciphertext on the wire, but the cleartext lives in the wasm before
  // encryption, so a JS-only script can't decrypt it here. logged raw so you can see the framing.
  var origSend = WebSocket.prototype.send;
  WebSocket.prototype.send = function (data) {
    try {
      var b = data instanceof ArrayBuffer ? new Uint8Array(data)
        : (ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : null);
      if (b && b.length) console.log('%cOUT', 'color:#f83', b.length + 'B', hex(b, 48), '(ciphertext)');
    } catch (e) {}
    return origSend.apply(this, arguments);
  };

  console.log('[florr-protocol] sniffer loaded. IN = decrypted inbound, OUT = raw outbound ciphertext.');
  console.log('[florr-protocol] heads up: a few non-packet heap copies can slip through as IN lines.');
})();
