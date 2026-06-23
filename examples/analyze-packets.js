// the mapping workhorse. feed it a bunch of DECRYPTED packets (hex strings) and it groups them by
// type+subtype and prints, for each byte offset, whether it's constant, a counter, or varies. that
// "const / counter / varies" view is how you find field boundaries, see docs/protocol.md.
//
//   node examples/analyze-packets.js [file.json]
//
// input is a JSON array of hex strings (or {hex} objects). default is the synthetic sample. to map
// real traffic, capture decrypted packets with examples/sniff.user.js and drop them in a file.

const fs = require('fs');
const path = require('path');
const wire = require('../src/wire.js');

const file = process.argv[2] || path.join(__dirname, '..', 'samples', 'decrypted-sample.json');
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const pkts = raw.map(x => wire.hexToBytes(typeof x === 'string' ? x : x.hex));

// group by type.subtype (byte0 . byte1)
const groups = {};
for (const p of pkts) {
  if (!p.length) continue;
  const key = p[0].toString(16).padStart(2, '0') + '.' + (p.length > 1 ? p[1].toString(16).padStart(2, '0') : '--');
  (groups[key] = groups[key] || []).push(p);
}

const hx = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(' ');
function f32le(b, o) { return new DataView(b.buffer, b.byteOffset, b.byteLength).getFloat32(o, true); }

for (const key of Object.keys(groups).sort()) {
  const g = groups[key];
  const lens = [...new Set(g.map(p => p.length))];
  const n = Math.min(...g.map(p => p.length));
  console.log(`\n== type ${key}  (${g.length} packets, length ${lens.length === 1 ? lens[0] : lens.join('/') + ' -> analyzing first ' + n})`);

  // classify each offset
  const cls = []; // {k, kind, vals}
  for (let k = 0; k < n; k++) {
    const vals = g.map(p => p[k]);
    const distinct = [...new Set(vals)];
    let kind;
    if (distinct.length === 1) kind = 'const';
    else {
      // counter? consecutive +1 mod 256 across capture order
      let counter = g.length >= 3;
      for (let i = 1; i < vals.length; i++) if (((vals[i] - vals[i - 1]) & 0xff) !== 1) { counter = false; break; }
      kind = counter ? 'counter' : 'varies';
    }
    cls.push({ k, kind, val: vals[0], distinct: distinct.length });
  }

  // merge consecutive offsets of the same kind (const merges only if it's a contiguous stable run)
  let i = 0;
  while (i < cls.length) {
    const kind = cls[i].kind;
    let j = i;
    while (j + 1 < cls.length && cls[j + 1].kind === kind) j++;
    const a = i, b = j, span = b - a + 1;
    const label = a === b ? `[${a}]` : `[${a}-${b}]`;
    if (kind === 'const') {
      const bytes = g[0].slice(a, b + 1);
      let extra = '';
      if (span === 4) { const f = f32le(g[0], a); if (isFinite(f) && Math.abs(f) > 1e-3 && Math.abs(f) < 1e9) extra = `  (f32 ~${f.toFixed(2)})`; }
      console.log(`  ${label.padEnd(9)} const  ${hx(bytes)}${extra}`);
    } else if (kind === 'counter') {
      console.log(`  ${label.padEnd(9)} counter (+1 each packet)`);
    } else {
      console.log(`  ${label.padEnd(9)} varies (${span === 4 ? 'maybe an id/float, ' : ''}${cls[a].distinct}+ values)`);
    }
    i = j + 1;
  }
}
console.log('\ndone. const = structure, counter = sequence, varies = data. correlate the "varies" runs');
console.log('with in-game actions (move, take damage, ...) to figure out what each one means.');
