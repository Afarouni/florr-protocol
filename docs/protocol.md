# protocol map

This is the packet layer that sits on top of the cipher. It's a **work in progress** and always will
be (builds change, and you map it one field at a time). Everything here came out of actual packets;
where I don't know what a field is, I left it blank instead of making something up.

If a packet table looks thin, that's because field maps are *earned*: you capture a bunch of the same
packet, line them up, see which bytes hold still and which move, then poke the game and watch which
moving bytes react. The tools below do the lining-up part.

> First decrypt. This doc assumes you already have the plaintext bytes (see [cipher.md](cipher.md)).
> `byte 0` is the packet type. For clientbound it's the plaintext type; for serverbound it's
> substituted, but you usually work clientbound for a reader.

## encoding

What we've actually seen in the bytes:

- **little-endian**. floats are IEEE-754 `float32`, LE. e.g. `0b 88 d4 41` reads as `26.566`.
- integers are fixed-width LE (`u8` / `u16` / `u32`) in the spots mapped so far.
- M28's other games lean on LEB128 varints; whether florr uses them anywhere, I haven't seen, so
  `src/wire.js` gives you `vu`/`vi` as tools but the maps below don't assume them yet.

## framing

```
[ byte0 = type ] [ byte1 = subtype/flag (some types) ] [ body ]
```

- `type 0x00` is a 1-byte **keepalive**, sent in the clear both directions.
- some types use `byte1` as a subtype that changes the whole layout. `0x13` is the clear example:
  `0x13 0x00` is a 37-byte packet (mapped below), `0x13 0x01` is bigger and laid out differently.

## status

| dir | type | name (guess) | status |
|-----|------|--------------|--------|
| both | `0x00` | keepalive | done |
| C→S | `0x13.00` | per-entity update? | **partial** (below) |
| C→S | `0x13.01` | larger entity update? | seen, not mapped |
| C→S | `0x03` | world/full update | seen (~1.2 KB), not mapped |
| (matchmaking) | `0x7b` | server list | it's just JSON, and unencrypted |
| S→C | `0x02` | heartbeat | structure only |
| S→C | `0x01` | input / commands | structure only |

`C→S` = clientbound (server to client), `S→C` = serverbound (client to server). The `0x7b` "packet"
is from the matchmaking connection, not the game server, and it's plain JSON (`{"servers":{...}}`).

## clientbound `0x13 0x00` (37 bytes) — partial

Mapped from runs of consecutive packets (the sequence counter at offset 2 ticking up by one is how we
know the decrypt and the alignment are right). Run `examples/analyze-packets.js` to reproduce this.

```
off   bytes              meaning
0     13                 type
1     00                 subtype
2     ..                 sequence counter (increments every packet)
3-8   b9 bb 13 00 18 00  constant sub-header (subtype-specific, exact meaning TBD)
9-12  ..                 varies every packet  (an id or hash, meaning TBD)
13-18 01 00 10 00 6b 5d  constant marker
19-22 ..                 varies every packet  (an id or hash, meaning TBD)
23-26 0b 88 d4 41        constant float ~26.56 in this capture (a fixed size/coord?)
27-29 01 00 00           constant
30-32 ..                 small varying field(s)
33    00                 constant
34    ..                 varies
35-36 00 00              constant
```

`src/packets.js` parses this one and returns the labeled fields plus the raw `tail`. Everything still
marked "varies / TBD" is a job for a capture session: move around, take damage, etc., and see which of
those bytes track which thing.

## serverbound (structure only)

Less mapped, and the specifics drift between builds, so this is deliberately just the shape:

- `0x00` keepalive (clear).
- `0x02` heartbeat, sent on a timer.
- `0x01` command/input packets. These carry a per-tick counter and an opcode byte that selects the
  action (movement, menu/craft actions, etc.). Exact opcodes and offsets are build-specific, so
  re-derive them on your build before relying on them rather than trusting a number written here.

## how to map more

1. capture decrypted packets with `examples/sniff.user.js` (it prints them; collect a bunch of the
   same type into a JSON array of hex strings).
2. `node examples/analyze-packets.js yourfile.json` to get the const / counter / varies breakdown.
3. do **one** thing in game (move only, or sit still and take one hit) and diff: the bytes that moved
   are that thing. write it down here, add it to `src/packets.js`, send a PR.
