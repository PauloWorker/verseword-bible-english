const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('./core.js');

test('Bible navigation includes all 66 books and the canonical 1,189 chapters', () => {
  assert.equal(C.BOOKS.length, 66);
  assert.equal(C.TOTAL_CHAPTERS, 1189);
  assert.equal(C.BOOKS[0][2], 50);
  assert.equal(C.BOOKS.find(book => book[0] === 'Psalms')[2], 150);
  assert.equal(C.BOOKS.at(-1)[2], 22);
  assert.ok(C.BOOKS.every(([, code, chapters]) => code && chapters > 0));
});

test('chapter navigation crosses book boundaries in both directions', () => {
  assert.deepEqual(C.resolveChapter(0, 1, -1), { bookIndex: 65, chapter: 22 });
  assert.deepEqual(C.resolveChapter(65, 22, 1), { bookIndex: 0, chapter: 1 });
  assert.deepEqual(C.resolveChapter(1, 40, 1), { bookIndex: 2, chapter: 1 });
  assert.deepEqual(C.resolveChapter(2, 1, -1), { bookIndex: 1, chapter: 40 });
});

test('only the latest matching chapter request may update the reader', () => {
  assert.equal(C.canApplyChapterResponse(7, 8, 'GEN-1', 'EXO-1'), false);
  assert.equal(C.canApplyChapterResponse(8, 8, 'GEN-1', 'EXO-1'), false);
  assert.equal(C.canApplyChapterResponse(8, 8, 'EXO-1', 'EXO-1'), true);
});

test('chapter response normalization retains supplied Bible text and verse numbering', () => {
  const data = [{ verse: 3, text: 'Let there be light.' }, { number: 4, content: 'The light was good.' }];
  assert.deepEqual(C.normalizeChapter(data), [{ number: 3, text: 'Let there be light.' }, { number: 4, text: 'The light was good.' }]);
  assert.deepEqual(C.normalizeChapter({ verses: [{ number: 1, text: '  ' }] }), []);
});

test('local glossary assigns grammatical categories explicitly', () => {
  assert.equal(C.localDefinition('created').groups[0].partOfSpeech, 'Verb');
  assert.equal(C.localDefinition('without').groups[0].partOfSpeech, 'Preposition');
  assert.equal(C.localDefinition('good').groups[0].partOfSpeech, 'Adjective');
  assert.equal(C.localDefinition('light').groups[0].partOfSpeech, 'Noun');
  assert.equal(C.localDefinition('unknownword'), null);
  assert.equal(C.lemmaFor('created'), 'create');
  assert.equal(C.lemmaFor('called'), 'call');
  assert.equal(C.lemmaFor('was'), 'be');
});

test('dictionary response normalization preserves POS and prioritizes common word types', () => {
  const normalized = C.normalizeDefinitions([{ word: 'light', phonetic: '/laɪt/', meanings: [
    { partOfSpeech: 'verb', definitions: [{ definition: 'to make less heavy' }] },
    { partOfSpeech: 'noun', definitions: [{ definition: 'brightness', example: 'The light came in.' }] }
  ] }]);
  assert.deepEqual(normalized.groups.map(group => group.partOfSpeech), ['Verb', 'Noun']);
  assert.equal(normalized.groups[1].definitions[0].example, 'The light came in.');
});

test('context guide separates physical light, figurative light, and shepherd imagery', () => {
  const genesis = C.contextualSense('light', 'genesis', 1, 3);
  const john = C.contextualSense('light', 'John', 8, 12);
  const psalm = C.contextualSense('shepherd', 'Psalms', 23, 1);
  assert.match(genesis.definition, /Physical brightness/);
  assert.match(john.definition, /guidance and life/);
  assert.match(john.note, /figurative guidance/);
  assert.match(psalm.definition, /protects, feeds, and guides sheep/);
  assert.match(psalm.definition, /caring for and guiding people/);
  assert.equal(C.contextualSense('light', 'John', 8, 11), null);
});

test('illustrations are available only for exact curated contextual entries', () => {
  assert.equal(C.illustrationFor('light', 'Genesis', 1, 3).id, 'physical-light');
  assert.equal(C.illustrationFor('light', 'John', 8, 12).id, 'guiding-light');
  assert.equal(C.illustrationFor('shepherd', 'Psalms', 23, 6).id, 'shepherd');
  assert.equal(C.illustrationFor('light', 'John', 8, 11), null);
  assert.equal(C.illustrationFor('shepherd', 'Psalms', 22, 1), null);
  assert.equal(C.illustrationFor('king', 'Genesis', 1, 1), null);
  assert.equal(C.illustrationFor('bank', 'Genesis', 1, 1), null);
  assert.equal(C.illustrationFor('waters', 'Genesis', 1, 2).id, 'waters');
  assert.equal(C.illustrationFor('seed', 'Genesis', 1, 11).id, 'seed');
  assert.equal(C.illustrationFor('bread', 'John', 6, 35).id, 'life-bread');
  assert.equal(C.illustrationFor('bread', 'John', 6, 34), null);
});

test('semantic cache keys bind a reviewed sense to the exact word, verse, text, and interpreter version', () => {
  const key = C.semanticCacheKey('LIGHT', 'John 8:12', 'WEB', 'guide-v1');
  assert.equal(key, 'light|john|8|12|web|guide-v1');
  assert.notEqual(key, C.semanticCacheKey('light', 'Genesis 1:3', 'WEB', 'guide-v1'));
  assert.notEqual(key, C.semanticCacheKey('light', 'John 8:12', 'KJV', 'guide-v1'));
  assert.notEqual(key, C.semanticCacheKey('light', 'John 8:12', 'WEB', 'guide-v2'));
  assert.equal(C.semanticCacheKey('light', 'John 8', 'WEB', 'guide-v1'), '');
});

