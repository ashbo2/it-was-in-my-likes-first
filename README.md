# it was in my likes first

Receipts for your SoundCloud taste. Enter a username to see every public like with the date it was liked, or add a friend to see who had each shared song first.

- `docs/` — the static site (GitHub Pages serves this folder)
- `worker/` — Cloudflare Worker that fetches likes from SoundCloud (free plan)
- `docs/config.js` — API address; set it to `""` (or add `?demo` to any URL) for demo data

## Deploy

Live at:
- https://it-was-in-my-likes-first.ashbo2mail.workers.dev (site + API on Cloudflare)
- https://ashbo2.github.io/it-was-in-my-likes-first/ (site on GitHub Pages, calls the API above)

How it's wired:
1. Cloudflare Workers Builds is connected to this repo and redeploys on every push to `main` (root directory: repo root).
2. `wrangler.toml` serves `docs/` as static files and routes everything else (`/user`, `/likes`) to `worker/src/index.js`.
3. GitHub Pages serves `docs/` from `main`.
4. `ALLOWED_ORIGINS` in `wrangler.toml` limits which sites may call the API.

## Spotify mode
Spotify's API only allows 5 allowlisted users per hobby app, so the public path is a file import:
1. The user opens [Exportify](https://exportify.net), logs in with Spotify, and exports **Liked Songs** as a CSV.
2. They drop the CSV on the site. `docs/csvimport.js` parses it in the browser (nothing is uploaded) using the "Added At" column.

Optional: direct "log in with spotify" (`docs/spotify.js`) appears only if `SPOTIFY_CLIENT_ID` is set in `docs/config.js`. It works only for the up to 5 users added in that Spotify app's User Management.

## Share links
- `?u=asher`: one account's likes
- `?u=asher&vs=friend`: comparison view
- `&t=t123456`: opens that song's card directly (the "copy link" button builds these)

## Limits
- Public likes only.
- Built on SoundCloud's unofficial web API. If it breaks, the usual fix is in `getClientId()` in `worker/src/index.js`.
- Workers Free plan: 100,000 requests/day. Each lookup uses roughly 1 request per 200 likes, and over the cap Cloudflare returns errors instead of charging you.

## Develop
```sh
node --test worker/test/*.test.mjs   # worker tests (SoundCloud is mocked)
python3 -m http.server -d docs   # site at localhost:8000 (demo data)
```
