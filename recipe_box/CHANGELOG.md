# Changelog

## 1.3.1

- Fix: PDF text extraction could still log (non-fatal) internal warnings
  and silently lose font-metric data on Node.js builds that lack
  `process.getBuiltinModule` — including the Node version currently
  shipped by the Home Assistant add-on base image. pdfjs-dist uses that
  API internally to read its own bundled standard-font/CMap files and to
  optionally load an unused canvas package; where it's missing, it falls
  back to a bare warning rather than crashing, but also silently can't
  read those files. Since a plain `require()` reaches the exact same
  Node builtins on any version, `process.getBuiltinModule` is now
  polyfilled with that directly (in `domPolyfills.js`, alongside the
  1.2.1 DOMMatrix fix) — confirmed via the same "delete the API, retest"
  simulation that caught the original issue: all warnings gone, and
  fonts load correctly instead of just failing silently.

## 1.3.0

- Scale a recipe: ½×, 2×, 3×, or a custom multiplier on the recipe
  screen. Recalculates every ingredient's quantity (integers, decimals,
  simple and mixed fractions, unicode fraction glyphs, and ranges like
  "3-4 cloves"), updates the serving count, and carries through to
  Share. Entirely client-side and non-destructive — never saved over
  the recipe's original text, and checkbox state survives a scale
  change.

## 1.2.1

- Fix: PDF upload could fail with a raw "DOMMatrix is not defined"
  error. Some PDFs (certain embedded font types compute glyph widths by
  interpreting literal drawing operators) touch browser-only APIs even
  during plain text extraction, which don't exist in Node.js. Added a
  small, correctness-tested polyfill for the DOMMatrix/Path2D/ImageData
  surface pdfjs-dist's font code actually calls (a third-party
  `dommatrix` package was tried first but turned out to be missing the
  self-mutating methods — `preMultiplySelf`, `invertSelf`,
  `multiplySelf` — pdf.js needs).
- A single page failing to extract no longer aborts the whole PDF import
  or leaks a raw internal error to the UI — it's skipped, and the rest
  of the document is still used.

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
