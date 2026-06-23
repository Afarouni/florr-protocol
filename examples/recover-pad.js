// runs the cipher on the sample pairs. no game needed.
//   node examples/recover-pad.js
//
// for each (ciphertext, cleartext) pair it shows the keystream period, the recovered 6-byte pad,
// and checks that decrypt(ciphertext, pad) matches the game's decrypted buffer on the clean tail.
//
// the sample pairs are SYNTHETIC: generated to match the real packet shape (6-byte pad, plus the
// freelist garbage in the first ~16 bytes that you get from reading the freed buffer back) so the
// demo runs without real session traffic. the math is identical to live packets.
// each is 64 bytes (len is a plausible on-wire length); 64 bytes is plenty to recover the pad.

const fs = require('fs');
const path = require('path');
const C = require('../src/cipher.js');

const pairs = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'samples', 'inbound-pairs.json'), 'utf8'));
const hx = C.bytesToHex;

// show the period on the first pair so you can see the 6 spike
{
  const p = pairs[0];
  const ks = C.keystream(C.hexToBytes(p.ct), C.hexToBytes(p.pt));
  const ac = C.autocorr(ks, 14, 24);
  console.log('autocorrelation on pair[0] (lag: match%):');
  for (let lag = 1; lag <= 14; lag++) console.log('  lag ' + String(lag).padStart(2) + ': ' + (100 * ac[lag]).toFixed(0) + '%');
  console.log('-> period 6\n');
}

let ok = 0;
pairs.forEach((p, idx) => {
  const ct = C.hexToBytes(p.ct);
  const pt = C.hexToBytes(p.pt);
  const pad = C.recoverPad(ct, pt);
  const dec = C.decryptBody(ct, pad);

  // sanity: on the clean tail (past the freed-buffer header) our decrypt should equal what the
  // game decrypted. byte0 is the substituted type, skip it.
  let cmp = 0, eq = 0;
  for (let i = 24; i < Math.min(dec.length, pt.length); i++) { cmp++; if (dec[i] === pt[i]) eq++; }
  const match = cmp > 0 && eq === cmp;
  if (match) ok++;

  console.log(`pair[${idx}] len=${p.len} pad=${hx(pad)} tail-match=${eq}/${cmp}${match ? '' : '  <-- mismatch'}`);
  if (idx < 2) {
    console.log('   cipher : ' + hx(ct).slice(0, 64));
    console.log('   decrypt: ' + hx(dec).slice(0, 64) + '   (byte0 = raw substituted type)');
  }
});

console.log(`\n${ok}/${pairs.length} pairs decrypt clean.`);
