# Changelog

## 1.5.1

- Fix a real crash bug: several routes (recipe creation, attaching a
  found photo, store price checks) had no error handling around an
  `async` handler. Express 4 (what this app uses) does not auto-catch a
  rejected promise from an async route handler — a plain `throw` inside
  one (even a synchronous one, like a database call failing) becomes an
  unhandled rejection, and Node terminates the *entire process* on an
  unhandled rejection by default. That matches exactly what showed up
  as repeated clean start-then-stop cycles in the add-on log with no
  visible error: the server wasn't being stopped from outside, it was
  crashing silently and taking every in-flight request down with it.
  All async route handlers are now wrapped in a small `asyncHandler()`
  utility that routes failures through the normal error response
  instead, and a global safety-net handler now logs (rather than
  silently swallows) anything that still slips through. Verified with a
  side-by-side reproduction: the same failure, unwrapped, previously
  hung the request forever and could take the process down; wrapped, it
  returns a normal error response and the server stays up.
- Image search: added diagnostic logging to help pin down "no photos
  found" reports — distinguishes an HTTP-level failure (with response
  body), a genuinely empty Openverse result set, and the case where
  Openverse returned results but none survived field-name parsing
  (which would mean a real bug, not a coverage gap).
- Add-on version bumped to 1.5.1.

## 1.5.0

- "🔍 Find a photo online" — searches Openverse (openly-licensed images
  from Wikimedia Commons, Flickr, museums, and more; no API key needed)
  by the recipe's title and shows a row of candidate photos with their
  license, on both the recipe form and any existing recipe with no
  photo. You pick the one you want rather than one being auto-attached.
  Only runs when tapped, same as the store price check.

## 1.4.0

- Convert a recipe between metric and US imperial units, alongside
  scaling (combines with it — "2× in metric" is one setting). Converts
  ingredient volumes (tsp/tbsp/cup/pt/qt/gal ⇄ ml/l) and weights (oz/lb
  ⇄ g/kg), plus oven temperatures in the instructions (°F ⇄ °C).
  Ingredients with no recognized unit ("3 eggs") are left as plain
  counts. Picks the unit a recipe would actually use — e.g. 250 ml
  reads as "1 cup", not the equivalent but unidiomatic "½ pint"; 8 oz
  stays "8 oz" rather than becoming "½ lb" — rather than just doing the
  raw conversion math and letting the number pick whatever unit it
  lands closest to.

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
