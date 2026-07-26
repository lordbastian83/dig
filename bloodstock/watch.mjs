/* Catalogue watcher — checks sale pages daily and reports when one changes
   (i.e. a catalogue has dropped or lots were published).

   No Telegram, no external services: when a change is detected this script
   writes changes.txt, and the workflow opens a GitHub issue — GitHub then
   emails you natively. State (content hashes per URL) lives in
   watch-state.json, committed to the data branch so a change reports once. */

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const STATE_FILE = process.env.STATE_FILE || 'watch-state.json';
const CHANGES_FILE = process.env.CHANGES_FILE || 'changes.txt';

const WATCH = [
  { key: 'tatts-autumn-hit',
    url: 'https://www.tattersalls.com/sales/autumn-horses-in-training-sale/overview/',
    label: 'Tattersalls Autumn HIT Sale page' },
  { key: 'arqana-autumn',
    url: 'https://www.arqana.com/',
    label: 'Arqana site (Autumn Sale window)' },
  { key: 'tatts-online',
    url: 'https://www.tattersallsonline.com/',
    label: 'Tattersalls Online (monthly sales)' },
];

let state = {};
try { state = JSON.parse(readFileSync(STATE_FILE, 'utf8')); } catch { /* first run */ }
state.hashes = state.hashes || {};

const changes = [];
for (const w of WATCH) {
  try {
    const res = await fetch(w.url, { headers: { 'user-agent': 'Mozilla/5.0 (bloodstock-watch)' } });
    const text = (await res.text())
      .replace(/<script[\s\S]*?<\/script>/gi, '')   // ignore script noise
      .replace(/\s+/g, ' ');
    const hash = createHash('sha256').update(text).digest('hex').slice(0, 16);
    const prev = state.hashes[w.key];
    if (prev && prev !== hash) changes.push(w);
    if (!prev) console.log(`${w.key}: baseline recorded`);
    state.hashes[w.key] = hash;
    console.log(`${w.key}: ${hash}${prev && prev !== hash ? '  << CHANGED' : ''}`);
  } catch (e) {
    console.error(`${w.key}: ${e.message}`); // network blip — keep old hash
  }
}

if (changes.length) {
  writeFileSync(CHANGES_FILE, changes.map((c) => `- **${c.label}**\n  ${c.url}`).join('\n'));
  console.log(`${changes.length} change(s) → ${CHANGES_FILE}`);
} else {
  console.log('no changes');
}

writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
