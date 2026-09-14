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

## Getting real HTTPS (removes the "Not Secure" warning, unlocks sharing on Android)

By default Recipe Box is plain `http://` on your LAN — your browser
will show it as "Not Secure," and two features silently stop working
without HTTPS: the Web Share Target API (Android's share-sheet
integration) and the Web Share API (the in-app Share button). Everything
else works fine over plain HTTP; this step is optional but worth doing.

If you already have the official **Tailscale** add-on (Settings →
Add-ons → Add-on Store → search "Tailscale") installed and connected to
your tailnet, this is the easiest path — a real, trusted certificate
with no manual cert management, and it stays private to your own
tailnet (no public internet exposure).

**Use classic Tailscale Serve, not the "Services" (`svc:`) feature.**
Tailscale's newer Services feature (a `services:` block in the add-on's
Configuration tab, giving Recipe Box its own name like
`recipebox.<tailnet>.ts.net`) looks like the natural fit, but as of this
writing it couples the client-facing and backend protocol together —
picking `https` requires Recipe Box's *backend* to also speak TLS
(which a plain Express app doesn't), while picking `http` gets a
working backend connection but no certificate for the browser at all.
Neither setting gets you a real end-to-end HTTPS connection. It also
requires tagging the device and adding an explicit ACL grant just to
let your own other devices reach it. Classic Serve has none of these
problems — it terminates real HTTPS for the browser using Tailscale's
automatic certificate, and proxies to Recipe Box over plain HTTP on the
backend, which is exactly what's needed:

1. Leave the Tailscale add-on's `services:` config empty (remove any
   `svc:recipebox` entry if you added one).
2. Get a shell inside the Tailscale add-on's own container — the
   **Terminal & SSH** add-on gives you the host's shell, not the
   Tailscale container's, so from there run `docker ps` to find its
   container name (something like `addon_..._tailscale`) and:
   ```
   docker exec -it <tailscale-container-name> sh
   ```
3. Inside that shell, point Serve at Recipe Box's published port
   (`8090` by default; the `tailscale` binary isn't on `PATH` in this
   container, hence the full path):
   ```
   /opt/tailscale serve --https=443 http://127.0.0.1:8090
   ```
4. Confirm it took effect:
   ```
   /opt/tailscale serve status
   ```
   which should show something like
   `https://<device-name>.<tailnet>.ts.net |-- / proxy http://127.0.0.1:8090`.
5. Recipe Box is now reachable at `https://<device-name>.<tailnet>.ts.net`
   — your Home Assistant device's own Tailscale name, not a custom
   `recipebox` name — from any device connected to your tailnet,
   including your phone if the Tailscale app is installed and connected
   there too. This setting is stored in Tailscale's own persistent
   state and survives an add-on restart.
6. Re-do **Add to Home Screen** using this new `https://` address
   (replacing the old `http://` one), and update the address in your
   [iOS Shortcut](#iphone--ipad) if you set one up.

No Tailscale? A reverse proxy in front of Recipe Box's port — Caddy is
the simplest (automatic HTTPS with almost no config) — works the same
way, provided you have a domain pointed at your home network. Either
way, Recipe Box itself needs no configuration change: it already
respects a reverse proxy's `X-Forwarded-Proto` header (marking its
session cookie `Secure` only when the connection is genuinely HTTPS) so
this works with no code changes on Recipe Box's side.

## Sharing recipes from Claude

### Android

Once installed to your phone's home screen:

1. Copy or share a recipe's text out of the Claude app (or any app).
2. Tap **Share → Recipe Box**.
3. Recipe Box opens with a pre-parsed draft — review and save.

The Web Share Target API (for receiving shares) and the Web Share API
(for sending them) both require HTTPS, so if you're only using this over
plain HTTP on your LAN these two specific features won't be offered by
your phone's browser; the rest of the app is unaffected.

### iPhone / iPad

