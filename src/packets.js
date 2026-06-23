// florr packet parser. takes a DECRYPTED packet (byte0 = type, see docs/cipher.md) and labels the
// bits I've worked out. anything not mapped yet comes back as a raw slice (mapped:false) instead of
// made-up field names. add parsers as the protocol map fills in (docs/protocol.md).

(function (root) {
  'use strict';
  var wire = (typeof require !== 'undefined') ? require('./wire.js') : root.florrWire;
  var Reader = wire.Reader, hex = wire.bytesToHex;

  // registry keyed by hex "type" or "type.subtype" (byte0, or byte0.byte1 when byte1 is a subtype).
  // e.g. '13.0' = type 0x13 subtype 0x00, '0' = type 0x00.
  var PARSERS = {};
  function def(key, fn) { PARSERS[key] = fn; }

  // ---- clientbound 0x13 0x00 : 37-byte per-entity update --------------------------------------
  // worked out from 5 consecutive packets (the counter ticks f3->f7). offsets are for the 37B
  // variant; the 0x13 0x01 variant is larger and laid out differently (not mapped yet).
  def('13.0', function (b) {
    if (b.length !== 37) return raw(b, '13.0', 'expected 37 bytes for this variant');
    var r = new Reader(b);
    r.skip(2);                          // [0]=0x13 type, [1]=0x00 subtype
    var seq = r.u8();                   // [2] sequence counter (increments each packet)
    var subHeader = hex(r.bytes(6));    // [3..8] constant: b9 bb 13 00 18 00
    var idA = r.u32();                  // [9..12] varies every packet (id or hash, meaning TBD)
    var marker = hex(r.bytes(6));       // [13..18] constant: 01 00 10 00 6b 5d
    var idB = r.u32();                  // [19..22] varies (id or hash, meaning TBD)
    var f0 = r.f32();                   // [23..26] constant ~26.56 in our capture (a fixed float)
    var tail = hex(r.rest());           // [27..] partly constant, partly small varying fields, TBD
    return {
      type: 0x13, subtype: 0x00, name: 'entity-update?', mapped: 'partial',
      seq: seq, subHeader: subHeader, idA: idA, marker: marker, idB: idB, f0: f0, tail: tail
    };
  });

  // ---- both directions: type 0x00 is a cleartext keepalive ------------------------------------
  def('0', function (b) { return { type: 0x00, name: 'keepalive', mapped: true, len: b.length }; });

  function raw(b, key, note) {
    return { type: b[0], subtype: b.length > 1 ? b[1] : null, key: key || ('0x' + b[0].toString(16)),
      name: 'unmapped', mapped: false, note: note || null, len: b.length, hex: hex(b) };
  }

  // parse a decrypted packet. dir is optional ('in' | 'out'), purely for your own bookkeeping.
  function parse(bytes, dir) {
    if (bytes instanceof ArrayBuffer) bytes = new Uint8Array(bytes);
    if (!bytes.length) return { type: null, name: 'empty', mapped: false };
    var t = bytes[0];
    var key2 = t.toString(16) + '.' + (bytes[1] != null ? bytes[1].toString(16) : '');
    var fn = PARSERS[key2] || PARSERS[t.toString(16)];
    var out = fn ? fn(bytes) : raw(bytes);
    out.dir = dir || null;
    return out;
  }

  var api = { parse: parse, def: def, PARSERS: PARSERS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.florrPackets = api;
})(typeof self !== 'undefined' ? self : this);
