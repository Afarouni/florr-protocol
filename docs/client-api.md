# client API

florr's client exposes a handful of functions and globals that are genuinely useful for modding. None
of this is the network protocol, it's stuff the running client hands you directly.

## the `_Util_*` exports

These live on `window.Module`. The `_Util_Get*` ones return a `char*` (a pointer into the wasm heap),
so you read the string out yourself:

```js
function readCString(ptr) {
  var u = Module.HEAPU8, end = ptr >>> 0;
  while (u[end]) end++;
  return new TextDecoder().decode(u.subarray(ptr >>> 0, end));
}
```

| export | returns | notes |
|--------|---------|-------|
| `_Util_GetPetals()` | `char*` | newline-delimited JSON, one petal per line. 118 of them. dumped in `data/petals.json` |
| `_Util_GetMobs()` | `char*` | newline-delimited JSON, one mob per line. 73 of them. `data/mobs.json` |
| `_Util_GetTalents()` | `char*` | newline-delimited JSON, one talent per line. 96 of them. `data/talents.json` |
| `_Util_GeneratePetalImage(size, id, rarity)` | `char*` | a `data:image/png;base64,...` URL of the petal icon |
| `_Util_GenerateMobImage(size, id, rarity)` | `char*` | same, for a mob |
| `_Util_CalculateDropChance(a, b, c)` | `number` | a probability. args not fully pinned (see below) |
| `_Util_GetAssemblerMatrix()` | `char*` | returns the string `"nah dawg"`. the dev disabled this one. enjoy |

`_Util_CalculateDropChance(a, b, c)`: returns a number. From poking it, `a` looks like a mob id, `b`
like a rarity/tier, `c` like a drop index, e.g. `drop(1,0,0)` and `drop(1,0,1)` came back as
`0.4676` and `0.5324`, which sum to exactly `1.0`. I didn't pin down exactly what each arg is, so
poke at it on your own build.

Grabbing an icon is one line:

```js
readCString(Module._Util_GeneratePetalImage(64, 6, 1)); // -> "data:image/png;base64,iVBOR..."
```

`examples/dump-data.user.js` wraps all of this: run `dumpFlorrData()` in the console to download the
three JSON files, or `florrPetalIcon(id, rarity)` / `florrMobIcon(id, rarity)` for icons.

## the data shape

Petals look like this (per rarity, index 0 = common .. up the chain):

```json
{
  "id": 6,
  "sid": "stinger",
  "rarities": [
    { "tooltip": [["Petal/Attribute/Health", 8], ["Petal/Attribute/Damage", 25]], "reloadTime": 1000 },
    { "tooltip": [["Petal/Attribute/Health", 24], ["Petal/Attribute/Damage", 75]] }
  ]
}
```

Mobs carry a `drops` table and per-rarity stats:

```json
{ "id": 1, "sid": "rock", "drops": [{ "baseChance": 0.15, "type": 3 }],
  "rarities": [{ "tooltip": [["Mob/Attribute/HealthRange", 50, 100], ["Mob/Attribute/Damage", 10]], "exp": 1 }] }
```

The `tooltip` keys (`Petal/Attribute/Health`, ...) are i18n keys, not localized text. The `sid`
(`"stinger"`, `"rock"`) is the stable string id, use that. Localized display names aren't in this
data, they come from a separate language table (not dumped here yet).

## `window.cp6`

Connection control:

| call | does |
|------|------|
| `cp6.disconnect()` | drops the current game connection |
| `cp6.forceServerID(id)` | connect to a specific server id |
| `cp6.simulateContextLoss()` | forces a webgl context loss (for testing) |

## inventory counts (heap)

Your petal counts sit in the wasm heap as a flat `u32` array, 10 slots per petal (one per rarity):

```js
const STRIDE = 10;
const count = (base, id, rarity) => Module.HEAPU32[(base >> 2) + (id - 1) * STRIDE + rarity] || 0;
```

The base is part of the client's static data, so it's the same address for everyone on a given build.
That's why a hardcoded base reads any player's inventory on their own machine, not just whoever found
it. On the build I'm on it's `0x461518`. It can move when florr ships a new client, so don't lean on
the literal number across updates.

To tell whether your base is right (and to re-find it after an update), cross-check it against the
petal list from `_Util_GetPetals`: a rarity a petal doesn't have should read 0. If a slot that
shouldn't exist comes back non-zero, the base is wrong.

```js
// petals = parsed _Util_GetPetals() keyed by id
function baseLooksRight(base, petals) {
  let owned = 0;
  for (const id in petals) {
    const rar = petals[id].rarities || [];
    for (let r = 0; r < STRIDE; r++) {
      const c = count(base, +id, r);
      const exists = rar[r] && Object.keys(rar[r]).length > 0;
      if (!exists && c !== 0) return { ok: false };   // impossible slot has data -> wrong base
      if (c >= 5) owned++;
    }
  }
  return { ok: true, owned };
}
```

Same check finds the base on a new build: walk candidate addresses and keep the one where it passes.
Reading is fine. Writing isn't, the server owns the real counts, so poking values into the heap just
gets corrected on the next sync. Other live state (entity positions and so on) is in the heap too but
isn't mapped here.

## a caveat

This is a minified Emscripten build. The `_Util_*` export names have been stable across builds, but
nothing's guaranteed. If a name's gone, list `Object.keys(Module).filter(k => k.startsWith('_Util'))`
and see what's there.
