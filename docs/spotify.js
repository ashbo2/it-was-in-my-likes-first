// Spotify login (Authorization Code + PKCE — runs entirely in the browser, no secret needed)
// and loading the signed-in user's Liked Songs with the date each was liked.
(function () {
  const AUTH = "https://accounts.spotify.com/authorize";
  const TOKEN = "https://accounts.spotify.com/api/token";
  const API = "https://api.spotify.com/v1";
  const SCOPE = "user-library-read";
  const K = { verifier: "iwimlf:sp:verifier", state: "iwimlf:sp:state", token: "iwimlf:sp:token" };

  const store = {
    get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch {} },
    del(k) { try { sessionStorage.removeItem(k); } catch {} },
  };
  const clientId = () => window.SPOTIFY_CLIENT_ID || "";
  const redirectUri = () => location.origin + location.pathname.replace(/index\.html$/, "");

  function rand(n) {
    const a = new Uint8Array(n);
    crypto.getRandomValues(a);
    return Array.from(a, (b) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"[b % 66]).join("");
  }
  async function challenge(verifier) {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    return btoa(String.fromCharCode(...new Uint8Array(hash))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  async function login() {
    const verifier = rand(64), state = rand(16);
    store.set(K.verifier, verifier);
    store.set(K.state, state);
    const p = new URLSearchParams({
      response_type: "code",
      client_id: clientId(),
      scope: SCOPE,
      redirect_uri: redirectUri(),
      code_challenge_method: "S256",
      code_challenge: await challenge(verifier),
      state,
    });
    location.assign(`${AUTH}?${p}`);
  }

  // Call on page load. Returns true if we just came back from Spotify with a token.
  async function handleCallback() {
    const q = new URLSearchParams(location.search);
    if (!q.has("code") && !q.has("error")) return false;
    const clean = () => history.replaceState(null, "", location.pathname + "?src=spotify");
    if (q.get("error")) { clean(); throw new Error(q.get("error") === "access_denied" ? "spotify login was cancelled" : "spotify login failed"); }
    if (q.get("state") !== store.get(K.state)) { clean(); throw new Error("spotify login expired — try again"); }

    const res = await fetch(TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: q.get("code"),
        redirect_uri: redirectUri(),
        client_id: clientId(),
        code_verifier: store.get(K.verifier) || "",
      }),
    });
    clean();
    store.del(K.verifier);
    store.del(K.state);
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.access_token) throw new Error("spotify login failed — " + (body.error_description || res.status));
    store.set(K.token, JSON.stringify({ t: body.access_token, exp: Date.now() + (body.expires_in - 60) * 1000 }));
    return true;
  }

  function token() {
    try {
      const v = JSON.parse(store.get(K.token));
      return v && v.exp > Date.now() ? v.t : null;
    } catch { return null; }
  }

  async function get(url) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(url.startsWith("http") ? url : API + url, { headers: { Authorization: "Bearer " + token() } });
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, (Number(res.headers.get("Retry-After")) || 2) * 1000));
        continue;
      }
      if (res.status === 401) { logout(); throw new Error("spotify session expired — log in again"); }
      if (res.status === 403) throw new Error("this site is in spotify's limited mode — the site owner has to add your spotify email before you can log in");
      if (!res.ok) throw new Error(`spotify returned ${res.status}`);
      return res.json();
    }
    throw new Error("spotify is rate limiting — try again in a minute");
  }

  async function loadLikes(onProgress) {
    const me = await get("/me");
    const items = [];
    let next = "/me/tracks?limit=50";
    let total = null;
    while (next) {
      const page = await get(next);
      total = page.total;
      for (const it of page.items || []) {
        const t = it.track;
        if (!t || !it.added_at) continue;
        items.push({
          id: "s" + (t.id || t.uri),
          kind: "track",
          liked_at: it.added_at,
          title: t.name || "(untitled)",
          artist: (t.artists || []).map((a) => a.name).join(", "),
          uploader: t.album ? t.album.name : "",
          url: t.external_urls && t.external_urls.spotify,
          artwork: t.album && t.album.images && t.album.images.length ? t.album.images[t.album.images.length - 1].url : null,
          posted_at: t.album ? t.album.release_date : null,
        });
      }
      onProgress && onProgress(items.length, total);
      next = page.next;
    }
    return {
      user: { id: me.id, username: me.display_name || me.id, permalink: me.id, url: me.external_urls && me.external_urls.spotify, avatar: null, likes_count: total },
      items,
    };
  }

  function logout() { store.del(K.token); }

  window.Spotify = { configured: () => !!clientId(), login, handleCallback, token, loadLikes, logout };
})();
