(() => {
  'use strict';
  const C = window.VerseWordCore;
  const $ = id => document.getElementById(id);
  const MAX_CHAPTER_CACHE = 14;
  const MAX_CACHE_CHARS = 500000;
  const MAX_SAVED_WORDS = 500;
  const SEMANTIC_CACHE_KEY = 'verseword-semantic-cache-v1';
  const offlineStore = window.indexedDB && window.VerseWordOffline?.createStore();
  const OLD = { saved: 'verseword-saved', chapters: 'verseword-chapters', read: 'verseword-read' };
  const KEY = { saved: 'verseword-saved-v2', chapters: 'verseword-chapters-v2', read: 'verseword-read-v2', position: 'verseword-position-v1', settings: 'verseword-settings-v1' };
  const readJSON = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const writeJSON = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { toast('This device could not save the latest change.'); return false; } };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
  const parseRef = reference => {
    const match = String(reference || '').match(/^(.*?)\s+(\d+):(\d+)$/);
    if (!match) return null;
    const index = C.BOOKS.findIndex(book => book[0].toLowerCase() === match[1].toLowerCase());
    return index < 0 ? null : { bookIndex:index, chapter:Number(match[2]), verse:Number(match[3]) };
  };
  const initial = readJSON(KEY.position, null) || { bookIndex: 0, chapter: 1 };
  let bookIndex = Math.max(0, Math.min(C.BOOKS.length - 1, Number(initial.bookIndex) || 0));
  let chapterNumber = Math.max(1, Math.min(C.BOOKS[bookIndex][2], Number(initial.chapter) || 1));
  let chapterVerses = [];
  let chapterCache = readJSON(KEY.chapters, null) || readJSON(OLD.chapters, {});
  let readChapters = new Set(readJSON(KEY.read, null) || readJSON(OLD.read, []));
  let saved = C.migrateSavedWords(readJSON(KEY.saved, null) || readJSON(OLD.saved, []));
  let activeView = 'read', selectedWord = '', selectedContext = '', selectedVerseNo = 0, selectedButton = null;
  let lookupToken = 0, chapterToken = 0, chapterController = null, dictionaryController = null, toastTimer = null, currentSense = null, currentDefinitions = null;
  let activeUtterance = null, activeUtteranceButton = null;
  const settings = readJSON(KEY.settings, {});
  let definitionCache = readJSON('verseword-def-cache-v3', {});
  let semanticCache = readJSON(SEMANTIC_CACHE_KEY, {});
  let bookDownloadController = null;

  function migrateLocalData() {
    saved = C.migrateSavedWords(saved);
    const savedOk = writeJSON(KEY.saved, saved);
    if (savedOk) { try { localStorage.removeItem(OLD.saved); } catch { /* keep the original collection if cleanup is unavailable */ } }
    readChapters = new Set([...readChapters].slice(-C.TOTAL_CHAPTERS));
    const readOk = writeJSON(KEY.read, [...readChapters]);
    if (readOk) { try { localStorage.removeItem(OLD.read); } catch { /* keep the original progress if cleanup is unavailable */ } }
    for (const key of Object.keys(chapterCache)) {
      const { cache } = C.readCache(chapterCache, key, MAX_CHAPTER_CACHE);
      chapterCache = cache;
    }
    const cacheJSON = JSON.stringify(chapterCache);
    if (cacheJSON.length <= MAX_CACHE_CHARS) {
      try { localStorage.setItem(KEY.chapters, cacheJSON); localStorage.removeItem(OLD.chapters); } catch { /* offline cache is optional */ }
    } else {
      chapterCache = {};
      try { localStorage.removeItem(KEY.chapters); localStorage.removeItem(OLD.chapters); } catch { /* oversized chapter data is only a disposable cache */ }
    }
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index);
      if (key?.startsWith('verseword-img-v3-') || key?.startsWith('verseword-def-v2-')) localStorage.removeItem(key);
    }
  }

  function referenceFor(book = bookIndex, chapter = chapterNumber, verse = selectedVerseNo) {
    const prefix = `${C.BOOKS[book][0]} ${chapter}`;
    return verse ? `${prefix}:${verse}` : prefix;
  }
  function chapterKey(book = bookIndex, chapter = chapterNumber) { return `${C.BOOKS[book][1]}-${chapter}`; }
  function bookName() { return C.BOOKS[bookIndex][0]; }
  function apiUrl(book = bookIndex, chapter = chapterNumber) { return `https://dabar.io/data/web/${C.BOOKS[book][1]}/${chapter}`; }

  function populateBooks() {
    const select = $('book-picker');
    select.innerHTML = '<optgroup label="Old Testament"></optgroup><optgroup label="New Testament"></optgroup>';
    const groups = select.querySelectorAll('optgroup');
    C.BOOKS.forEach((book, index) => {
      const option = document.createElement('option'); option.value = index; option.textContent = book[0];
      groups[index < 39 ? 0 : 1].appendChild(option);
    });
    select.value = String(bookIndex); populateChapters();
  }
  function populateChapters() {
    const count = C.BOOKS[bookIndex][2], select = $('chapter-picker');
    select.innerHTML = Array.from({ length: count }, (_, i) => `<option value="${i + 1}">Chapter ${i + 1}</option>`).join('');
    select.value = String(chapterNumber);
  }
  function updateProgress() {
    const count = readChapters.size, percent = Math.min(100, count / C.TOTAL_CHAPTERS * 100);
    $('progress-count').textContent = `${count.toLocaleString()} / ${C.TOTAL_CHAPTERS.toLocaleString()} chapters`;
    $('progress-percent').textContent = `${Math.floor(percent)}%`;
    $('progress-fill').style.width = `${percent}%`;
    $('progress-note').textContent = `Currently reading ${bookName()} ${chapterNumber}`;
    $('progress-large-count').textContent = `${count.toLocaleString()} / ${C.TOTAL_CHAPTERS.toLocaleString()}`;
    $('progress-large-fill').style.width = `${percent}%`;
    $('progress-large-note').textContent = count ? `You have opened ${count} ${count === 1 ? 'chapter' : 'chapters'} so far.` : 'Choose a book and begin reading.';
  }
  function storeReadProgress() {
    readChapters.add(chapterKey());
    if (readChapters.size > C.TOTAL_CHAPTERS) readChapters = new Set([...readChapters].slice(-C.TOTAL_CHAPTERS));
    writeJSON(KEY.read, [...readChapters]); updateProgress();
  }
  function storePosition() { writeJSON(KEY.position, { bookIndex, chapter: chapterNumber }); }
  function renderWords(text, verseNo) {
    return String(text).split(/(\s+)/).map(part => {
      if (/^\s+$/.test(part)) return part;
      const word = part.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
      if (!word) return esc(part);
      return `<button class="word" type="button" data-word="${esc(word.toLowerCase())}" data-verse="${verseNo}" aria-label="Explain ${esc(word)}">${esc(part)}</button>`;
    }).join('');
  }
  function renderChapter() {
    $('chapter-heading').textContent = `${bookName()} ${chapterNumber}`;
    $('reader-text').innerHTML = chapterVerses.map(verse => `<p class="verse"><sup class="verse-number">${verse.number}</sup>${renderWords(verse.text, verse.number)}</p>`).join('');
    $('reader-text').querySelectorAll('.word').forEach((button, index) => { button.tabIndex = index === 0 ? 0 : -1; });
    $('book-picker').value = String(bookIndex); $('chapter-picker').value = String(chapterNumber);
    $('reader-scroll').scrollTop = 0;
    storeReadProgress(); storePosition();
  }
  function saveChapterCache(key, verses) {
    chapterCache = { ...chapterCache };
    delete chapterCache[key]; chapterCache[key] = verses;
    while (Object.keys(chapterCache).length > MAX_CHAPTER_CACHE) delete chapterCache[Object.keys(chapterCache)[0]];
    let serialized = JSON.stringify(chapterCache);
    while (serialized.length > MAX_CACHE_CHARS && Object.keys(chapterCache).length > 1) {
      delete chapterCache[Object.keys(chapterCache)[0]]; serialized = JSON.stringify(chapterCache);
    }
    try { localStorage.setItem(KEY.chapters, serialized); } catch { /* chapter cache is optional; saved words are not cleared */ }
  }
  async function loadChapter() {
    const token = ++chapterToken, key = chapterKey(), url = apiUrl();
    stopSpeech();
    if (chapterController) chapterController.abort();
    chapterController = new AbortController();
    $('chapter-heading').textContent = `${bookName()} ${chapterNumber}`;
    $('reader-text').innerHTML = '<div class="load-state">Loading this chapter…</div>';
    $('offline-state').textContent = navigator.onLine ? '' : 'Offline';
    populateChapters(); updateProgress(); closeWordSheet(false);
    const cached = C.readCache(chapterCache, key, MAX_CHAPTER_CACHE);
    chapterCache = cached.cache;
    if (cached.value?.length) {
      chapterVerses = cached.value; saveChapterCache(key, chapterVerses); renderChapter();
      if (!navigator.onLine) $('offline-state').textContent = 'Saved for offline reading';
      return;
    }
    try {
      const downloaded = await offlineStore?.getChapter(key);
      if (token !== chapterToken) return;
      if (downloaded?.downloaded && downloaded.translation === 'WEB' && C.isOrderedChapter(downloaded.verses)) {
        chapterVerses = downloaded.verses; saveChapterCache(key, chapterVerses); renderChapter();
        $('offline-state').textContent = navigator.onLine ? 'Downloaded for offline use' : 'Downloaded for offline reading';
        return;
      }
    } catch { /* temporary chapter cache and network remain available */ }
    if (token !== chapterToken) return;
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: chapterController.signal });
      if (!response.ok) throw new Error(`Chapter request failed (${response.status})`);
      const verses = C.normalizeChapter(await response.json());
      if (!verses.length) throw new Error('The chapter response was empty');
      if (!C.canApplyChapterResponse(token, chapterToken, key, chapterKey())) return;
      chapterVerses = verses; saveChapterCache(key, verses); renderChapter();
      $('offline-state').textContent = '';
    } catch (error) {
      if (error.name === 'AbortError' || token !== chapterToken) return;
      const fallback = chapterCache[key];
      if (fallback?.length) {
        chapterVerses = fallback; renderChapter(); $('offline-state').textContent = 'Saved copy';
      } else {
        $('reader-text').innerHTML = '<div class="load-state">This chapter could not load. Check your connection and try again.</div>';
        $('offline-state').textContent = navigator.onLine ? 'Could not connect' : 'Offline';
        toast(navigator.onLine ? 'The chapter could not load. Try again.' : 'This chapter is not saved for offline reading yet.');
      }
    }
  }
  function moveChapter(delta) {
    ({ bookIndex, chapter: chapterNumber } = C.resolveChapter(bookIndex, chapterNumber, delta));
    $('book-picker').value = String(bookIndex); populateChapters(); storePosition(); loadChapter();
  }

  function verseText(verseNo) { return chapterVerses.find(verse => verse.number === Number(verseNo))?.text || selectedContext; }
  function highlightedVerse(text, word) {
    const expression = new RegExp(`(${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'iu');
    return String(text).split(expression).map(part => part.toLowerCase() === word.toLowerCase() ? `<mark>${esc(part)}</mark>` : esc(part)).join('');
  }
  function renderCuratedIllustration(id) {
    const images = {
      'physical-light': '<svg viewBox="0 0 620 190" role="img" aria-label="Sunlight spreading across the land"><rect width="620" height="190" fill="#d9e8f2"/><circle cx="490" cy="45" r="29" fill="#edc779"/><path d="M490 77 280 168M475 77 204 174M507 77 385 170M456 67 132 127M518 66 569 118" stroke="#edc779" stroke-width="4" opacity=".52"/><path d="M0 141Q140 101 264 140t356-1v51H0Z" fill="#a7c196"/><path d="M0 169q140-29 291 0t329-1v22H0Z" fill="#6e927b"/></svg>',
      'guiding-light': '<svg viewBox="0 0 620 190" role="img" aria-label="A bright path leading toward the sunrise"><defs><linearGradient id="dawn" x2="0" y2="1"><stop stop-color="#152544"/><stop offset="1" stop-color="#7387a1"/></linearGradient></defs><rect width="620" height="190" fill="url(#dawn)"/><circle cx="470" cy="66" r="24" fill="#edc779"/><path d="M0 143 149 111l96 21 137-48 238 54v52H0Z" fill="#263952"/><path d="M230 190q44-46 125-70 79 31 119 70" fill="#edc779" opacity=".78"/><path d="M264 190q34-37 91-57 53 23 84 57" fill="#f6e4b8"/></svg>',
      shepherd: '<svg viewBox="0 0 620 190" role="img" aria-label="A shepherd caring for sheep in a green field"><rect width="620" height="190" fill="#deebeb"/><circle cx="500" cy="45" r="24" fill="#edc779"/><path d="M0 128q125-37 258 2t362-4v64H0Z" fill="#9ab790"/><path d="M0 163q142-34 286-2t334-1v30H0Z" fill="#6e9278"/><path d="M292 132V73q0-20 19-20t19 20v59m-45-34h71m-36-45V36" fill="none" stroke="#52635c" stroke-width="8" stroke-linecap="round"/><path d="M282 82q-19-20-32 0 5 19 27 15m73-13q17-19 29-2-3 20-24 16" fill="none" stroke="#52635c" stroke-width="7" stroke-linecap="round"/><g fill="#fffdf5"><ellipse cx="156" cy="140" rx="27" ry="17"/><circle cx="136" cy="130" r="12"/><circle cx="166" cy="127" r="13"/><circle cx="178" cy="140" r="11"/><ellipse cx="455" cy="155" rx="23" ry="15"/><circle cx="438" cy="145" r="10"/><circle cx="465" cy="143" r="12"/></g><g fill="#6f756f"><path d="M147 150v14m18-14v14m279 1v11m16-11v11" stroke="#6f756f" stroke-width="4"/></g></svg>',
      waters: '<svg viewBox="0 0 620 190" role="img" aria-label="Water covering the land beneath a cloudy sky"><rect width="620" height="190" fill="#dce7eb"/><path d="M0 87q58-34 116 0t116 0 116 0 116 0 156 0v103H0Z" fill="#7ca7b8"/><path d="M0 117q58-18 116 0t116 0 116 0 116 0 156 0M0 151q58-18 116 0t116 0 116 0 116 0 156 0" fill="none" stroke="#d7ebee" stroke-width="7" opacity=".85"/><path d="M0 166q72-15 146 0t146 0 146 0 182 0" fill="none" stroke="#51879b" stroke-width="5"/></svg>',
      seed: '<svg viewBox="0 0 620 190" role="img" aria-label="A small seed beginning to sprout in soil"><rect width="620" height="190" fill="#e5ece5"/><path d="M0 133q155-22 310 0t310 0v57H0Z" fill="#8b765b"/><path d="M0 148q155-19 310 0t310 0" fill="none" stroke="#b49b77" stroke-width="9"/><ellipse cx="307" cy="137" rx="17" ry="10" transform="rotate(-28 307 137)" fill="#d3ad65"/><path d="M310 129q0-33 2-55" fill="none" stroke="#5c8a62" stroke-width="8" stroke-linecap="round"/><path d="M311 91q-42-33-56-2 25 24 56 2m1-17q36-39 57-14-16 29-57 14" fill="#79a86e"/></svg>',
      'life-bread': '<svg viewBox="0 0 620 190" role="img" aria-label="A symbolic path of light representing the phrase bread of life"><rect width="620" height="190" fill="#e4e9ed"/><circle cx="480" cy="40" r="25" fill="#edc779"/><path d="M0 145 155 116l91 18 129-46 245 55v47H0Z" fill="#293951"/><path d="M210 190q52-57 133-82 80 29 126 82" fill="#edc779" opacity=".72"/><path d="M252 190q38-43 91-62 56 21 94 62" fill="#f7e9c5"/><path d="M306 172v-33m0-1q-28-26-45-5 15 22 45 5m0-8q26-31 46-10-15 24-46 10" fill="none" stroke="#789a78" stroke-width="7" stroke-linecap="round"/></svg>'
    };
    return images[id] || '';
  }
  function renderDefinitions(groups) {
    const list = $('definitions-list');
    list.innerHTML = (groups || []).flatMap(group => (group.definitions || []).slice(0, 4).map(item => `<article class="dictionary-group"><strong>${esc(group.partOfSpeech)}</strong><p>${esc(item.definition)}</p>${item.example ? `<p><em>${esc(item.example)}</em></p>` : ''}</article>`)).join('');
    $('other-senses').hidden = !list.innerHTML;
  }
  function setSense(sense, source, groups) {
    currentSense = sense;
    $('part-of-speech').textContent = sense?.partOfSpeech || 'Word meaning';
    $('sense-source').textContent = source || '';
    $('sense-title').textContent = sense ? 'Meaning in this verse' : 'General dictionary meanings';
    $('primary-definition').textContent = sense?.definition || groups?.[0]?.definitions?.[0]?.definition || 'No definition is available for this word yet.';
    $('context-note').textContent = sense?.note || 'No context-checked meaning is available yet. These dictionary meanings are general; use the verse to decide which one fits.';
    const illustration = sense && C.illustrationFor(selectedWord, referenceBookName(), referenceChapter(), selectedVerseNo);
    const svg = illustration && renderCuratedIllustration(illustration.id);
    $('meaning-visual').hidden = !svg;
    $('illustration').innerHTML = svg || '';
    $('illustration-caption').textContent = illustration?.caption || '';
    $('image-attribution').hidden = !svg;
    $('image-attribution').textContent = svg ? illustration.attribution : '';
  }
  function referenceBookName() {
    const parsed = parseRef(currentReference);
    return parsed ? C.BOOKS[parsed.bookIndex][0].toLowerCase() : bookName().toLowerCase();
  }
  function referenceChapter() { return parseRef(currentReference)?.chapter || chapterNumber; }
  let currentReference = '';
  function contextualSenseFor(word, book, chapter, verse, reference = currentReference) {
    const sense = C.contextualSense(word, book, chapter, verse);
    if (!sense?.guideId) return sense;
    const key = C.semanticCacheKey(word, reference, 'WEB', C.SEMANTIC_INTERPRETER_VERSION);
    if (key && semanticCache[key] !== sense.guideId) {
      semanticCache = { ...semanticCache, [key]: sense.guideId };
      while (Object.keys(semanticCache).length > 300) delete semanticCache[Object.keys(semanticCache)[0]];
      C.persistJSON(localStorage, SEMANTIC_CACHE_KEY, semanticCache);
    }
    return sense;
  }
  function contextualSenseFor(word, book, chapter, verse, reference = currentReference) {
    const sense = C.contextualSense(word, book, chapter, verse);
    if (!sense?.guideId) return sense;
    const key = C.semanticCacheKey(word, reference, 'WEB', C.SEMANTIC_INTERPRETER_VERSION);
    if (!key) return sense;
    if (semanticCache[key] !== sense.guideId) {
      semanticCache = { ...semanticCache, [key]: sense.guideId };
      while (Object.keys(semanticCache).length > 300) delete semanticCache[Object.keys(semanticCache)[0]];
      C.persistJSON(localStorage, SEMANTIC_CACHE_KEY, semanticCache);
    }
    return sense;
  }
  async function getDefinitions(word, token, signal) {
    const key = word;
    if (definitionCache[key]?.groups?.length) {
      const cached = definitionCache[key]; delete definitionCache[key]; definitionCache[key] = cached;
      return cached;
    }
    const candidates = C.lemmaCandidates(word);
    for (const candidate of candidates) {
      try {
        const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(candidate)}`, { signal });
        if (!response.ok) continue;
        const result = C.normalizeDefinitions(await response.json());
        if (token !== lookupToken) return null;
        if (result.groups.length) { cacheDefinition(key, result); return result; }
      } catch (error) { if (error.name === 'AbortError') return null; /* try a normalized form, then the local glossary */ }
    }
    return C.localDefinition(word);
  }
  function cacheDefinition(word, result) {
    definitionCache = { ...definitionCache };
    delete definitionCache[word]; definitionCache[word] = result;
    let serialized = JSON.stringify(definitionCache);
    while ((Object.keys(definitionCache).length > 200 || serialized.length > 300000) && Object.keys(definitionCache).length > 1) {
      delete definitionCache[Object.keys(definitionCache)[0]]; serialized = JSON.stringify(definitionCache);
    }
    try { localStorage.setItem('verseword-def-cache-v3', serialized); } catch { /* definition cache can be fetched again */ }
  }
  function showWordSheet() {
    const sheet = $('word-sheet'), backdrop = $('sheet-backdrop');
    sheet.inert = false; sheet.setAttribute('aria-hidden', 'false'); sheet.classList.add('open'); backdrop.hidden = false;
    document.body.style.overflow = 'hidden'; $('close-sheet').focus();
  }
  function closeWordSheet(restoreFocus = true) {
    const sheet = $('word-sheet');
    if (!sheet.classList.contains('open')) return;
    sheet.classList.remove('open'); sheet.setAttribute('aria-hidden', 'true'); sheet.inert = true; $('sheet-backdrop').hidden = true;
    document.body.style.overflow = ''; lookupToken++;
    dictionaryController?.abort(); dictionaryController = null;
    if (restoreFocus && selectedButton?.isConnected) selectedButton.focus();
    if (selectedButton?.isConnected) selectedButton.classList.remove('selected'); selectedButton = null;
  }
  async function openWord(word, verseNo, button, savedEntry = null) {
    stopSpeech(); dictionaryController?.abort();
    dictionaryController = new AbortController();
    selectedWord = C.normalizeWord(word); selectedVerseNo = Number(verseNo) || 0;
    selectedButton = button || null;
    if (selectedButton) selectedButton.classList.add('selected');
    selectedContext = savedEntry?.example || verseText(selectedVerseNo);
    const storedRef = savedEntry?.reference && parseRef(savedEntry.reference);
    currentReference = savedEntry?.reference || referenceFor();
    if (storedRef) selectedVerseNo = storedRef.verse;
    const token = ++lookupToken, refBook = referenceBookName(), refChapter = referenceChapter();
    const contextual = contextualSenseFor(selectedWord, refBook, refChapter, selectedVerseNo, currentReference);
    currentSense = contextual; currentDefinitions = null; $('save-word').disabled = !contextual;
    $('word-title').textContent = selectedWord;
    $('pronunciation').textContent = 'Looking up pronunciation…';
    $('context-verse').innerHTML = highlightedVerse(selectedContext, selectedWord);
    $('context-reference').textContent = currentReference ? `${currentReference} · World English Bible` : 'World English Bible';
    $('part-of-speech').textContent = 'Checking word type…'; $('sense-source').textContent = '';
    $('sense-title').textContent = 'Meaning in this verse'; $('primary-definition').textContent = 'Checking the verse and dictionary…';
    $('context-note').textContent = 'Checking whether this word has a context-specific meaning.';
    $('meaning-visual').hidden = true; $('image-attribution').hidden = true; $('other-senses').hidden = true;
    $('save-word').classList.toggle('saved', saved.some(entry => entry.word === selectedWord && entry.reference === currentReference));
    $('save-word').textContent = $('save-word').classList.contains('saved') ? '✓ Saved to My Words' : '＋ Save to My Words';
    if (contextual) setSense(contextual, 'VerseWord contextual guide', []);
    showWordSheet();
    try {
      const result = await getDefinitions(selectedWord, token, dictionaryController.signal);
      if (token !== lookupToken) return;
      currentDefinitions = result;
      if (contextual) setSense(contextual, 'VerseWord contextual guide', result?.groups || []);
      else setSense(null, result?.source || 'Dictionary unavailable', result?.groups || []);
      $('pronunciation').textContent = `${result?.phonetic || ''}${result?.phonetic ? ' · ' : ''}${result?.source || 'Pronunciation unavailable'}`;
      renderDefinitions(result?.groups || []);
      $('save-word').disabled = false;
    } catch {
      if (token !== lookupToken) return;
      currentDefinitions = null; if (!contextual) setSense(null, 'Dictionary unavailable', []);
      $('pronunciation').textContent = 'Pronunciation unavailable'; renderDefinitions([]); $('save-word').disabled = false;
    }
  }

  function renderSaved() {
    const preview = $('saved-preview');
    preview.innerHTML = saved.length ? saved.slice(-6).reverse().map((entry, i) => `<button class="saved-word-chip" type="button" data-saved-index="${saved.length - 1 - i}">${esc(entry.word)}</button>`).join('') : '<p class="muted">Save words as you read.</p>';
    const collection = $('saved-collection');
    collection.innerHTML = saved.length ? [...saved].reverse().map((entry, reverseIndex) => {
      const index = saved.length - 1 - reverseIndex;
      return `<article class="word-entry"><div class="word-entry-top"><div><h2>${esc(entry.word)}</h2><span class="entry-pos">${esc(entry.partOfSpeech || 'Vocabulary')}</span></div><div class="entry-actions"><button type="button" data-open-saved="${index}">Review</button><button type="button" data-remove-saved="${index}" aria-label="Remove ${esc(entry.word)} from My Words">Remove</button></div></div><p>${esc(entry.definition || 'Open this saved word to review its meaning.')}</p><small>${esc(entry.reference || 'Saved word')}${entry.savedAt && entry.savedAt !== new Date(0).toISOString() ? ` · Saved ${new Date(entry.savedAt).toLocaleDateString()}` : ''}</small></article>`;
    }).join('') : '<div class="empty-state"><strong>Your collection is ready.</strong><p>Tap a word while reading and save it to keep its meaning and Bible reference here.</p><button class="primary-button" data-view="read" type="button">Start reading</button></div>';
  }
  function saveCurrentWord() {
    const exists = saved.some(entry => entry.word === selectedWord && entry.reference === currentReference && entry.partOfSpeech === (currentSense?.partOfSpeech || currentDefinitions?.groups?.[0]?.partOfSpeech || ''));
    if (!exists && saved.length >= MAX_SAVED_WORDS) { toast('My Words is full. Remove a saved word before adding another.'); return; }
    const entry = { word: selectedWord, lemma: C.lemmaFor(selectedWord), partOfSpeech: currentSense?.partOfSpeech || currentDefinitions?.groups?.[0]?.partOfSpeech || '', definition: $('primary-definition').textContent, reference: currentReference, example: selectedContext, image: currentSense?.illustration ? { id: currentSense.illustration, caption: currentSense.note } : null, savedAt: new Date().toISOString() };
    const nextSaved = C.upsertSavedWord(saved, entry, MAX_SAVED_WORDS);
    if (!C.persistJSON(localStorage, KEY.saved, nextSaved)) { toast('Could not save this word. Check device storage and try again.'); return false; }
    saved = nextSaved; renderSaved();
    $('save-word').classList.add('saved'); $('save-word').textContent = '✓ Saved to My Words'; toast('Saved to My Words');
    return true;
  }
  function removeSaved(index) {
    if (!Number.isInteger(index) || index < 0 || index >= saved.length) return false;
    const nextSaved = saved.filter((_entry, entryIndex) => entryIndex !== index);
    if (!C.persistJSON(localStorage, KEY.saved, nextSaved)) { toast('Could not remove this word. Check device storage and try again.'); return false; }
    saved = nextSaved; renderSaved(); toast('Removed from My Words'); return true;
  }
  function toast(message) {
    const element = $('toast'); element.textContent = message; element.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => element.classList.remove('show'), 2200);
  }

  function switchView(view) {
    if (!['read','words','progress','settings'].includes(view)) return;
    activeView = view;
    document.querySelectorAll('[data-view-panel]').forEach(panel => { const active = panel.dataset.viewPanel === view; panel.hidden = !active; panel.classList.toggle('active', active); });
    document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
    if (view === 'words') renderSaved(); if (view === 'progress') updateProgress();
    $('app-main').focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function applyTheme(choice) {
    const dark = choice === 'dark' || (choice === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.body.classList.toggle('dark', dark);
    document.querySelector('meta[name="theme-color"]').content = dark ? '#0c1425' : '#f5f2eb';
    $('theme-quick').setAttribute('aria-pressed', String(dark));
    $('theme-quick').setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    $('theme-quick').textContent = dark ? '☼' : '◐';
    if ($('theme-setting').value !== choice) $('theme-setting').value = choice;
  }
  function setTheme(choice, persist = true) {
    if (!['system','light','dark'].includes(choice)) choice = 'system';
    if (persist) {
      const result = C.updateSettings(localStorage, KEY.settings, settings, { theme: choice });
      if (!result.persisted) toast('Theme changed for this session but could not be saved on this device.');
      Object.assign(settings, result.settings);
    } else settings.theme = choice;
    applyTheme(choice);
  }
  function applyReadingSettings() {
    const size = Math.max(18, Math.min(30, Number(settings.fontSize) || 21));
    const leading = ['1.65','1.85','2.05'].includes(String(settings.lineHeight)) ? settings.lineHeight : '1.85';
    document.documentElement.style.setProperty('--reader-size', `${size}px`);
    document.documentElement.style.setProperty('--reader-leading', leading);
    $('font-size-setting').value = String(size); $('font-size-value').value = `${size} px`; $('line-height-setting').value = leading;
  }
  function stopSpeech() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    if (activeUtteranceButton) {
      activeUtteranceButton.setAttribute('aria-pressed', 'false');
      activeUtteranceButton.setAttribute('aria-label', activeUtteranceButton.id === 'speak' ? 'Read chapter aloud' : 'Hear pronunciation');
      activeUtteranceButton.title = activeUtteranceButton.id === 'speak' ? 'Read aloud' : 'Hear pronunciation';
    }
    activeUtterance = null; activeUtteranceButton = null;
  }
  function speak(text, button) {
    if (!('speechSynthesis' in window)) { toast('Audio is not available on this device.'); return; }
    if (activeUtteranceButton === button && (speechSynthesis.speaking || speechSynthesis.pending)) { stopSpeech(); return; }
    stopSpeech();
    const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'en-US';
    activeUtterance = utterance; activeUtteranceButton = button;
    button.setAttribute('aria-pressed', 'true'); button.setAttribute('aria-label', button.id === 'speak' ? 'Stop reading aloud' : 'Stop pronunciation'); button.title = 'Stop audio';
    const finish = () => { if (activeUtterance === utterance) stopSpeech(); };
    utterance.onend = finish; utterance.onerror = finish;
    speechSynthesis.speak(utterance);
  }
  function formatBytes(bytes) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  function populateOfflineBookPicker() {
    $('offline-book-picker').innerHTML = C.BOOKS.map(([name], index) => `<option value="${index}">${esc(name)}</option>`).join('');
    $('offline-book-picker').value = String(bookIndex); updateOfflineEstimate();
  }
  function updateOfflineEstimate() {
    const book = C.BOOKS[Number($('offline-book-picker').value)] || C.BOOKS[0];
    $('offline-estimate').textContent = `Estimated size: about ${formatBytes(C.estimatedBookBytes(book[2]))}. Actual size varies by book and browser storage.`;
  }
  async function refreshOfflineBooks() {
    const status = $('offline-download-status');
    if (!offlineStore) { status.textContent = 'Persistent offline downloads are not available in this browser.'; $('offline-download').disabled = true; $('offline-remove').disabled = true; return; }
    try {
      const books = await offlineStore.listBooks();
      const selected = books.find(book => book.bookIndex === Number($('offline-book-picker').value));
      $('offline-remove').disabled = !selected || Boolean(bookDownloadController);
      if (books.length && !bookDownloadController) status.textContent = `Stored offline: ${books.map(book => C.BOOKS[book.bookIndex]?.[0]).filter(Boolean).join(', ')}.`;
      else if (!books.length && !bookDownloadController) status.textContent = 'No books downloaded yet.';
    } catch { status.textContent = 'Could not read offline storage. Check browser storage settings.'; }
  }
  async function downloadBook() {
    if (!offlineStore || bookDownloadController) return;
    const selectedBook = Number($('offline-book-picker').value), [name, code, chapterCount] = C.BOOKS[selectedBook];
    const approximate = C.estimatedBookBytes(chapterCount);
    try {
      const existingBooks = await offlineStore.listBooks();
      const existingBytes = existingBooks.find(book => book.bookIndex === selectedBook)?.bytes || 0;
      const storage = await navigator.storage?.estimate?.();
      if (storage?.quota && storage.quota - storage.usage < Math.max(0, approximate - existingBytes) * 1.1) {
        $('offline-download-status').textContent = 'There may not be enough storage for this book. Free space on this device and try again.'; return;
      }
    } catch { /* storage estimates are optional */ }
    const controller = new AbortController(); bookDownloadController = controller;
    const progress = $('offline-download-progress'); progress.max = chapterCount; progress.value = 0; progress.hidden = false;
    $('offline-download').disabled = true; $('offline-cancel').disabled = false; $('offline-remove').disabled = true;
    let totalBytes = 0, savedCount = 0;
    try {
      for (let chapter = 1; chapter <= chapterCount; chapter += 1) {
        if (controller.signal.aborted) throw new DOMException('Download cancelled', 'AbortError');
        const key = `${code}-${chapter}`;
        let record = await offlineStore.getChapter(key);
        if (!record?.downloaded || record.translation !== 'WEB' || !C.isOrderedChapter(record.verses)) {
          $('offline-download-status').textContent = `Downloading ${name} ${chapter} of ${chapterCount}…`;
          const response = await fetch(apiUrl(selectedBook, chapter), { headers: { Accept: 'application/json' }, signal: controller.signal });
          if (!response.ok) throw new Error(`Could not download ${name} ${chapter} (${response.status}).`);
          const verses = C.normalizeChapter(await response.json());
          if (!C.isOrderedChapter(verses)) throw new Error(`${name} ${chapter} returned incomplete or out-of-order verses. The download stopped.`);
          const bytes = new TextEncoder().encode(JSON.stringify(verses)).length;
          record = { key, bookIndex: selectedBook, chapter, verses, bytes, translation: 'WEB', downloadedAt: new Date().toISOString() };
          await offlineStore.putChapter(record); totalBytes += bytes;
        } else totalBytes += Number(record.bytes) || new TextEncoder().encode(JSON.stringify(record.verses)).length;
        savedCount += 1; progress.value = chapter;
        if (chapter < chapterCount) await new Promise(resolve => setTimeout(resolve, 2100));
      }
      $('offline-download-status').textContent = `${name} is ready offline (${formatBytes(totalBytes)}).`;
    } catch (error) {
      $('offline-download-status').textContent = error.name === 'AbortError' ? `${name} download cancelled. ${savedCount} of ${chapterCount} chapters are available offline.` : `${error.message} ${savedCount} of ${chapterCount} chapters are available offline.`;
    } finally {
      bookDownloadController = null; $('offline-download').disabled = false; $('offline-cancel').disabled = true;
      progress.hidden = true; await refreshOfflineBooks();
    }
  }
  async function removeOfflineBook() {
    if (!offlineStore || bookDownloadController) return;
    const selectedBook = Number($('offline-book-picker').value), name = C.BOOKS[selectedBook][0];
    try {
      const removed = await offlineStore.removeBook(selectedBook);
      $('offline-download-status').textContent = removed ? `Removed ${name} offline download (${removed} chapters).` : `${name} has no stored download.`;
      await refreshOfflineBooks();
    } catch { $('offline-download-status').textContent = `Could not remove ${name}. Check browser storage settings and try again.`; }
  }
  function focusTrap(event) {
    if (event.key !== 'Tab' || !$('word-sheet').classList.contains('open')) return;
    const nodes = [...$('word-sheet').querySelectorAll('button:not([disabled]),summary,[href],input,select,[tabindex]:not([tabindex="-1"])')].filter(node => !node.hidden && node.getClientRects().length);
    if (!nodes.length) return;
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  document.addEventListener('click', event => {
    const nav = event.target.closest('[data-view]'); if (nav) { switchView(nav.dataset.view); return; }
    const wordButton = event.target.closest('button[data-word]');
    if (wordButton) { const verse = chapterVerses.find(item => item.number === Number(wordButton.dataset.verse)); openWord(wordButton.dataset.word, Number(wordButton.dataset.verse), wordButton, { example: verse?.text || '', reference: referenceFor(bookIndex, chapterNumber, Number(wordButton.dataset.verse)) }); return; }
    const savedButton = event.target.closest('[data-saved-index],[data-open-saved]');
    if (savedButton) {
      const index = Number(savedButton.dataset.savedIndex ?? savedButton.dataset.openSaved), entry = saved[index];
      if (entry) { const parsed = parseRef(entry.reference); openWord(entry.word, parsed?.verse || 0, null, entry); }
      return;
    }
    const removeButton = event.target.closest('[data-remove-saved]'); if (removeButton) removeSaved(Number(removeButton.dataset.removeSaved));
  });
  $('book-picker').addEventListener('change', event => { bookIndex = Number(event.target.value); chapterNumber = 1; populateChapters(); storePosition(); loadChapter(); });
  $('chapter-picker').addEventListener('change', event => { chapterNumber = Number(event.target.value); storePosition(); loadChapter(); });
  $('previous').addEventListener('click', () => moveChapter(-1)); $('next').addEventListener('click', () => moveChapter(1));
  $('speak').addEventListener('click', () => speak(chapterVerses.map(verse => verse.text).join(' '), $('speak')));
  $('speak-word').addEventListener('click', () => speak(selectedWord, $('speak-word')));
  $('close-sheet').addEventListener('click', () => closeWordSheet()); $('sheet-backdrop').addEventListener('click', () => closeWordSheet());
  $('save-word').addEventListener('click', saveCurrentWord);
  $('theme-quick').addEventListener('click', () => setTheme(document.body.classList.contains('dark') ? 'light' : 'dark'));
  $('theme-setting').addEventListener('change', event => setTheme(event.target.value));
  $('offline-book-picker').addEventListener('change', () => { updateOfflineEstimate(); refreshOfflineBooks(); });
  $('offline-download').addEventListener('click', downloadBook);
  $('offline-cancel').addEventListener('click', () => bookDownloadController?.abort());
  $('offline-remove').addEventListener('click', removeOfflineBook);
  $('font-size-setting').addEventListener('input', event => { settings.fontSize = Number(event.target.value); $('font-size-value').value = `${settings.fontSize} px`; applyReadingSettings(); writeJSON(KEY.settings, settings); });
  $('line-height-setting').addEventListener('change', event => { settings.lineHeight = event.target.value; applyReadingSettings(); writeJSON(KEY.settings, settings); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && $('word-sheet').classList.contains('open')) closeWordSheet();
    const activeWord = document.activeElement.closest?.('.word');
    if (activeWord && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
      const words = [...$('reader-text').querySelectorAll('.word')], index = words.indexOf(activeWord), next = words[index + (event.key === 'ArrowRight' ? 1 : -1)];
      if (next) { event.preventDefault(); activeWord.tabIndex = -1; next.tabIndex = 0; next.focus(); }
    }
    focusTrap(event);
  });
  let touchStartY = 0;
  $('word-sheet').addEventListener('touchstart', event => { touchStartY = event.touches[0]?.clientY || 0; }, { passive: true });
  $('word-sheet').addEventListener('touchend', event => { const endY = event.changedTouches[0]?.clientY || 0; if (window.matchMedia('(max-width: 680px)').matches && endY - touchStartY > 95 && $('word-sheet').scrollTop === 0) closeWordSheet(); }, { passive: true });
  window.addEventListener('online', () => { $('offline-state').textContent = ''; if (!chapterVerses.length) loadChapter(); });
  window.addEventListener('offline', () => { $('offline-state').textContent = 'Offline'; });
  if (matchMedia('(prefers-color-scheme: dark)').addEventListener) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if ((settings.theme || 'system') === 'system') applyTheme('system'); });

  migrateLocalData(); populateBooks(); renderSaved(); updateProgress(); applyReadingSettings(); populateOfflineBookPicker(); refreshOfflineBooks();
  const selectedTheme = settings.theme || localStorage.getItem('verseword-theme') || 'system';
  setTheme(selectedTheme, false); $('word-sheet').inert = true;
  loadChapter();
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').then(registration => registration.update()).catch(() => { /* online browsing remains available */ }));
})();
