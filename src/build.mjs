import { cp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(projectRoot, 'src');
const hostingConfigPath = path.join(projectRoot, '.openai', 'hosting.json');
const sourceFiles = [
  'index.html', 'styles.css', 'core.js', 'offline.js', 'app.js',
  'manifest.webmanifest', 'sw.js', 'icon.svg', 'icon-192.png', 'icon-512.png'
];

function fail(message) {
  console.error('Build error: ' + message);
  process.exitCode = 1;
}

async function readSources() {
  const sources = new Map();
  const missing = [];
  for (const file of sourceFiles) {
    try {
      sources.set(file, await readFile(path.join(sourceRoot, file)));
    } catch (error) {
      if (error.code === 'ENOENT') missing.push('src/' + file);
      else throw error;
    }
  }
  if (missing.length) throw new Error('required source file(s) missing: ' + missing.join(', '));
  return sources;
}

async function outputDirectory() {
  let config;
  try {
    config = JSON.parse(await readFile(hostingConfigPath, 'utf8'));
  } catch (error) {
    throw new Error('could not read .openai/hosting.json: ' + error.message);
  }
  const directory = config?.static?.directory;
  if (typeof directory !== 'string' || !directory.trim()) throw new Error('.openai/hosting.json must define static.directory');
  const output = path.resolve(projectRoot, directory);
  const relative = path.relative(projectRoot, output);
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
    throw new Error('static.directory must point to a child of the project root; received ' + directory);
  }
  return output;
}

function validateSourceContracts(sources) {
  const html = sources.get('index.html').toString('utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(match => match[1]);
  const expectedScripts = ['/core.js', '/offline.js', '/app.js'];
  let prior = -1;
  for (const script of expectedScripts) {
    const index = scripts.indexOf(script);
    if (index < 0 || index <= prior) throw new Error('src/index.html must load ' + expectedScripts.join(' → ') + ' in that order');
    prior = index;
  }

  const serviceWorker = sources.get('sw.js').toString('utf8');
  const cacheName = serviceWorker.match(/\bconst\s+CACHE\s*=\s*['"](verseword-v\d+)['"]/);
  if (!cacheName) throw new Error('src/sw.js must declare a versioned verseword cache name');
  const assetList = serviceWorker.match(/\bconst\s+ASSETS\s*=\s*\[([\s\S]*?)\]/);
  if (!assetList) throw new Error('src/sw.js must declare its precached ASSETS');
  const assets = [...assetList[1].matchAll(/['"]([^'"]+)['"]/g)].map(match => match[1]);
  for (const asset of ['/core.js', '/offline.js', '/app.js', '/styles.css', '/manifest.webmanifest']) {
    if (!assets.includes(asset)) throw new Error('src/sw.js ASSETS is missing ' + asset);
  }
}

async function verifyOutput(output, sources) {
  const mismatched = [];
  for (const file of sourceFiles) {
    let actual;
    try { actual = await readFile(path.join(output, file)); }
    catch (error) {
      if (error.code === 'ENOENT') { mismatched.push(file + ' (missing)'); continue; }
      throw error;
    }
    if (!actual.equals(sources.get(file))) mismatched.push(file + ' (differs from src/' + file + ')');
  }
  const actualFiles = (await readdir(output).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error))).sort();
  const expectedFiles = [...sourceFiles].sort();
  for (const extra of actualFiles.filter(file => !expectedFiles.includes(file))) mismatched.push(extra + ' (unexpected artifact)');
  if (mismatched.length) throw new Error('distribution is missing or stale: ' + mismatched.join(', '));
}

try {
  const sources = await readSources();
  validateSourceContracts(sources);
  const output = await outputDirectory();
  if (process.argv.includes('--check')) {
    await verifyOutput(output, sources);
    console.log('Distribution verified: ' + path.relative(projectRoot, output) + ' matches ' + sourceFiles.length + ' required source files.');
  } else {
    await rm(output, { recursive: true, force: true });
    await mkdir(output, { recursive: true });
    for (const file of sourceFiles) await cp(path.join(sourceRoot, file), path.join(output, file));
    await verifyOutput(output, sources);
    console.log('Built and verified ' + sourceFiles.length + ' files in ' + path.relative(projectRoot, output) + ' from src/.');
  }
} catch (error) {
  fail(error.message);
}
