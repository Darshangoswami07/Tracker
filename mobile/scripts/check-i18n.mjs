/**
 * i18n coverage check — run with `npm run i18n:check`.
 *
 *  1. Every locale (en / hi / hinglish) must expose the exact same set of keys.
 *  2. Every static `t('key')` / `t("key")` referenced in src/ must exist in en.json.
 *  3. Reports (does not fail on) keys defined in en.json that no source file
 *     references, so dead keys can be pruned deliberately.
 *
 * Dynamic keys (template literals, variables) can't be checked statically and
 * are skipped — keep those rare.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const i18nDir = join(root, 'src', 'i18n');
const LOCALES = ['en', 'hi', 'hinglish'];

const flatten = (obj, prefix = '', out = {}) => {
  for (const [k, v] of Object.entries(obj)) {
    const nk = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, nk, out);
    else out[nk] = v;
  }
  return out;
};

const locales = Object.fromEntries(
  LOCALES.map((l) => [l, flatten(JSON.parse(readFileSync(join(i18nDir, `${l}.json`), 'utf8')))]),
);

const allKeys = new Set();
for (const map of Object.values(locales)) for (const k of Object.keys(map)) allKeys.add(k);

let errors = 0;

// 1. key parity across locales
for (const [locale, map] of Object.entries(locales)) {
  const missing = [...allKeys].filter((k) => !(k in map)).sort();
  if (missing.length) {
    errors += missing.length;
    console.error(`\n✗ ${locale}.json is missing ${missing.length} key(s):`);
    for (const k of missing) console.error(`    ${k}`);
  }
}

// 2. static t('…') references must exist in en.json
const walk = (dir, files = []) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'i18n') walk(p, files);
    } else if (['.ts', '.tsx'].includes(extname(entry.name))) {
      files.push(p);
    }
  }
  return files;
};

const TCALL = /\bt\(\s*(['"])([A-Za-z0-9_.]+)\1/g;
const PLURAL_SUFFIXES = ['_zero', '_one', '_two', '_few', '_many', '_other'];
const referenced = new Set();
const unknownRefs = [];
for (const file of walk(join(root, 'src'))) {
  const src = readFileSync(file, 'utf8');
  let m;
  while ((m = TCALL.exec(src))) {
    const key = m[2];
    referenced.add(key);
    const pluralOk = PLURAL_SUFFIXES.some((s) => `${key}${s}` in locales.en);
    if (!(key in locales.en) && !pluralOk) unknownRefs.push({ file: file.replace(root, '.'), key });
  }
}
if (unknownRefs.length) {
  errors += unknownRefs.length;
  console.error(`\n✗ ${unknownRefs.length} t('…') reference(s) with no key in en.json:`);
  for (const { file, key } of unknownRefs) console.error(`    ${key}   (${file})`);
}

// 3. informational: unreferenced en keys
const unused = [...Object.keys(locales.en)]
  .filter((k) => !referenced.has(k))
  // namespaced dynamic lookups (t(`payment.${x}`)) resolve at runtime — don't flag whole namespaces
  .filter((k) => ![...referenced].some((r) => k.startsWith(`${r}.`)))
  .sort();
if (unused.length) {
  console.warn(`\nℹ ${unused.length} en.json key(s) not referenced by any static t('…') (may be dynamic):`);
}

if (errors) {
  console.error(`\n${errors} i18n problem(s) found.\n`);
  process.exit(1);
}
console.log(`✓ i18n OK — ${allKeys.size} keys, ${LOCALES.length} locales in sync.`);
