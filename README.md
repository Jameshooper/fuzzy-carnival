# Recipe Box 🍽️

A self-hosted, mobile-first recipe manager. Add it to your phone's home
screen like an app, save recipes shared from Claude (or any app) via your
phone's share sheet, share recipes back out to social/messaging apps,
and check ingredient prices at Prisma and Citymarket.

The app lives in [`recipe_box/`](recipe_box/) and runs **either**:

- as a **Home Assistant add-on** (recommended if you already run Home
  Assistant OS/Supervised — install from the Add-on Store, no Docker
  commands to run yourself), or
- as a **plain standalone Docker container** anywhere else, via the
  `docker-compose.yml` at this repo's root.

It's the same app either way — same code, same data format — just two
different ways of starting it.

## Features

- **Mobile web app (PWA)** — installable to your phone's home screen,
  works full-screen, has a bottom nav bar and offline-capable app shell.
- **Share recipes *into* the app** — registers as a target in your phone's
  OS share sheet. Copy a recipe out of a Claude conversation (or a
  recipe website, or a text message), tap **Share → Recipe Box**, and the
  text is parsed into a structured draft (title, ingredients,
  instructions, servings, times, source link) for you to review and save.
  You can also just paste text manually from the **Import** screen.
- **Share recipes *out*** — every recipe has a Share button that opens
  your phone's native share sheet (via the Web Share API) so you can send
  a nicely formatted recipe to Messages, WhatsApp, Instagram, email, etc.
  Falls back to copy-to-clipboard on desktop browsers.
