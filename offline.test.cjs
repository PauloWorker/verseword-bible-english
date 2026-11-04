const test = require('node:test');
const assert = require('node:assert/strict');
const { createStore } = require('./offline.js');

function fakeIndexedDB() {
  const records = new Map();
  const db = {
    objectStoreNames: { contains: name => name === 'chapters' },
    createObjectStore() { return {}; },
    transaction(_name, mode) {
      const transaction = { mode, objectStore: () => ({
        get(key) {
          const request = {};
          setTimeout(() => { request.result = records.get(key); request.onsuccess?.(); }, 0);
          return request;
        },
        getAll() {
          const request = {};
          setTimeout(() => { request.result = [...records.values()]; request.onsuccess?.(); }, 0);
          return request;
        },
        put(record) {
          records.set(record.key, record);
          setTimeout(() => transaction.oncomplete?.(), 0);
          return {};
        },
        openCursor() {
          const request = {};
          const rows = [...records.entries()];
          const step = index => setTimeout(() => {
            if (index >= rows.length) { transaction.oncomplete?.(); return; }
            const [key, value] = rows[index];
            request.result = { value, delete: () => records.delete(key), continue: () => step(index + 1) };
            request.onsuccess?.();
          }, 0);
          step(0);
          return request;
        }
      }) };
      return transaction;
    }
  };
  return { open() {
    const request = { result: db };
    setTimeout(() => { request.onupgradeneeded?.(); request.onsuccess?.(); }, 0);
    return request;
  } };
}

test('persistent offline store reads, lists, and removes only the selected book', async () => {
  const idb = fakeIndexedDB();
  const store = createStore(idb);
  await store.putChapter({ key: 'GEN-1', bookIndex: 0, chapter: 1, verses: [{ number: 1, text: 'First.' }], bytes: 20, translation: 'WEB' });
  await store.putChapter({ key: 'GEN-2', bookIndex: 0, chapter: 2, verses: [{ number: 1, text: 'Second.' }], bytes: 22, translation: 'WEB' });
  await store.putChapter({ key: 'EXO-1', bookIndex: 1, chapter: 1, verses: [{ number: 1, text: 'Third.' }], bytes: 21, translation: 'WEB' });
  assert.equal((await store.getChapter('GEN-2')).downloaded, true);
  assert.deepEqual(await store.listBooks(), [
    { bookIndex: 0, chapters: 2, bytes: 42 },
    { bookIndex: 1, chapters: 1, bytes: 21 }
  ]);
  assert.equal(await store.removeBook(0), 2);
  assert.equal(await store.getChapter('GEN-1'), undefined);
  assert.equal((await store.getChapter('EXO-1')).verses[0].text, 'Third.');
});

test('offline store refuses incomplete chapter records', async () => {
  const store = createStore(fakeIndexedDB());
  await assert.rejects(store.putChapter({ key: 'GEN-1', bookIndex: 0 }), /complete chapter record/);
});
