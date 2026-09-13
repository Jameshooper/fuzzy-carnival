# Recipe Box 🍽️

A self-hosted, mobile-first recipe manager. Add it to your phone's home
screen like an app, save recipes shared from Claude (or any app) via your
phone's share sheet, and share recipes back out to social/messaging apps.
Deploys as a single Docker container to your home server.

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
- Search, tag filters, favorites, photos, and a clean ingredient
  checklist / numbered steps view for cooking.
- Single-password protected (no accounts to manage) — good enough for
  sharing with family on your home network, and safe enough to expose
  through a reverse proxy if you want access away from home.
- SQLite storage in a single Docker volume — no external database needed.

## Quick start (Docker Compose)

```bash
git clone <this repo> recipe-box
cd recipe-box
cp .env.example .env
# edit .env: set RECIPE_APP_PASSWORD and generate a SESSION_SECRET
openssl rand -hex 32   # paste the output in as SESSION_SECRET

docker compose up -d --build
```

The app is now running at `http://<your-server-ip>:8090` (change the port
via `RECIPE_BOX_PORT` in `.env`).

Open that URL on your phone, log in with your password, then use your
browser's **"Add to Home Screen" / "Install app"** option so it launches
like a native app and shows up as a share target.

### Plain `docker run`, if you'd rather not use Compose

```bash
docker build -t recipe-box .
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

## Running behind a reverse proxy / exposing it outside your LAN

Recipe Box speaks plain HTTP on port 3000 inside the container — put
Traefik, Caddy, or nginx in front of it for TLS. A couple of things worth
knowing if you do:

- The Web Share Target API and Web Share API both **require HTTPS**
  (or `localhost`) to work at all — sharing in/out will silently fail
  over plain `http://`.
- Session cookies are `httpOnly` + `SameSite=Lax` but not marked
  `Secure`, so they still work over LAN HTTP. If you're exposing this to
  the internet, put it behind HTTPS.
- `SESSION_SECRET` must stay the same across restarts, or every logged-in
  device will be signed out each time the container restarts.

## Environment variables

| Variable               | Required | Description                                              |
|-------------------------|:--------:|-----------------------------------------------------------|
| `RECIPE_APP_PASSWORD`   | yes*     | Password for the login screen. Unset = app is **open**.  |
| `SESSION_SECRET`        | yes*     | Random string used to sign session cookies.               |
| `PORT`                  | no       | Port the server listens on inside the container (3000).  |
| `DATA_DIR`              | no       | Where the SQLite DB and uploaded photos are stored.       |

\* Compose requires both `RECIPE_APP_PASSWORD` and `SESSION_SECRET` to be
set in `.env`. Running `node server/index.js` directly will still start
without them, but logs a warning and leaves the app unprotected — fine
for local development, not for anything reachable by anyone else.

## Data & backups

Everything (the SQLite database and any uploaded recipe photos) lives
under the `/app/data` volume (`recipe-data` in the Compose file). Back up
that volume and you have your whole recipe box:

```bash
docker run --rm -v recipe-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/recipe-box-backup.tar.gz -C /data .
```

## Local development (without Docker)

```bash
npm install
RECIPE_APP_PASSWORD=devpass SESSION_SECRET=devsecret npm start
# open http://localhost:3000
```

Regenerate the app icons (only needed if you change the palette/glyph in
`tools/generate-icons.js`):

```bash
npm run icons
```

## Tech stack

Plain Node.js + Express + better-sqlite3 on the backend, no-build-step
vanilla JS/HTML/CSS on the frontend (a hash-routed single-page app), and
a service worker + web app manifest for the PWA/installable/share-target
behavior. No frontend framework, no bundler — the whole app is one small
Docker image.
