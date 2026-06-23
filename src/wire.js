// binary reader for florr packets. little-endian (the game is LE, you can see it in the floats).
// this is just a generic toolkit, it makes no claims about which primitives florr uses where, that's
// what docs/protocol.md is for. works in node (require) and browser (window.florrWire).

(function (root) {
  'use strict';

  function Reader(bytes, off) {
    if (bytes instanceof ArrayBuffer) bytes = new Uint8Array(bytes);
    this.b = bytes;
    this.dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.o = off || 0;
  }

  Reader.prototype = {
    get left() { return this.b.length - this.o; },
    eof: function () { return this.o >= this.b.length; },
    skip: function (n) { this.o += n; return this; },
    seek: function (o) { this.o = o; return this; },

    u8: function () { return this.b[this.o++]; },
    i8: function () { var v = this.dv.getInt8(this.o); this.o += 1; return v; },
    u16: function () { var v = this.dv.getUint16(this.o, true); this.o += 2; return v; },
    i16: function () { var v = this.dv.getInt16(this.o, true); this.o += 2; return v; },
    u32: function () { var v = this.dv.getUint32(this.o, true); this.o += 4; return v; },
    i32: function () { var v = this.dv.getInt32(this.o, true); this.o += 4; return v; },
    f32: function () { var v = this.dv.getFloat32(this.o, true); this.o += 4; return v; },
    f64: function () { var v = this.dv.getFloat64(this.o, true); this.o += 8; return v; },

    // big-endian variants if you ever need them
    u16be: function () { var v = this.dv.getUint16(this.o, false); this.o += 2; return v; },
    u32be: function () { var v = this.dv.getUint32(this.o, false); this.o += 4; return v; },

    // LEB128 varints. M28 games tend to use these; whether/where florr actually does, I don't know,
    // so treat these as available tools, not a claim. see docs/protocol.md.
    vu: function () { var r = 0, s = 0, x; do { x = this.b[this.o++]; r += (x & 0x7f) * Math.pow(2, s); s += 7; } while (x & 0x80); return r; },
    vi: function () { var u = this.vu(); return (u >>> 1) ^ -(u & 1); }, // zigzag

    bytes: function (n) { var s = this.b.subarray(this.o, this.o + n); this.o += n; return s; },
    rest: function () { var s = this.b.subarray(this.o); this.o = this.b.length; return s; },

    // peek without advancing
    peek8: function (k) { return this.b[this.o + (k || 0)]; }
  };

  function hexToBytes(h) {
    h = h.replace(/\s+/g, '');
    var a = new Uint8Array(h.length / 2);
    for (var i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16);
    return a;
  }
  function bytesToHex(b) {
    var s = ''; for (var i = 0; i < b.length; i++) s += (b[i] & 0xff).toString(16).padStart(2, '0'); return s;
  }

  var api = { Reader: Reader, hexToBytes: hexToBytes, bytesToHex: bytesToHex };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.florrWire = api;
})(typeof self !== 'undefined' ? self : this);
