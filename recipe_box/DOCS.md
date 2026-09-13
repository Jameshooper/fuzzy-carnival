# Recipe Box — documentation

A self-hosted, mobile-first recipe manager, running here as a Home
Assistant add-on (no manual Docker commands needed — the Supervisor
builds and runs it for you).

## Setup

1. Go to the **Configuration** tab of this add-on and set a `password`.
   Leave `session_secret` blank — it's generated and saved for you the
   first time the add-on starts.
2. Start the add-on.
3. Open the URL shown by the **Open Web UI** button (or
   `http://<your-home-assistant-ip>:8090`) on your phone's browser.
4. Log in, then use your phone browser's **"Add to Home Screen" /
   "Install app"** option so Recipe Box launches full-screen and shows up
   in your phone's share sheet.

The add-on's port (`8090` by default) can be changed on the **Network**
tab like any other add-on.

## Why isn't this using Ingress?

Home Assistant's Ingress feature (the thing that lets some add-ons show
up embedded in the HA sidebar without their own port) proxies the app
under a session-specific URL path rather than serving it at a stable
address. Recipe Box needs a stable, direct address to work as an
installable phone app and as an OS share target — under Ingress, the
"Add to Home Screen" install and the share-sheet registration would
break. So Recipe Box publishes its own port instead, same as it would
under plain Docker; you can still add it to your HA dashboard as a
**Webpage card** pointing at its direct URL if you want it visible
inside the HA UI too.

## Sharing recipes from Claude

Once installed to your phone's home screen:

1. Copy or share a recipe's text out of the Claude app (or any app).
2. Tap **Share → Recipe Box**.
3. Recipe Box opens with a pre-parsed draft — review and save.

No share sheet entry? Use the in-app **Import** screen's paste box
instead — same parser, same result. Both the Web Share Target API (for
receiving shares) and the Web Share API (for sending them) require
HTTPS, so if you're only using this over plain HTTP on your LAN these
two specific features won't be offered by your phone's browser; the rest
of the app is unaffected.

## Checking Prisma / Citymarket prices

Each recipe has a **🛒 Check store prices** button. Tapping it:

- Always shows a search-link pill per ingredient for both **Prisma**
  (S-kaupat) and **Citymarket** (K-Ruoka) — tap one to open that store's
  own search for the ingredient in your browser.
- For **Prisma**, also makes a best-effort attempt at a live price via an
  older, unofficial S Group search endpoint. This is genuinely
  experimental: it may return nothing, or stop working entirely if S
  Group changes their backend — when it fails, you silently just get the
  search-link pill instead.
- **Citymarket** live pricing isn't implemented yet — Citymarket (K
  Group/Kesko) is a completely separate company and platform from Prisma
  (S Group), with no public API either; wiring it up needs a real
  captured request from k-ruoka.fi (see `server/stores/citymarket.js` in
  the source for exactly what's needed).

Nothing here requires an account or login on either store's site — it's
just building a search URL, plus a best-effort read-only lookup.

## Backups

This add-on's data (the SQLite database and any uploaded recipe photos)
lives in its `/data` folder, which Home Assistant's own backup system
includes automatically in full/partial backups — no extra setup needed.

## Local development

The exact same app also runs as a plain Docker container (see the
repository root's `docker-compose.yml`) or directly with Node.js — see
the main project README for that path.
