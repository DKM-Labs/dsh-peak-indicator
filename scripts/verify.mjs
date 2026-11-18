// Offline verification for the dsh-peak-pill bundle.
//
// Run: node scripts/verify.mjs
//
// Loads the browser bundle exactly as the DSH module table does (stub
// `window.__ModuleLoader__` and a stubbed `require`), exercises the badge at
// fixed instants by mocking `Date.now`, and checks the package contract. No
// network, no browser, no dependencies.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFileSync(join(root, name), 'utf8');
const pkg = JSON.parse(read('package.json'));

// ── Load the browser bundle the way the module table does ──────────────────

let definition;
globalThis.window = {
  __ModuleLoader__: {
    load(bundle) {
      definition = bundle;
    },
  },
};

await import(pathToFileURL(join(root, 'client.js')).href);

assert.ok(definition, 'client.js registers a module with window.__ModuleLoader__');
assert.equal(definition.id, pkg.name, 'browser module id equals the package name');
assert.equal(typeof definition.factory, 'function', 'module provides a lazy factory');

const reactStub = {
  createElement(type, props, ...children) {
    return { type, props: props ?? {}, children };
  },
  useState(initial) {
    return [typeof initial === 'function' ? initial() : initial, () => {}];
  },
  useEffect() {},
};

const plugin = definition.factory((request) => {
  if (request === 'react') return reactStub;
  throw new Error(`bundle requested a non-baseline module: ${request}`);
});

// ── Capture the slot registration (the only way the component is reachable) ─

let registration;
plugin.apply({
  slots: {
    inject(name, factory) {
      registration = { name, ...factory() };
    },
    register(options, component) {
      return { options, component };
    },
  },
});

assert.ok(registration, 'apply injects into a slot');
assert.equal(registration.name, 'conversation.composer.dock', 'registers in the composer dock');
assert.equal(registration.options.name, 'conversation.composer.dock');
assert.equal(registration.options.id, pkg.name, 'slot cell id equals the package name');
assert.equal(typeof registration.options.order, 'number', 'declares a numeric order');

function renderAt(iso) {
  const realNow = Date.now;
  Date.now = () => Date.parse(iso);
  try {
    return registration.component();
  } finally {
    Date.now = realNow;
  }
}

// ── Tier and countdown at known Beijing-time instants ──────────────────────

// Beijing = UTC+8. A peak weekday: Monday 2026-11-16. Friday 2026-11-20 is
// the week-long off-peak run; 2026-10-01 is the National Day holiday block.
const cases = [
  ['2026-11-16T00:50:00Z', 'Off-peak', 'peak in 10m', 'Monday 08:50 Beijing is off-peak'],
  ['2026-11-16T01:00:00Z', 'Peak', 'off-peak in 3h 00m', 'Monday 09:00 Beijing starts peak'],
  ['2026-11-16T02:00:00Z', 'Peak', 'off-peak in 2h 00m', 'Monday 10:00 Beijing is peak'],
  ['2026-11-16T03:30:00Z', 'Peak', 'off-peak in 30m', 'Monday 11:30 Beijing is peak'],
  ['2026-11-16T03:59:59Z', 'Peak', 'off-peak in 1m', 'Monday 11:59:59 Beijing is still peak'],
  ['2026-11-16T04:00:00Z', 'Off-peak', 'peak in 2h 00m', 'Monday 12:00 Beijing ends the morning peak'],
  ['2026-11-16T06:00:00Z', 'Peak', 'off-peak in 4h 00m', 'Monday 14:00 Beijing starts the afternoon peak'],
  ['2026-11-16T09:59:59Z', 'Peak', 'off-peak in 1m', 'Monday 17:59:59 Beijing is still peak'],
  ['2026-11-16T10:00:00Z', 'Off-peak', 'peak in 15h 00m', 'Monday 18:00 Beijing ends peak for the day'],
  ['2026-11-21T02:00:00Z', 'Off-peak', 'peak in 1d 23h', 'Saturday 10:00 Beijing is off-peak all day'],
  ['2026-11-20T10:00:00Z', 'Off-peak', 'peak in 2d 15h', 'Friday 18:00 Beijing waits for Monday 09:00'],
  ['2026-10-01T02:00:00Z', 'Off-peak', 'peak in 6d 23h', 'Thursday national-holiday 10:00 Beijing is off-peak'],
  ['2027-02-08T02:00:00Z', 'Off-peak', 'peak in 6d 23h', 'Monday inside Spring Festival 2027 is off-peak'],
  ['2027-02-15T02:00:00Z', 'Peak', 'off-peak in 2h 00m', 'Monday after Spring Festival 2027 is peak again'],
];

