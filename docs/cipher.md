# the cipher

Short version up front, details below.

```
packet = [ byte0 : type ][ byte1 .. : body ]

byte0      -> substituted through a 128-entry table, applied 0-15 times
byte1..    -> body[i] ^= pad[(i) % 6]      // 6-byte repeating pad
```

Same scheme both directions. Serverbound and clientbound each have their own pad and their own
table, but the shape is the same and the pad is 6 bytes long either way.

## the body (the easy part)

The body is a straight repeating XOR. Take any reasonably long packet, line up the ciphertext
against the cleartext, and XOR them. The result repeats with a period of 6. Here's a real clientbound
packet (an entity update), keystream = ciphertext XOR cleartext:

```
...68 a4 1a 6a 32 7e | 68 a4 1a 6a 32 7e | 68 a4 1a 6a 32 7e | 68 a4 1a 6a...
```

That 6-byte block `68 a4 1a 6a 32 7e` is the pad for that packet. Every packet gets a fresh one.
`keystream[i] = pad[i % 6]`, so once you have the 6 bytes you have the whole body.

How to confirm the period yourself: autocorrelation. For each lag, count how often
`keystream[i] == keystream[i+lag]`. You get clean spikes at 6, 12, 18, ... and noise everywhere
else. `examples/recover-pad.js` prints this.

The pad is full-entropy (looks like PRNG output, not a fixed table that's been shuffled), and it's
different on every packet. So you can't just record one pad and reuse it across packets. You either
recover it per packet from a known pair, or you read the cleartext straight out of memory (below).

## byte 0

Byte 0 is the packet type and it is not XOR'd. The two directions don't handle it the same way.

**Serverbound** runs it through a 128-entry substitution table (an s-box) some number of times, 0 to
15. Send the same packet type over and over and byte0 of the ciphertext takes exactly 16 distinct
values. That's the 16 possible repeat counts, so byte0 is `S^k(type)` for k in 0..15. Same jump-table
trick diep uses.

**Clientbound**, in everything I captured, byte0 just comes through as the plaintext type: `0x03` for
the big entity-update packet, `0x13` for the small per-entity ones, and so on, all stable per type. So
either the substitution isn't applied inbound or the repeat count is always 0. Leaving byte0 as-is
gives you the right type either way, which is what the sniffer does.

**Type `0x00`** goes out in the clear in both directions, no substitution, no XOR. diep does the same
skip. They show up as tiny `00` packets in and out (keepalives).

If you actually want the serverbound s-box you can rebuild it from a pile of type->ciphertext pairs,
or pull the table out of the wasm. For most tooling you don't need it: byte0 is a stable per-build
label for the type, so just group on it.

## serverbound is deterministic

The serverbound pad sequence is fixed per build. There's no per-connection nonce, no handshake seed.
I captured 10 separate connections (forced reconnects) and the per-packet pad stream was byte-for-byte
identical across all of them, lined up at a phase offset of +/-1 (that offset is just how many
connection/handshake packets go out before the first encrypted one).

Practical upshot: on a given build you can record the serverbound pad stream once (one pad per
outgoing packet, indexed by packet number) and replay it to decrypt or encrypt anything. It goes
stale when florr ships a new build.

Clientbound: I spent less time here, but the per-packet pads show long stretches that are constant
across packets and connections, which points the same way (deterministic, plus a lot of the cleartext
is static). I'd bet clientbound is deterministic the same way, but I didn't hammer on it.

## how to actually read traffic

Two ways.

### 1. let the game decrypt, read it back (easiest, build-independent)

This is what `examples/sniff.user.js` does and it's the move for inbound.

The inbound path lives in the JS glue, not in wasm. The websocket `onmessage` handler looks like
this (deminified names, but this is really it):

```js
function (c) {
  c = new Uint8Array(c.data);   // ciphertext off the wire
  var d = ba(c.length);         // malloc a buffer in the wasm heap
  Z.set(c, d);                  // copy the ciphertext to heap address d
  b.vh.push([1, d, c.length]);  // queue it
  Sa();                         // process: decrypt d in place, parse, free d
}
```

`Z` is the heap (a typed array view over `WebAssembly.Memory`). So the ciphertext gets copied into
the heap at `d`, and `Sa()` decrypts it **in place at d**, synchronously, then parses and frees it.

The trick: hook the copy. `Z.set(c, d)` is `TypedArray.prototype.set`, so if you hook that and watch
for "external array copied into the heap" you get both `d` and the ciphertext for free. Then read `d`
back in a microtask (after the current task, so after `Sa()` ran) and you've got the decrypted bytes.

One wrinkle: by the time your microtask runs, `d` has been freed, so the first ~16 bytes are
clobbered by the allocator's freelist header (you'll see a pointer that's roughly `d-8` sitting at
the front). The tail is clean cleartext though. To get the head back too, recover the 6-byte pad
from the clean tail and XOR it against the *original* ciphertext you grabbed at copy time. Now you
have the full clean body, freelist garbage doesn't matter, because you're XOR-ing the ciphertext you
saved, not the freed buffer.

`Z` is one of the heap views (HEAP8 / HEAPU8 / ...). Hook the shared typed-array prototype,
`Object.getPrototypeOf(Uint8Array.prototype).set`, not `Uint8Array.prototype.set`, so it catches the
copy whichever view the game used. (Hooking only `Uint8Array`'s set will silently miss it if `Z` is
an `Int8Array`.)

### 2. known-plaintext (good for understanding, and for outbound)

Grab a (ciphertext, cleartext) pair for the same packet and XOR them. That's the keystream. Pull the
6-byte pad out of the repeating part and you can decrypt any packet that shares it.

- Clientbound cleartext: read `d` after decrypt, as above.
- Serverbound cleartext: it exists in the wasm right before encryption (the function that hands the
  finished packet to the cipher). Hooking that needs wasm instrumentation, which is build-specific
  and out of scope here. If you just want the keystream, the heartbeat packet is nearly constant
  plaintext and makes a decent crib.

`src/cipher.js` has the pad recovery and body decrypt. `examples/recover-pad.js` runs it end to end
on the sample pairs.

## worked example

See `samples/inbound-pairs.json` for real pairs and `node examples/recover-pad.js` to watch:

1. keystream = ct XOR pt, period comes out as 6,
2. pad = the repeating 6 bytes,
3. decrypt(ct, pad) reproduces the cleartext (and matches the game's decrypted buffer on the clean
   tail, which is the sanity check).
