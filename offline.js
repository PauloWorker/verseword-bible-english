(function (root, factory) {
  const offline = factory();
  if (typeof module === 'object' && module.exports) module.exports = offline;
  if (root) root.VerseWordOffline = offline;
})(typeof globalThis === 'undefined' ? this : globalThis, function () {
  'use strict';

  function createStore(indexedDB = globalThis.indexedDB, databaseName = 'verseword-content-v1') {
    let databasePromise;
    function open() {
      if (!indexedDB) return Promise.reject(new Error('Persistent offline storage is not available in this browser.'));
      if (databasePromise) return databasePromise;
      databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(databaseName, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('chapters')) db.createObjectStore('chapters', { keyPath: 'key' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Could not open offline storage.'));
        request.onblocked = () => reject(new Error('Offline storage is busy in another app tab.'));
      }).catch(error => { databasePromise = null; throw error; });
      return databasePromise;
    }
    function requestResult(request) {
      return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Offline storage request failed.'));
      });
    }
    async function getChapter(key) {
      const db = await open();
      return requestResult(db.transaction('chapters', 'readonly').objectStore('chapters').get(key));
    }
    async function putChapter(record) {
      if (!record?.key || !Number.isInteger(record.bookIndex) || !Array.isArray(record.verses)) throw new TypeError('A complete chapter record is required.');
      const db = await open();
      const transaction = db.transaction('chapters', 'readwrite');
      transaction.objectStore('chapters').put({ ...record, downloaded: true });
      return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => reject(transaction.error || new Error('Could not save the downloaded chapter.'));
        transaction.onabort = () => reject(transaction.error || new Error('Could not save the downloaded chapter.'));
      });
    }
    async function listBooks() {
      const db = await open();
      const records = await requestResult(db.transaction('chapters', 'readonly').objectStore('chapters').getAll());
      const books = new Map();
      for (const record of records) {
        if (!record.downloaded) continue;
        const entry = books.get(record.bookIndex) || { bookIndex: record.bookIndex, chapters: 0, bytes: 0 };
        entry.chapters += 1; entry.bytes += Number(record.bytes) || 0; books.set(record.bookIndex, entry);
      }
      return [...books.values()].sort((a, b) => a.bookIndex - b.bookIndex);
    }
    async function removeBook(bookIndex) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('chapters', 'readwrite');
        const store = transaction.objectStore('chapters');
        const request = store.openCursor();
        let removed = 0;
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          if (cursor.value.bookIndex === bookIndex && cursor.value.downloaded) { cursor.delete(); removed += 1; }
          cursor.continue();
        };
        transaction.oncomplete = () => resolve(removed);
        transaction.onerror = () => reject(transaction.error || new Error('Could not remove downloaded chapters.'));
        transaction.onabort = () => reject(transaction.error || new Error('Could not remove downloaded chapters.'));
      });
    }
    return { getChapter, putChapter, listBooks, removeBook };
  }
  return { createStore };
});