**Safari/WebKit doesn't support the Web Share Target API at all** — this
isn't a bug or a missing setting, Apple has explicitly declined to
implement it ([WebKit bug
194593](https://bugs.webkit.org/show_bug.cgi?id=194593): "no intent to
commit"). So on iOS, Recipe Box can never appear in the share sheet the
way it does on Android. There are three good ways around it:

**Paste a link — the easiest path when there is one.** Recipe Box can
fetch a recipe webpage itself and read it automatically (see [Importing
a recipe from a link](#importing-a-recipe-from-a-link) below). If what
you're sharing has a URL — a recipe website, or a link Claude gave you —
just copy the link and paste it into Recipe Box's **Import** screen. No
setup needed, works today.

**Save/export as a PDF, then upload it — the easiest path for a
Claude-written recipe with no link.** In the Claude app, use its
share/export action to save the conversation as a PDF (or print-to-PDF
from Safari), then open Recipe Box's **Import** screen and use **Upload
a PDF** to pick that file. See [Importing a recipe from a
PDF](#importing-a-recipe-from-a-pdf) below. Also no setup needed — it's
just a normal, already-logged-in file upload.

**A Shortcut, for pasting raw text without saving a file first.** This
adds Recipe Box to your share sheet via the Shortcuts app — a one-time,
few-minutes setup:

1. Open **Shortcuts** → **+** to create a new shortcut.
2. Add action **URL Encode** (search for it; leave its input as the
   default "Shortcut Input").
3. Add action **Text**. Type `https://YOUR-RECIPE-BOX-ADDRESS/share-target?text=`,
   then tap right after `text=` and insert the **Encoded URL** variable
   from step 2 (tap the variable picker above the keyboard).
4. Add action **Open URLs**, with its input set to the Text from step 3.
5. Tap the shortcut's name at the top and rename it **Recipe Box**.
6. Tap the settings icon (ⓘ) → turn on **Show in Share Sheet** → under
   **Share Sheet Types**, enable **Text** (and **URLs**/**Safari web
   pages** too, if you want).

Replace `YOUR-RECIPE-BOX-ADDRESS` with wherever Recipe Box is actually
reachable from your phone (e.g. `192.168.1.50:8090`, or your HTTPS
address if you've put one in front of it). This step doesn't need HTTPS
— it's just opening a normal URL with the text attached, not using the
Web Share Target browser API at all, so it works fine over plain LAN
HTTP too. Now: select recipe text anywhere → **Share** → **Recipe Box**
(the first time, you may need to tap **More**/**Edit Actions** in the
share sheet to turn it on) → it opens Safari to a pre-parsed draft.

One limitation: very long shared text can hit the URL length limit and
get truncated. For long recipes, use the in-app **Import** screen's
paste box instead (no length limit) — or just copy the recipe's link and
use the link-import path above.

No share sheet entry, on either platform? Use the in-app **Import**
screen's paste box — same parser, same result.

## Importing a recipe from a PDF

The Import screen also takes a PDF file — useful if you've saved or
exported a Claude conversation as a PDF. Recipe Box extracts the PDF's
text and runs it through the same parser used for pasted text (a PDF
export has no structured recipe data to read the way a recipe webpage
does, so this is the best it can do automatically — review the result
before saving, same as any import). Scanned/image-only PDFs with no real
text layer aren't supported; you'll get a clear message if that happens.

## Importing a recipe from a link

The **Import** screen also takes a plain recipe URL. Paste it in and
Recipe Box fetches the page and reads its embedded recipe data (the same
`schema.org Recipe` markup that essentially every recipe site — food
blogs, AllRecipes, NYT Cooking, BBC Good Food, etc. — already publishes
for Google's own recipe search results), pulling out the title,
ingredients, instructions, servings, times, category tags, and photo
automatically. This is far more reliable than guessing from raw text,
since it's reading data the site deliberately made machine-readable.

If a page doesn't have that markup, you still get its title and
description as a starting point rather than an error — fill in the rest
by hand, or paste the page's visible ingredient/instruction text into
the text box instead.

## Backups

This add-on's data (the SQLite database and any uploaded recipe photos)
lives in its `/data` folder, which Home Assistant's own backup system
includes automatically in full/partial backups — no extra setup needed.

## Local development

The exact same app also runs as a plain Docker container (see the
repository root's `docker-compose.yml`) or directly with Node.js — see
the main project README for that path.