test('settings updates persist atomically and report storage failures', () => {
  const values = new Map();
  const storage = { setItem: (key, value) => values.set(key, value) };
  const updated = C.updateSettings(storage, 'settings', { theme: 'system', fontSize: 21 }, { theme: 'dark' });
  assert.equal(updated.persisted, true);
  assert.deepEqual(JSON.parse(values.get('settings')), { theme: 'dark', fontSize: 21 });
  assert.deepEqual(updated.settings, { theme: 'dark', fontSize: 21 });
  const failing = C.updateSettings({ setItem() { throw new Error('quota'); } }, 'settings', { theme: 'light' }, { theme: 'dark' });
  assert.equal(failing.persisted, false);
  assert.equal(failing.settings.theme, 'dark');
});

test('saved vocabulary writes can fail without mutating the prior collection', () => {
  const saved = [{ word: 'light', reference: 'John 8:12', partOfSpeech: 'Noun' }];
  const attempted = C.upsertSavedWord(saved, { word: 'waters', reference: 'Genesis 1:2', partOfSpeech: 'Noun' });
  assert.equal(C.persistJSON({ setItem() { throw new Error('quota'); } }, 'saved', attempted), false);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].word, 'light');
});

test('saved words migrate from legacy strings and preserve available fields', () => {
  const migrated = C.migrateSavedWords(['light', { word: 'created', definition: 'made', reference: 'Genesis 1:1', example: 'God created.' }]);
  assert.equal(migrated[0].word, 'light');
  assert.equal(migrated[1].lemma, 'create');
  assert.equal(migrated[1].partOfSpeech, '');
  assert.equal(migrated[1].reference, 'Genesis 1:1');
  assert.equal(migrated[1].example, 'God created.');
});

test('saved word collection deduplicates the same word, verse, and category and is bounded', () => {
  const words = C.upsertSavedWord([{ word: 'light', reference: 'Genesis 1:3', partOfSpeech: 'Noun' }], { word: 'light', reference: 'Genesis 1:3', partOfSpeech: 'Noun', definition: 'brightness' });
  assert.equal(words.length, 1);
  assert.equal(words[0].definition, 'brightness');
  const alpha = number => { let value = ''; do { value = String.fromCharCode(97 + number % 26) + value; number = Math.floor(number / 26) - 1; } while (number >= 0); return `word${value}`; };
  const existing = Array.from({ length: 510 }, (_, index) => alpha(index));
  assert.equal(C.migrateSavedWords(existing).length, 510);
  const capped = C.upsertSavedWord(existing, { word: 'anothernewword' }, 500);
  assert.equal(capped.length, 510);
  assert.equal(capped.some(item => item.word === 'anothernewword'), false);
});

test('chapter cache access refreshes recency and enforces its entry bound', () => {
  const cache = Object.fromEntries(Array.from({ length: 15 }, (_, index) => [`book-${index}`, [index]]));
  const result = C.readCache(cache, 'book-0', 14);
  assert.deepEqual(result.value, [0]);
  assert.equal(Object.keys(result.cache).length, 14);
  assert.ok(!Object.hasOwn(result.cache, 'book-1'));
  assert.equal(Object.keys(result.cache).at(-1), 'book-0');
});

test('explicit offline downloads require complete ordered verse sequences and show a conservative estimate', () => {
  assert.equal(C.isOrderedChapter([{ number: 1, text: 'First.' }, { number: 2, text: 'Second.' }]), true);
  assert.equal(C.isOrderedChapter([{ number: 2, text: 'Second.' }, { number: 1, text: 'First.' }]), false);
  assert.equal(C.isOrderedChapter([{ number: 1, text: '' }]), false);
  assert.equal(C.estimatedBookBytes(50), 50 * 12 * 1024);
  assert.equal(C.estimatedBookBytes(-1), 0);
});

test('PWA shell exposes themes, responsive navigation, keyboard dialog, and offline update behavior', () => {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  const sw = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');
  const offline = fs.readFileSync(path.join(__dirname, 'offline.js'), 'utf8');
  assert.match(html, /<option value="dark">Dark blue<\/option>/);
  assert.match(html, /<button class="mobile-nav-item[^>]+data-view="progress"/);
  assert.match(html, /role="dialog" aria-modal="true"/);
  assert.match(css, /#0c1425/);
  assert.match(css, /#151f34/);
  assert.match(css, /@media\(max-width:680px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(app, /focusTrap/);
  assert.match(app, /Saved for offline reading/);
  assert.match(html, /id="offline-book-picker"/);
    assert.match(sw, /verseword-v[0-9]+/);
  assert.match(offline, /createObjectStore\('chapters'/);
  
  assert.match(sw, /'\/offline.js'/);
  assert.doesNotMatch(sw, /skipWaiting\(\)|clients\.claim\(\)/);
  assert.doesNotMatch(app, /location\.reload\(/);
});

test('all static app element lookups are present in the page source', () => {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
  const lookedUp = new Set([...app.matchAll(/\$\('([^']+)'\)/g)].map(match => match[1]));
  const missing = [...lookedUp].filter(id => !ids.has(id));
  assert.deepEqual(missing, []);
});
