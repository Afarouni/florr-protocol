# florr-protocol

florr.io encrypts its websocket traffic. This is a writeup of how that encryption works, plus a few
scripts to read the traffic yourself.

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

## reading packets without reimplementing anything

You don't have to rebuild the cipher to read traffic. The game decrypts inbound packets **in place**
in its own heap, so the laziest correct approach is to let it do the work and read the buffer back
out afterwards. `examples/sniff.user.js` does exactly that. The how/why is in
[docs/cipher.md](docs/cipher.md).

## layout

```
docs/cipher.md            the cipher, in detail, with a worked example
src/cipher.js             small helper: recover the pad from a known pair, decrypt a body
examples/recover-pad.js   node. runs the whole thing on the sample pairs, no game needed
examples/sniff.user.js    tampermonkey. logs decrypted inbound packets live
samples/inbound-pairs.json  synthetic (ciphertext, cleartext) pairs shaped like the real thing
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
