# florr-protocol

florr.io encrypts its websocket traffic. This repo is three things: **the cipher** (so you can read
that traffic), **the full game data** dumped straight out of the client as clean JSON, and **the
client-side API** you can build mods on top of.

florr is an M28 game (same author as diep.io and arras.io), so the cipher is the same family as
diep's. If you've gone through the diep protocol stuff ([ABCxFF/diepindepth](https://github.com/ABCxFF/diepindepth),
[cx88/diepssect](https://github.com/cx88/diepssect)) this will look familiar. I couldn't find the
florr side written down anywhere public, so here it is.

## the short version

Every packet is laid out like this:

```
[ byte 0    ]   type (serverbound: substituted through a table; clientbound: plaintext)
[ byte 1 .. ]   body, XOR'd with a 6-byte pad that repeats for the rest of the packet
```

Both directions use it. Serverbound (client -> server) and clientbound (server -> client) each have
their own pad, but the layout is identical and the XOR table is **6 bytes** long on both.

Other things worth knowing:

- The pad just repeats: `keystream[i] = pad[i % 6]` for the whole body.
- Byte 0 is the type and isn't XOR'd. Serverbound it's pushed through a substitution table 0-15
  times (diep's jump-table trick). Clientbound it just comes through as the plaintext type in
  everything I saw. Either way you leave byte0 alone and decode the body.
- Type `0x00` packets go out in the clear, no encryption. Same skip trick diep uses.
- Serverbound is **deterministic per build**: the pad sequence is identical on every connection,
  there is no per-connection nonce. Reconnect 10 times, you get the same stream. Clientbound looks
  the same but I leaned on it less, see the notes in [docs/cipher.md](docs/cipher.md).

## game data (petals, mobs, talents)

The client carries its entire database and hands it to you through `_Util_*` exports, so it's already
dumped here as clean JSON. No game needed, just open the files:

- [`data/petals.json`](data/petals.json) — 118 petals, per-rarity stats (health, damage, reload, passive flags, ...)
- [`data/mobs.json`](data/mobs.json) — 73 mobs, **drop tables** + per-rarity stats + exp
- [`data/talents.json`](data/talents.json) — 96 talents, costs and the dependency tree

To refresh them for a new build, run `dumpFlorrData()` from `examples/dump-data.user.js`. The rest of
what the client exposes (icon generators, the drop-chance calc, connection control) is written up in
[docs/client-api.md](docs/client-api.md).

## reading packets without reimplementing anything

You don't have to rebuild the cipher to read traffic. The game decrypts inbound packets **in place**
in its own heap, so the laziest correct approach is to let it do the work and read the buffer back
out afterwards. `examples/sniff.user.js` does exactly that. The how/why is in
[docs/cipher.md](docs/cipher.md).

## once it's decrypted

Decrypting gets you the plaintext bytes, but those are a binary format, not readable text. Turning
them into labeled fields ("this is the sequence number, this is an X position") is the packet layer,
and that's a work in progress in [docs/protocol.md](docs/protocol.md). `src/wire.js` reads the
primitives, `src/packets.js` parses what's mapped so far, and `examples/analyze-packets.js` gives you
the const / counter / varies byte map that's how you map the rest. Fields I haven't worked out are
left as raw bytes instead of getting made-up names.

## mod menu (example)

`mod-menu/` is a little Tampermonkey userscript built on the client data above. It's a florr-styled
petal and mob database browser: every petal and mob with its real in-game name and description (read
out of the client's own localization), the generated icons, per-rarity stats, search, sort, and a
rarity picker. Mob pages show the drop table, petal pages show what drops them.

It's here as an example of what the `_Util_*` data lets you build, not the point of the repo. It's
bare for now (just the browser), I might add more to it later.

Install it with [Tampermonkey](https://www.tampermonkey.net/): open
[mod-menu/florr-menu.user.js](https://raw.githubusercontent.com/Afarouni/florr-protocol/main/mod-menu/florr-menu.user.js)
and it'll offer to add it. Then open florr and click the logo button in the bottom-right, or press the
`` ` `` key. It checks florr's build hash on startup and warns you if the game updated past the build it
was last checked on, since heap offsets move between builds. More in [mod-menu/README.md](mod-menu/README.md).

## layout

```
data/petals.json            118 petals with per-rarity stats
data/mobs.json              73 mobs with drop tables + stats
data/talents.json           96 talents with costs + deps
docs/cipher.md              the cipher, in detail, with a worked example
docs/client-api.md          the _Util_* exports, cp6, reading the game's own data
docs/protocol.md            the packet layer on top of the cipher (work in progress)
src/cipher.js               recover the pad from a known pair, decrypt a body
src/wire.js                 little-endian binary reader (u8/u16/u32/f32/varint/...)
src/packets.js              parse a decrypted packet, labels what's mapped, raw for the rest
examples/dump-data.user.js  tampermonkey. dumps petals/mobs/talents JSON + grabs icons
examples/recover-pad.js     node. runs the cipher on the sample pairs, no game needed
examples/analyze-packets.js node. byte map (const / counter / varies) for a pile of packets
examples/sniff.user.js      tampermonkey. logs decrypted inbound packets live
samples/inbound-pairs.json  synthetic (ciphertext, cleartext) pairs shaped like the real thing
samples/decrypted-sample.json  synthetic decrypted packets for the analyzer
mod-menu/florr-menu.user.js    tampermonkey. florr-styled petal/mob database browser (example)
mod-menu/README.md             how to install the menu + what it does
mod-menu/screenshots/          the images used in that readme
```

## quick start

Offline, just to watch it decrypt:

```
node examples/recover-pad.js
```

In the game: drop `examples/sniff.user.js` into Tampermonkey, open florr, open the console.

## notes / disclaimer

These are reverse-engineering notes for people building their own florr stuff: custom clients, bots,
analytics, overlays, whatever. It's the client that runs on your own machine. Use your head and
respect florr's ToS.

Builds change. Function indices and heap addresses rotate basically every update. The cipher
*structure* doesn't, and that's all that's documented here. The scripts find the moving parts at
runtime, so they don't care what build you're on.

MIT, do what you want.

## Contact (Discord): @kw0d932
