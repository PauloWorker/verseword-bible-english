import { cp, mkdir, rm } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const output = new URL('../dist/', import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of ['index.html', 'styles.css', 'core.js', 'offline.js', 'app.js', 'manifest.webmanifest', 'sw.js']) {
  await cp(new URL(`../src/${file}`, import.meta.url), new URL(`../dist/${file}`, import.meta.url));
}
for (const file of ['icon.svg', 'icon-192.png', 'icon-512.png']) {
  await cp(new URL(`../src/${file}`, import.meta.url), new URL(`../dist/${file}`, import.meta.url));
}
console.log(`Built the static PWA from ${root.pathname} into dist/.`);
