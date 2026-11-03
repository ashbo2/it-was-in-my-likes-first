# it was in my likes first

Receipts for your SoundCloud taste. Enter a username to see every public like with the date it was liked, or add a friend to see who had each shared song first.

- `docs/` — the static site (GitHub Pages serves this folder)
- `worker/` — Cloudflare Worker that fetches likes from SoundCloud (free plan)

The site runs on demo data until `docs/config.js` points at your worker.

## Deploy

### 1. Cloudflare Worker
1. Create a free account at [dash.cloudflare.com](https://dash.cloudflare.com/sign-up).
2. Install Node.js 18+ and run:
   ```sh
   cd worker
   npx wrangler login
   npx wrangler deploy
   ```
3. Copy the URL it prints (`https://it-was-in-my-likes-first.<you>.workers.dev`).
4. Check it: open `<worker URL>/user?u=<your soundcloud username>`. You should see your user info as JSON.

### 2. GitHub Pages
1. Paste the worker URL into `docs/config.js`.
2. Create a public repo named `it-was-in-my-likes-first` and push this folder.
3. In the repo: **Settings → Pages → Deploy from a branch → `main` / `/docs`**.
4. The site goes live at `https://<github-username>.github.io/it-was-in-my-likes-first/`.

### 3. Lock the worker to your site (recommended)
1. In `worker/wrangler.toml`, set `ALLOWED_ORIGINS = "https://<github-username>.github.io"`.
2. Run `npx wrangler deploy` again.

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