- **Check grocery prices** — each recipe has a "🛒 Check store prices"
  button. It always shows a one-tap search link per ingredient for both
  **Prisma** (s-kaupat.fi) and **Citymarket** (k-ruoka.fi); for Prisma it
  also attempts a best-effort live price/availability lookup. See
  [Grocery store integration](#grocery-store-integration-prisma--citymarket)
  below for the honest details on how reliable that is.
- Search, tag filters, favorites, photos, and a clean ingredient
  checklist / numbered steps view for cooking.
- Single-password protected (no accounts to manage) — good enough for
  sharing with family on your home network, and safe enough to expose
  through a reverse proxy if you want access away from home.
- SQLite storage — no external database needed.

## Option A: Home Assistant Add-on

Requires Home Assistant OS or Supervised (the Add-on Store needs the
Supervisor — plain "Home Assistant Core" installs don't have it; see
[recipe_box/DOCS.md](recipe_box/DOCS.md) for a systemd-based no-Docker
alternative if that's your setup).

1. In Home Assistant: **Settings → Add-ons → Add-on Store → ⋮ (top
   right) → Repositories**, and add this repo's URL:
   `https://github.com/Jameshooper/fuzzy-carnival`
2. Find **Recipe Box** in the store and click **Install** (the first
   build compiles a native module and can take a few minutes, especially
   on a Raspberry Pi).
3. On the add-on's **Configuration** tab, set a `password`. Leave
   `session_secret` blank — it's generated and saved for you.
4. **Start** the add-on, then open its web UI (button on the add-on page,
   or `http://<your-home-assistant-ip>:8090`) on your phone and install
   it to your home screen.

Full details: [`recipe_box/DOCS.md`](recipe_box/DOCS.md).

## Option B: Plain Docker (Docker Compose)

```bash
git clone <this repo> recipe-box
cd recipe-box
cp .env.example .env
# edit .env: set RECIPE_APP_PASSWORD and generate a SESSION_SECRET
openssl rand -hex 32   # paste the output in as SESSION_SECRET

docker compose up -d --build
```

The app is now running at `http://<your-server-ip>:8090` (change the port
via `RECIPE_BOX_PORT` in `.env`). Open that URL on your phone, log in,
then use your browser's **"Add to Home Screen"** option.

### Plain `docker run`, if you'd rather not use Compose

```bash
docker build -t recipe-box -f recipe_box/Dockerfile.standalone recipe_box
docker run -d \
  --name recipe-box \
  --restart unless-stopped \
  -p 8090:3000 \
  -e RECIPE_APP_PASSWORD=changeme \
  -e SESSION_SECRET=$(openssl rand -hex 32) \
  -v recipe-data:/app/data \
  recipe-box
```

## Sharing a recipe from Claude

1. In the Claude app, open a conversation containing a recipe and select
   the message text (or use Claude's own share/copy action).
2. Tap **Share**, then choose **Recipe Box** from the share sheet
   (Recipe Box must be installed to your home screen first — plain
   browser tabs aren't offered as share targets on most phones).
3. Recipe Box opens straight to a pre-filled recipe draft. Check it over,
   fix anything the parser missed, and tap **Save**.

If your phone doesn't offer Recipe Box in the share sheet, or you're on a
browser without the Web Share Target API (e.g. desktop Safari), just copy
the text and use the **Import** screen's "paste text" box instead — same
parser, same result.

Both the share-in and share-out features require **HTTPS** (or
`localhost`) — see "Running behind a reverse proxy" below.

## Grocery store integration (Prisma / Citymarket)

Worth knowing exactly what this does and doesn't do:

- Prisma (S Group) and Citymarket (K Group/Kesko) are **different
  companies with separate online stores** (s-kaupat.fi vs. k-ruoka.fi).
  Neither publishes a public product API.
- The **search-link** pill next to every ingredient always works — it's
  just a normal search URL for that store, opened in your own logged-in
  browser session (so pricing/stock reflects your own selected store).
  The exact URL pattern (`recipe_box/server/stores/*.js`) is a
  best-guess default; if it 404s for you, override it with the
  `PRISMA_SEARCH_URL_TEMPLATE` / `CITYMARKET_SEARCH_URL_TEMPLATE`
  environment variables (`{query}` is replaced with the ingredient).
- The **live price badge** is currently only attempted for Prisma, via
  an old, unofficial S Group search endpoint — genuinely experimental,
  unverified against the current site, and silently falls back to the
  search link on any failure. Citymarket live pricing isn't implemented
  at all yet (see the comment at the top of
  `recipe_box/server/stores/citymarket.js` for exactly what's needed to
  add it — it boils down to "capture one real request from your
  browser's DevTools and send it over").
- Nothing here scrapes continuously or in the background — it only runs
  when you tap "Check store prices" on a recipe.

## Running behind a reverse proxy / exposing it outside your LAN

Recipe Box speaks plain HTTP on port 3000 internally — put Traefik,
Caddy, or nginx (or Home Assistant's own remote access) in front of it
for TLS if you want access away from home. A couple of things worth
knowing if you do:

- The Web Share Target API and Web Share API both **require HTTPS**
  (or `localhost`) to work at all — sharing in/out will silently fail
  over plain `http://`.
- Session cookies are `httpOnly` + `SameSite=Lax` but not marked
  `Secure`, so they still work over LAN HTTP. If you're exposing this to
  the internet, put it behind HTTPS.
- `SESSION_SECRET` must stay the same across restarts, or every logged-in
  device will be signed out each time. (The Home Assistant add-on handles
  this for you automatically.)

## Environment variables

| Variable                          | Required | Description                                                        |
|------------------------------------|:--------:|----------------------------------------------------------------------|
| `RECIPE_APP_PASSWORD`              | yes*     | Password for the login screen. Unset = app is **open**.             |
| `SESSION_SECRET`                   | yes*     | Random string used to sign session cookies.                          |
| `PORT`                             | no       | Port the server listens on inside the container (3000).             |
| `DATA_DIR`                         | no       | Where the SQLite DB and uploaded photos are stored.                 |
| `PRISMA_SEARCH_URL_TEMPLATE`       | no       | Override Prisma's search URL pattern (`{query}` placeholder).       |
| `CITYMARKET_SEARCH_URL_TEMPLATE`   | no       | Override Citymarket's search URL pattern (`{query}` placeholder).   |

\* Compose requires both `RECIPE_APP_PASSWORD` and `SESSION_SECRET` to be
set in `.env`. The Home Assistant add-on only asks for a password and
generates the session secret itself. Running `node server/index.js`
directly will still start without either, but logs a warning and leaves
the app unprotected — fine for local development, not for anything
reachable by anyone else.

## Data & backups

Everything (the SQLite database and any uploaded recipe photos) lives
under the app's `/app/data` (Docker) or `/data` (Home Assistant add-on)
volume. Home Assistant backs this up automatically as part of its normal
backup system. For a plain Docker deploy:

```bash
docker run --rm -v recipe-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/recipe-box-backup.tar.gz -C /data .
```

## Local development (without Docker)

```bash
cd recipe_box
npm install
RECIPE_APP_PASSWORD=devpass SESSION_SECRET=devsecret npm start
# open http://localhost:3000
```

Regenerate the app icons (PWA icons + the Home Assistant add-on's
icon.png/logo.png — only needed if you change the palette/glyph in
`recipe_box/tools/generate-icons.js`):

```bash
npm run icons
```

## Tech stack

Plain Node.js + Express + better-sqlite3 on the backend, no-build-step
vanilla JS/HTML/CSS on the frontend (a hash-routed single-page app), and
a service worker + web app manifest for the PWA/installable/share-target
behavior. No frontend framework, no bundler.
