const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const hosting = JSON.parse(fs.readFileSync(path.join(root, '.openai', 'hosting.json'), 'utf8'));
const output = path.resolve(root, hosting.static.directory);
const artifacts = [
  'index.html', 'styles.css', 'core.js', 'offline.js', 'app.js',
  'manifest.webmanifest', 'sw.js', 'icon.svg', 'icon-192.png', 'icon-512.png'
];

test('publication directory exactly matches all maintained source artifacts', () => {
  for (const file of artifacts) {
    const source = fs.readFileSync(path.join(root, 'src', file));
    const built = fs.readFileSync(path.join(output, file));
    assert.deepEqual(built, source, hosting.static.directory + '/' + file + ' is stale; run npm run build');
  }
  assert.deepEqual(fs.readdirSync(output).sort(), [...artifacts].sort(), 'publication directory contains unexpected or missing files');
});

test('publication HTML and service worker load the runtime dependencies in order', () => {
  const html = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(match => match[1]);
  const expected = ['/core.js', '/offline.js', '/app.js'];
  assert.ok(expected.every((script, index) => scripts.indexOf(script) >= index), 'core, offline store, and app scripts must load in order');

  const serviceWorker = fs.readFileSync(path.join(output, 'sw.js'), 'utf8');
  assert.match(serviceWorker, /verseword-v\d+/);
  for (const asset of ['/core.js', '/offline.js', '/app.js', '/styles.css', '/manifest.webmanifest']) {
    assert.ok(serviceWorker.includes("'" + asset + "'") || serviceWorker.includes('\"' + asset + '\"'), 'service worker must precache ' + asset);
  }
});

test('build reports missing sources before touching the existing publication directory', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'verseword-build-'));
  try {
    fs.mkdirSync(path.join(fixture, 'src'), { recursive: true });
    fs.mkdirSync(path.join(fixture, '.openai'), { recursive: true });
    fs.mkdirSync(path.join(fixture, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(fixture, '.openai', 'hosting.json'), JSON.stringify({ static: { directory: 'dist' } }));
    fs.writeFileSync(path.join(fixture, 'dist', 'keep.txt'), 'preserve until sources are validated');
    fs.copyFileSync(path.join(__dirname, 'build.mjs'), path.join(fixture, 'src', 'build.mjs'));

    let failure;
    try { execFileSync(process.execPath, [path.join(fixture, 'src', 'build.mjs')], { encoding: 'utf8', stdio: 'pipe' }); }
    catch (error) { failure = error; }
    assert.ok(failure, 'build must fail when required sources are absent');
    assert.match(failure.stderr.toString(), /required source file\(s\) missing: src\/index\.html/);
    assert.equal(fs.readFileSync(path.join(fixture, 'dist', 'keep.txt'), 'utf8'), 'preserve until sources are validated');
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
