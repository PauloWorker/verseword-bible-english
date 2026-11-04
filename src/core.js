(function (root, factory) {
  const core = factory();
  if (typeof module === 'object' && module.exports) module.exports = core;
  if (root) root.VerseWordCore = core;
})(typeof globalThis === 'undefined' ? this : globalThis, function () {
  'use strict';

  const BOOKS = [
    ['Genesis','GEN',50],['Exodus','EXO',40],['Leviticus','LEV',27],['Numbers','NUM',36],['Deuteronomy','DEU',34],['Joshua','JOS',24],['Judges','JDG',21],['Ruth','RUT',4],['1 Samuel','1SA',31],['2 Samuel','2SA',24],['1 Kings','1KI',22],['2 Kings','2KI',25],['1 Chronicles','1CH',29],['2 Chronicles','2CH',36],['Ezra','EZR',10],['Nehemiah','NEH',13],['Esther','EST',10],['Job','JOB',42],['Psalms','PSA',150],['Proverbs','PRO',31],['Ecclesiastes','ECC',12],['Song of Solomon','SNG',8],['Isaiah','ISA',66],['Jeremiah','JER',52],['Lamentations','LAM',5],['Ezekiel','EZK',48],['Daniel','DAN',12],['Hosea','HOS',14],['Joel','JOL',3],['Amos','AMO',9],['Obadiah','OBA',1],['Jonah','JON',4],['Micah','MIC',7],['Nahum','NAM',3],['Habakkuk','HAB',3],['Zephaniah','ZEP',3],['Haggai','HAG',2],['Zechariah','ZEC',14],['Malachi','MAL',4],
    ['Matthew','MAT',28],['Mark','MRK',16],['Luke','LUK',24],['John','JHN',21],['Acts','ACT',28],['Romans','ROM',16],['1 Corinthians','1CO',16],['2 Corinthians','2CO',13],['Galatians','GAL',6],['Ephesians','EPH',6],['Philippians','PHP',4],['Colossians','COL',4],['1 Thessalonians','1TH',5],['2 Thessalonians','2TH',3],['1 Timothy','1TI',6],['2 Timothy','2TI',4],['Titus','TIT',3],['Philemon','PHM',1],['Hebrews','HEB',13],['James','JAS',5],['1 Peter','1PE',5],['2 Peter','2PE',3],['1 John','1JN',5],['2 John','2JN',1],['3 John','3JN',1],['Jude','JUD',1],['Revelation','REV',22]
  ];
  const TOTAL_CHAPTERS = BOOKS.reduce((sum, book) => sum + book[2], 0);
  const POS_ORDER = ['verb','noun','adjective','adverb','pronoun','preposition','conjunction','determiner','interjection','other'];

  const LOCAL_WORDS = {
    beginning: ['the time when something starts; the first part of a story or event.', 'bih-GIN-ing', 'noun'],
    created: ['made something that did not exist before.', 'kree-AY-tid', 'verb'],
    heaven: ['the sky and the space above the earth.', 'HEV-un', 'noun'], heavens: ['the sky and the space above the earth.', 'HEV-unz', 'noun'],
    earth: ['the world where people, animals, and plants live; the ground beneath our feet.', 'urth', 'noun'],
    light: ['brightness that lets us see; the opposite of darkness.', 'lite', 'noun'], darkness: ['a state with little or no light.', 'DARK-nis', 'noun'],
    god: ['In the Bible, God is the creator and ruler of everything.', 'god', 'proper noun'], without: ['not having something; with none of it.', 'wi-THOUT', 'preposition'],
    void: ['completely empty; having nothing inside.', 'voyd', 'adjective'], good: ['helpful, pleasant, or of a high quality.', 'good', 'adjective'],
    day: ['the time when it is light outside, or a period of 24 hours.', 'day', 'noun'], night: ['the dark part of each day, when the sun is down.', 'nite', 'noun'],
    shepherd: ['a person who takes care of sheep.', 'SHEP-erd', 'noun'], seed: ['the small part of a plant from which a new plant can grow.', 'seed', 'noun'],
    bread: ['food made from flour, usually baked into a loaf.', 'bred', 'noun'], king: ['a person who rules a country or kingdom.', 'king', 'noun'],
    river: ['a large natural stream of water.', 'RIV-er', 'noun'], peace: ['a time or state without fighting or trouble.', 'pees', 'noun'],
    wisdom: ['the ability to make good choices using knowledge and experience.', 'WIZ-dum', 'noun'], divided: ['separated something into parts or groups.', 'di-VY-did', 'verb'],
    called: ['gave someone or something a name; or asked someone to come.', 'kawld', 'verb'], said: ['spoke words.', 'sed', 'verb'], saw: ['noticed something using the eyes.', 'saw', 'verb'], was: ['existed or had a particular state in the past.', 'wuz', 'verb']
  };

  const CONTEXTUAL_SENSES = {
    'light|genesis|1|3': {
      partOfSpeech: 'Noun', definition: 'Physical brightness that makes it possible to see; here, the light God creates and separates from darkness.',
      note: 'This verse describes physical light in the creation story.', example: 'God said, “Let there be light,” and there was light.', illustration: 'physical-light'
    },
    'light|john|8|12': {
      partOfSpeech: 'Noun', definition: 'A picture of guidance and life from God. Jesus is described as the one who leads people out of spiritual darkness.',
      note: 'Here “light” is figurative guidance, not a lamp or flashlight.', example: 'Jesus said, “I am the light of the world.”', illustration: 'guiding-light'
    },
    'shepherd|psalms|23|*': {
      partOfSpeech: 'Noun', definition: 'A person who protects, feeds, and guides sheep; in this psalm, a picture of God caring for and guiding people.',
      note: 'The shepherd image is both a real occupation and a comparison for caring guidance.', example: 'The Lord is my shepherd; I shall lack nothing.', illustration: 'shepherd'
    }
  };

  const IRREGULAR_LEMMAS = { was:'be', were:'be', is:'be', are:'be', am:'be', went:'go', gone:'go', saw:'see', seen:'see', said:'say', made:'make', took:'take', given:'give', came:'come', knew:'know', thought:'think', children:'child', men:'man', women:'woman' };
  const COMMON_LEMMAS = { created:'create', divided:'divide', called:'call', loved:'love', moved:'move', used:'use', named:'name', saved:'save', hoped:'hope', lived:'live', stopped:'stop', planned:'plan', hopped:'hop', running:'run', beginning:'begin', making:'make', taking:'take', coming:'come' };

  function normalizeWord(word) { return String(word || '').toLowerCase().replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ''); }
  function lemmaCandidates(word) {
    const w = normalizeWord(word);
    const values = [IRREGULAR_LEMMAS[w], w];
    if (w.endsWith('ies')) values.push(w.slice(0, -3) + 'y');
    if (w.endsWith('ing')) values.push(w.slice(0, -3), w.slice(0, -3) + 'e');
    if (w.endsWith('ed')) values.push(w.slice(0, -2), w.slice(0, -1), w.slice(0, -1) + 'e');
    if (w.endsWith('es')) values.push(w.slice(0, -2), w.slice(0, -1));
    if (w.endsWith('s')) values.push(w.slice(0, -1));
    return [...new Set(values.filter(Boolean))];
  }
  function lemmaFor(word) {
    const w = normalizeWord(word);
    if (IRREGULAR_LEMMAS[w]) return IRREGULAR_LEMMAS[w];
    if (COMMON_LEMMAS[w]) return COMMON_LEMMAS[w];
    if (w.endsWith('ies')) return w.slice(0, -3) + 'y';
    if (w.endsWith('ing')) return w.slice(0, -3) + (w.slice(0, -3).endsWith('e') ? '' : 'e');
    if (w.endsWith('ed')) {
      const stem = w.slice(0, -2);
      if (/(.)\1$/.test(stem)) return stem.slice(0, -1);
      if (/(creat|divid|lov|mov|us|nam|sav|hop|liv|receiv|believ|giv)$/.test(stem)) return `${stem}e`;
      return stem;
    }
    if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
    return w;
  }
  function normalizePartOfSpeech(pos) {
    const p = String(pos || 'other').toLowerCase();
    return ({ n:'Noun', v:'Verb', adj:'Adjective', adv:'Adverb', pron:'Pronoun', prep:'Preposition', conj:'Conjunction', det:'Determiner', int:'Interjection' })[p] || p.charAt(0).toUpperCase() + p.slice(1);
  }
  function localDefinition(word) {
    const entry = LOCAL_WORDS[normalizeWord(word)];
    if (!entry) return null;
    return { lemma: lemmaCandidates(word)[0], groups: [{ partOfSpeech: normalizePartOfSpeech(entry[2]), definitions: [{ definition: entry[0], example: '' }] }], phonetic: entry[1], source: 'VerseWord glossary' };
  }
  function normalizeDefinitions(data) {
    const entries = Array.isArray(data) ? data : [data];
    const groups = new Map();
    for (const entry of entries) for (const meaning of entry?.meanings || []) {
      const label = normalizePartOfSpeech(meaning.partOfSpeech), key = label.toLowerCase();
      const definitions = (meaning.definitions || []).filter(x => x && x.definition).slice(0, 3);
      if (!definitions.length) continue;
      if (!groups.has(key)) groups.set(key, { partOfSpeech: label, definitions: [] });
      groups.get(key).definitions.push(...definitions);
    }
    const ordered = [...groups.values()].map(group => ({ ...group, definitions: group.definitions.slice(0, 5) }))
      .sort((a, b) => POS_ORDER.indexOf(a.partOfSpeech.toLowerCase()) - POS_ORDER.indexOf(b.partOfSpeech.toLowerCase()));
    return { lemma: entries[0]?.word || '', groups: ordered, phonetic: entries[0]?.phonetic || entries[0]?.phonetics?.find(p => p.text)?.text || '', source: 'Free Dictionary' };
  }
  function contextualSense(word, book, chapter, verse) {
    const key = `${normalizeWord(word)}|${String(book || '').toLowerCase()}|${Number(chapter)}|${verse === undefined ? '*' : Number(verse)}`;
    const wildcardKey = `${normalizeWord(word)}|${String(book || '').toLowerCase()}|${Number(chapter)}|*`;
    return CONTEXTUAL_SENSES[key] || CONTEXTUAL_SENSES[wildcardKey] || null;
  }
  function illustrationFor(word, book, chapter, verse) {
    const sense = contextualSense(word, book, chapter, verse);
    return sense?.illustration ? { id: sense.illustration, caption: sense.note, attribution: 'Original VerseWord illustration' } : null;
  }
  function resolveChapter(bookIndex, chapter, delta) {
    let index = Math.max(0, Math.min(BOOKS.length - 1, Number(bookIndex) || 0));
    let number = Number(chapter) + Number(delta);
    if (number < 1) {
      index = (index + BOOKS.length - 1) % BOOKS.length;
      number = BOOKS[index][2];
    } else if (number > BOOKS[index][2]) {
      index = (index + 1) % BOOKS.length;
      number = 1;
    }
    return { bookIndex: index, chapter: number };
  }
  function normalizeChapter(data) {
    const raw = Array.isArray(data) ? data : (data?.verses || data?.chapter || []);
    return raw.map((verse, index) => ({ number: Number(verse.verse || verse.number || index + 1), text: String(verse.text || verse.content || '').trim() })).filter(verse => Number.isFinite(verse.number) && verse.text);
  }
  function migrateSavedWords(input, limit = 500) {
    const result = [], seen = new Set();
    for (const item of Array.isArray(input) ? input : []) {
      const old = typeof item === 'string' ? { word: item } : item;
      if (!old || !old.word) continue;
      const word = normalizeWord(old.word);
      if (!word) continue;
      const key = `${word}|${old.reference || ''}|${old.partOfSpeech || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ word, lemma: old.lemma || lemmaFor(word), partOfSpeech: old.partOfSpeech || '', definition: old.definition || '', reference: old.reference || '', example: old.example || '', image: old.image || null, savedAt: old.savedAt || new Date(0).toISOString() });
    }
    return result.slice(-limit);
  }
  function upsertSavedWord(current, item, limit = 500) {
    const next = migrateSavedWords(current, limit);
    const normalized = migrateSavedWords([item], limit)[0];
    if (!normalized) return next;
    const key = `${normalized.word}|${normalized.reference}|${normalized.partOfSpeech}`;
    const index = next.findIndex(entry => `${entry.word}|${entry.reference}|${entry.partOfSpeech}` === key);
    if (index >= 0) next[index] = normalized; else next.push(normalized);
    return next.slice(-limit);
  }
  function readCache(cache, key, maxEntries = 14) {
    if (!cache || !Object.prototype.hasOwnProperty.call(cache, key)) return { cache: cache || {}, value: null };
    const next = { ...cache }, value = next[key];
    delete next[key]; next[key] = value;
    while (Object.keys(next).length > maxEntries) delete next[Object.keys(next)[0]];
    return { cache: next, value };
  }
  function canApplyChapterResponse(requestToken, latestToken, requestedKey, currentKey) {
    return requestToken === latestToken && requestedKey === currentKey;
  }

  return { BOOKS, TOTAL_CHAPTERS, LOCAL_WORDS, normalizeWord, lemmaCandidates, lemmaFor, normalizePartOfSpeech, localDefinition, normalizeDefinitions, contextualSense, illustrationFor, resolveChapter, normalizeChapter, migrateSavedWords, upsertSavedWord, readCache, canApplyChapterResponse };
});
