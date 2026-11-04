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

VerseWord includes reviewed contextual notes for Genesis 1:3 `light`, John 8:12 `light`, and Psalm 23 `shepherd`. Those entries distinguish physical light, figurative guidance, and the shepherd image of care. Original in-app SVG illustrations are shown only for those exact contextual entries. Other words use clearly identified general dictionary meanings, with no automatic image based on keyword matching.

## Local data and offline use

Saved words, reading progress, preferences, and up to 14 recently opened chapters are stored in the browser. Existing `verseword-saved`, `verseword-read`, and `verseword-chapters` data is read and migrated when the app loads. Chapter and dictionary caches are bounded. New word entries stop at 500 so storage stays predictable; all entries already saved by a user are preserved. Previously cached chapters remain available offline. The service worker waits for active clients to finish before installing an update and does not reload an open reading session.

The app is an installable web PWA. This repository does not include a native Android APK.

## Known limitations

- Context-specific definitions are a small reviewed guide, not an AI or full Bible-language commentary. Other dictionary meanings remain general and are explicitly labeled as such.
- New chapter text and dictionary definitions require a connection. Previously cached chapters and the local glossary continue to work offline.
- Text classification and lemma lookup use dictionary metadata plus a short irregular-form list; they do not attempt full grammatical parsing.
