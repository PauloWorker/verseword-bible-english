# VerseWord

VerseWord is a static Bible reader and English vocabulary learning PWA. It serves its deployable files from `dist/`, which keeps the existing Sites hosting setup operational.

## Development

This project uses browser-native JavaScript and Node's built-in tooling. It has no package dependencies.

```sh
npm test
npm run build
```

The build copies the maintained source files and app icons from `src/` into `dist/`. The app gets the World English Bible chapter text from Dabar, general dictionary entries from Free Dictionary API, and pronunciation audio from the browser's speech synthesis when available.

## Contextual meanings and illustrations

VerseWord includes a small reviewed contextual guide for Genesis 1:2 `waters`, Genesis 1:3 `light`, Genesis 1:11 `seed`, John 6:35 `bread`, John 8:12 `light`, and Psalm 23 `shepherd`. The cache key includes the normalized word, exact verse, translation, and guide version. A context-specific result is shown only when the selected word and reference match a reviewed guide entry. Other words retain general dictionary results and are labeled as unverified in that verse. Original SVG illustrations are attached to reviewed entries only; no keyword-only image match is used. This is an extensible guide, not a full-Bible contextual interpreter.

## Local data and offline use

Saved words, reading progress, preferences, and up to 14 recently opened chapters are stored in the browser. Existing `verseword-saved`, `verseword-read`, and `verseword-chapters` data is read and migrated when the app loads. Chapter and dictionary caches are bounded. New word entries stop at 500 so storage stays predictable; all entries already saved by a user are preserved. Saving and removing a word confirm that browser storage accepted the change before the interface reports success.

The Settings page can download one selected book to IndexedDB, resume a partial download, report progress, and remove that explicit download. It checks chapter order and completeness, shows an approximate size before starting and the measured size after completion, and keeps downloaded records separate from temporary caches. Routine service worker cache cleanup does not delete IndexedDB content. The size estimate uses 12 KiB per chapter and can differ from actual browser storage use. Downloads are rate limited to about one chapter request every 2.1 seconds to respect the current Dabar API limit. The provider asks clients not to retrieve the entire Bible through its API; a whole-Bible download is not included. Recently opened temporary chapters may remain after removing a book download.

The World English Bible is public domain; do not change its text while continuing to identify it as the World English Bible. The provider API has its own usage limit and does not guarantee availability. See [eBible.org's translation page](https://ebible.org/details.php?id=engwebp) and [Dabar's API usage terms](https://www.dabar.io/).

The app is an installable web PWA. This repository does not include a native Android APK.

## Known limitations

- Context-specific definitions are a small reviewed guide, not an AI or full Bible-language commentary. Other dictionary meanings remain general and are explicitly labeled as such.
- A selected book can be saved offline. Uncached chapters and general dictionary lookups need a connection; the Dabar API is rate limited and must not be used to download the full Bible.
- Text classification and lemma lookup use dictionary metadata plus a short irregular-form list; they do not attempt full grammatical parsing.