for (const [iso, label, countdown, why] of cases) {
  const pill = renderAt(iso);
  assert.equal(pill.type, 'span', `${why}: pill renders as a span`);
  assert.equal(pill.children[0].children[0], label, `${why}: label`);
  assert.equal(pill.children[2].children[0], countdown, `${why}: countdown`);
  assert.match(pill.props.title, /Beijing time \(UTC\+8\)/, `${why}: tooltip names the billing time zone`);
}

const offPeakTitle = renderAt('2026-11-18T05:49:00Z').props.title;
assert.match(offPeakTitle, /Off-peak pricing right now\./, 'off-peak tooltip states the current tier');
assert.match(offPeakTitle, /50% of the peak price/, 'off-peak tooltip states the discount');

const peakTitle = renderAt('2026-11-16T02:00:00Z').props.title;
assert.match(peakTitle, /Peak pricing right now\./, 'peak tooltip states the current tier');
assert.match(peakTitle, /Off-peak starts .* your time\./, 'peak tooltip names the next switch');

// ── Bundle contents and package contract ──────────────────────────────────

const clientSource = read('client.js');
const requested = new Set([...clientSource.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map((match) => match[1]));
assert.deepEqual([...requested], ['react'], 'bundle requires only the react platform seed');

assert.doesNotMatch(clientSource, /\bfetch\s*\(|XMLHttpRequest|WebSocket/, 'bundle makes no network request');
assert.match(clientSource, /window\.__ModuleLoader__\.load\(\{/, 'bundle uses the module-loader registration form');

const holidayStamps = new Set([...clientSource.matchAll(/'(20\d{2}-\d{2}-\d{2})'/g)].map((match) => match[1]));
assert.equal(holidayStamps.size, 62, 'ships the 33 holiday days of 2026 and 29 of 2027');
for (const day of ['2026-01-01', '2026-02-17', '2026-10-01', '2027-02-05', '2027-06-09', '2027-10-07']) {
  assert.ok(holidayStamps.has(day), `holiday calendar contains ${day}`);
}
for (const day of ['2026-10-08', '2027-02-14', '2027-10-08']) {
  assert.ok(!holidayStamps.has(day), `holiday calendar leaves out ordinary day ${day}`);
}

assert.equal(pkg.name, 'dsh-peak-pill', 'package name');
assert.equal(pkg.license, 'MIT', 'package is MIT licensed');
assert.notEqual(pkg.private, true, 'package is publishable');
assert.equal(pkg.dsh?.bundle?.patch, './cordis.patch.yml', 'declares the bundle patch');
assert.equal(pkg.dsh?.client?.platform, 'web', 'declares a web client half');
assert.equal(pkg.exports?.['./client'], './client.js', 'exports the client entry');
assert.match(pkg.engines?.dsh ?? '', /0\.2\./, 'declares the supported DSH range');

for (const file of ['index.js', 'client.js', 'cordis.patch.yml', 'README.md', 'LICENSE', 'icon.svg']) {
  assert.ok(pkg.files.includes(file), `files lists ${file}`);
}

const patch = read('cordis.patch.yml');
assert.match(patch, /-\s*insert:/, 'patch inserts a row');
assert.match(patch, /id:\s*dsh-peak-pill/, 'patch row id');
assert.match(patch, /name:\s*dsh-peak-pill/, 'patch row names the package');

assert.match(read('LICENSE'), /^MIT License/, 'LICENSE is the MIT text');
assert.match(read('README.md'), /dsh plugin --profile web add/, 'README documents installation');

const hostHalf = await import(pathToFileURL(join(root, 'index.js')).href);
assert.equal(typeof hostHalf.apply, 'function', 'host half exports apply');

console.log(`OK — ${cases.length} tier/countdown cases, manifest, calendar and registration checks passed.`);
