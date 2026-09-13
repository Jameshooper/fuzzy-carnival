# Changelog

## 1.2.0

- Import a recipe from a PDF upload (e.g. a Claude conversation saved or
  exported as a PDF) — extracts the text and runs it through the same
  parser used for pasted text.
- Uses `pdfjs-dist` directly for PDF text extraction rather than the
  `pdf-parse` package: its bundled legacy pdf.js builds threw errors on
  valid, freshly-generated PDFs under this project's Node version, a
  real compatibility bug rather than a fluke of any one file.

## 1.1.0

- Import a recipe directly from a link: fetches the page and reads its
  schema.org Recipe data (title, ingredients, instructions, times, tags,
  photo) instead of requiring pasted text.
- A bare link pasted into the Import screen's text box is now detected
  automatically and treated as a link import.
- Recipe photos from an imported link are downloaded and attached
  automatically.
- Documented the iOS/iPhone reality: Safari has no Web Share Target
  support (WebKit bug 194593, unimplemented), so the share-sheet feature
  is Android-only. Documented a Shortcuts-app-based workaround and the
  link-import path as the two ways to get recipes in on iOS.

## 1.0.0

- Initial release: recipes CRUD with photos, tags, favorites, search.
- Share recipes in from Claude/other apps via the Web Share Target API,
  with a heuristic text parser.
- Share recipes out via the Web Share API (social/messaging apps).
- Best-effort Prisma price/availability check, plus always-on Prisma and
  Citymarket search links per ingredient.
- Installable PWA (add to home screen).
- Packaged as a Home Assistant add-on.
