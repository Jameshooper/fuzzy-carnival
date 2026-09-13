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
way it does on Android. There are two good ways around it:

**Paste a link — the easiest path.** Recipe Box can fetch a recipe
webpage itself and read it automatically (see [Importing a recipe from a
link](#importing-a-recipe-from-a-link) below). If what you're sharing
has a URL — a recipe website, or a link Claude gave you — just copy the
link and paste it into Recipe Box's **Import** screen. No Shortcut setup
needed, works today, and doesn't depend on Apple ever fixing this.

**A Shortcut, for pasting raw text (e.g. Claude's own written-out
recipe, with no link).** This adds Recipe Box to your share sheet via
the Shortcuts app — a one-time, few-minutes setup:

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
