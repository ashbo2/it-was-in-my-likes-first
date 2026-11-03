// it was in my likes first — Cloudflare Worker
// Thin proxy over SoundCloud's public web API (api-v2). Returns only the
// fields the site needs. One SoundCloud page per request keeps CPU time and
// subrequests well inside the Workers Free plan.
//
// Routes
//   GET /user?u=<username or profile URL>
//   GET /likes?id=<user id>&cursor=<opaque, optional>

const SC_API = "https://api-v2.soundcloud.com";
const SC_WEB = "https://soundcloud.com";
const PAGE_SIZE = 200;
const UA = "Mozilla/5.0 (compatible; it-was-in-my-likes-first/1.0)";

let cachedClientId = null; // survives between requests on a warm isolate

export default {
  async fetch(request, env, ctx) {
    const cors = corsHeaders(request, env);
    if (cors === null) return json({ error: "origin not allowed" }, 403, {});
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "GET") return json({ error: "method not allowed" }, 405, cors);

    const url = new URL(request.url);
    try {
      if (url.pathname === "/user") return await handleUser(url, cors, ctx);
      if (url.pathname === "/likes") return await handleLikes(url, cors, ctx);
      if (url.pathname === "/" || url.pathname === "/health") return json({ ok: true }, 200, cors);
      return json({ error: "not found" }, 404, cors);
    } catch (err) {
      const status = err.status || 502;
      return json({ error: err.message || "upstream error" }, status, cors);
    }
  },
};

// ---------- handlers ----------

async function handleUser(url, cors, ctx) {
  const permalink = normalizeUsername(url.searchParams.get("u"));
  if (!permalink) throw httpError(400, "enter a SoundCloud username or profile link");

  const notFound = httpError(404, `no SoundCloud user called "${permalink}"`);
  let data;
  try {
    data = await scGet(`/resolve?url=${encodeURIComponent(`${SC_WEB}/${permalink}`)}`, ctx);
  } catch (e) {
    throw e.status === 404 ? notFound : e;
  }
  if (!data || data.kind !== "user") throw notFound;

  return json(
    {
      id: data.id,
      username: data.username,
      permalink: data.permalink,
      url: data.permalink_url,
      avatar: data.avatar_url ? data.avatar_url.replace("-large.", "-t200x200.") : null,
      likes_count: data.likes_count ?? null,
    },
    200,
    { ...cors, "Cache-Control": "public, max-age=3600" }
  );
}

async function handleLikes(url, cors, ctx) {
  const id = url.searchParams.get("id");
  if (!/^\d+$/.test(id || "")) throw httpError(400, "bad user id");
  const cursor = url.searchParams.get("cursor");
  if (cursor && !/^[\w\-.,:%]+$/.test(cursor)) throw httpError(400, "bad cursor");

  let path = `/users/${id}/likes?limit=${PAGE_SIZE}&linked_partitioning=1`;
  if (cursor) path += `&offset=${encodeURIComponent(cursor)}`;

  const data = await scGet(path, ctx);
  const items = (data.collection || []).map(trimLike).filter(Boolean);

  let next = null;
  if (data.next_href && items.length) {
    next = new URL(data.next_href).searchParams.get("offset");
  }

  return json({ items, next }, 200, { ...cors, "Cache-Control": "public, max-age=600" });
}

// ---------- SoundCloud helpers ----------

function trimLike(like) {
  const t = like.track || like.playlist;
  if (!t || !like.created_at) return null;
  return {
    id: `${like.track ? "t" : "p"}${t.id}`,
    kind: like.track ? "track" : "playlist",
    liked_at: like.created_at,
    title: t.title || "(untitled)",
    artist: (t.publisher_metadata && t.publisher_metadata.artist) || (t.user && t.user.username) || "",
    uploader: t.user ? t.user.username : "",
    url: t.permalink_url || null,
    artwork: t.artwork_url || (t.user && t.user.avatar_url) || null,
    posted_at: t.created_at || null,
  };
}

async function scGet(path, ctx, retried = false) {
  const clientId = await getClientId(ctx, retried);
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${SC_API}${path}${sep}client_id=${clientId}`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });

  if ((res.status === 401 || res.status === 403) && !retried) {
    cachedClientId = null; // key rotated — scrape a fresh one and try once more
    return scGet(path, ctx, true);
  }
  if (res.status === 401 || res.status === 403) throw httpError(403, "this account's likes are private");
  if (res.status === 404) throw httpError(404, "not found on SoundCloud");
  if (res.status === 429) throw httpError(429, "SoundCloud is rate limiting — try again in a minute");
  if (!res.ok) throw httpError(502, `SoundCloud returned ${res.status}`);
  return res.json();
}

// SoundCloud's own web app embeds a public client_id in its JS bundles.
async function getClientId(ctx, forceRefresh) {
  if (cachedClientId && !forceRefresh) return cachedClientId;

  const cache = typeof caches !== "undefined" ? caches.default : null;
  const cacheKey = new Request("https://cache.internal/sc-client-id");
  if (cache && !forceRefresh) {
    const hit = await cache.match(cacheKey);
    if (hit) return (cachedClientId = await hit.text());
  }

  const home = await fetch(SC_WEB, { headers: { "User-Agent": UA } });
  if (!home.ok) throw httpError(502, "couldn't reach SoundCloud");
  const html = await home.text();
  const scripts = [...html.matchAll(/<script[^>]+src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g)]
    .map((m) => m[1])
    .reverse(); // the key usually lives in one of the last bundles

  for (const src of scripts.slice(0, 8)) {
    const js = await (await fetch(src, { headers: { "User-Agent": UA } })).text();
    const m = js.match(/client_id\s*[:=]\s*"([A-Za-z0-9]{20,40})"/);
    if (m) {
      cachedClientId = m[1];
      if (cache) {
        const put = cache.put(cacheKey, new Response(m[1], { headers: { "Cache-Control": "max-age=21600" } }));
        if (ctx && ctx.waitUntil) ctx.waitUntil(put);
      }
      return cachedClientId;
    }
  }
  throw httpError(502, "couldn't get a SoundCloud key — SoundCloud may have changed their site");
}

// ---------- utils ----------

export function normalizeUsername(input) {
  if (!input) return null;
  let s = input.trim();
  s = s.replace(/^https?:\/\/(www\.|m\.)?soundcloud\.com\//i, "");
  s = s.replace(/^@/, "").split(/[/?#]/)[0].toLowerCase();
  return /^[a-z0-9_-]{1,64}$/.test(s) ? s : null;
}

function corsHeaders(request, env) {
  const allowed = ((env && env.ALLOWED_ORIGINS) || "*").split(",").map((s) => s.trim());
  const origin = request.headers.get("Origin");
  let allow = "*";
  if (!allowed.includes("*")) {
    if (origin && !allowed.includes(origin)) return null;
    allow = origin || allowed[0];
  }
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}
