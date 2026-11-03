(function () {
  const $ = (id) => document.getElementById(id);
  const API = (window.WORKER_URL || "").replace(/\/$/, "");
  const DEMO = !API || new URLSearchParams(location.search).has("demo");
  const PAGE = 200; // rows rendered per "show more"
  const MAX_PAGES = 100; // 20k likes safety cap
  const DAY = 86400000;

  const state = { src: "sc", a: null, b: null, rows1: [], rows2: [], shown1: PAGE, shown2: PAGE, focus: null };

  // ---------- formatting ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const fmtLong = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const n = (x) => x.toLocaleString("en-US");

  function span(fromMs, toMs) {
    const a = new Date(Math.min(fromMs, toMs)), b = new Date(Math.max(fromMs, toMs));
    let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
    if (b.getDate() < a.getDate()) months--;
    // Calendar days in the viewer's time zone (yesterday 11pm → today 9am = 1 day).
    const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const days = Math.round((midnight(b) - midnight(a)) / DAY);
    return { y: Math.floor(months / 12), m: months % 12, days };
  }
  function short(s) {
    if (s.y) return `${s.y}y${s.m ? " " + s.m + "m" : ""}`;
    if (s.m) return `${s.m}mo`;
    return s.days === 0 ? "same day" : `${s.days}d`;
  }
  function long(s) {
    const parts = [];
    if (s.y) parts.push(`${s.y} year${s.y > 1 ? "s" : ""}`);
    if (s.m) parts.push(`${s.m} month${s.m > 1 ? "s" : ""}`);
    if (!parts.length) return s.days === 0 ? "the same day" : `${s.days} day${s.days > 1 ? "s" : ""}`;
    return parts.join(", ");
  }
  const ago = (iso) => span(Date.parse(iso), Date.now());
  // Head start between two people's like dates, in calendar terms
  const gapSpan = (x) => span(Date.parse(x.a_at), Date.parse(x.b_at));
  const gapText = (x) => { if (x.first === "tie") return "same time"; const s = gapSpan(x); return s.days === 0 ? "same day" : "by " + short(s); };
  // "ago" phrasing relative to today
  const agoShort = (iso) => { const s = ago(iso); return s.days === 0 ? ["today", ""] : s.days === 1 && !s.m && !s.y ? ["yesterday", ""] : [short(s), "ago"]; };
  const agoLong = (iso) => { const s = ago(iso); return s.days === 0 ? "today" : s.days === 1 && !s.m && !s.y ? "yesterday" : long(s) + " ago"; };

  // ---------- data ----------
  async function api(path) {
    const res = await fetch(API + path);
    let body = {};
    try { body = await res.json(); } catch {}
    if (!res.ok) throw new Error(body.error || `request failed (${res.status})`);
    return body;
  }

  function cacheGet(key) {
    try { const v = sessionStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
  }
  function cacheSet(key, v) {
    try { sessionStorage.setItem(key, JSON.stringify(v)); } catch {}
  }

  async function loadAccount(input, label) {
    if (DEMO) {
      await new Promise((r) => setTimeout(r, 250));
      return window.demoLikes(input.replace(/^https?:\/\/(www\.)?soundcloud\.com\//, "").split("/")[0] || input);
    }
    const key = "iwimlf:" + input.toLowerCase();
    const hit = cacheGet(key);
    if (hit) return hit;

    setStatus(`finding ${label}…`);
    const user = await api(`/user?u=${encodeURIComponent(input)}`);
    const items = [];
    let cursor = null;
    for (let i = 0; i < MAX_PAGES; i++) {
      const page = await api(`/likes?id=${user.id}${cursor ? "&cursor=" + encodeURIComponent(cursor) : ""}`);
      items.push(...page.items);
      const total = user.likes_count ? ` of ~${n(user.likes_count)}` : "";
      setStatus(`loading ${user.username}'s likes · ${n(items.length)}${total}`);
      if (!page.next) break;
      cursor = page.next;
    }
    const out = { user, items };
    cacheSet(key, out);
    return out;
  }

  // ---------- views ----------
  function setStatus(msg, err) {
    $("status").textContent = msg || "";
    $("status").classList.toggle("err", !!err);
  }

  function renderSingle() {
    const { user, items } = state.a;
    const q = $("q1").value.trim().toLowerCase();
    const sort = $("sort1").value;
    let rows = items.filter((x) => !q || (x.title + " " + x.artist + " " + x.uploader).toLowerCase().includes(q));
    rows.sort(
      sort === "new" ? (x, y) => y.liked_at.localeCompare(x.liked_at)
      : sort === "az" ? (x, y) => x.title.localeCompare(y.title)
      : (x, y) => x.liked_at.localeCompare(y.liked_at)
    );
    state.rows1 = rows;

    const oldest = items.reduce((m, x) => (!m || x.liked_at < m ? x.liked_at : m), null);
    $("single-summary").innerHTML = items.length
      ? `<b>${esc(user.username)}</b> · ${n(items.length)} ${state.src === "sp" ? "liked songs" : "public likes"} · liking since <span class="o">${oldest ? fmtDate(oldest) : "—"}</span>`
      : `<b>${esc(user.username)}</b> has no ${state.src === "sp" ? "liked songs" : "public likes"}.`;

    $("list1").innerHTML = rows.length
      ? rows.slice(0, state.shown1).map((x) => {
          const [main, sub] = agoShort(x.liked_at);
          return `<li class="row${state.focus === x.id ? " hl" : ""}" tabindex="0" data-id="${esc(x.id)}">
            <span class="date">${fmtDate(x.liked_at)}</span>
            <span class="t"><div class="title">${esc(x.title)}</div><div class="artist">${esc(x.artist)}</div></span>
            <span class="ago">${main}<small>${sub}</small></span></li>`;
        }).join("")
      : `<li class="empty">${q ? "nothing matches that." : "no likes to show."}</li>`;
    $("more1").hidden = rows.length <= state.shown1;
  }

  function buildShared() {
    const A = state.a, B = state.b;
    const bMap = new Map(B.items.map((x) => [x.id, x]));
    const shared = [];
    for (const x of A.items) {
      const y = bMap.get(x.id);
      if (!y) continue;
      const ta = Date.parse(x.liked_at), tb = Date.parse(y.liked_at);
      shared.push({ ...x, a_at: x.liked_at, b_at: y.liked_at, first: ta === tb ? "tie" : ta < tb ? "a" : "b", gap: Math.abs(ta - tb) });
    }
    return shared;
  }

  function renderCompare() {
    const A = state.a, B = state.b;
    const shared = state.shared;
    const aWins = shared.filter((x) => x.first === "a").length;
    const bWins = shared.filter((x) => x.first === "b").length;

    $("score").innerHTML = `
      <div class="side ${aWins > bWins ? "lead" : ""}"><div class="who">${esc(A.user.username)}</div><div class="n">${aWins}</div></div>
      <div class="mid"><b>${n(shared.length)}</b>shared likes<br>first to it</div>
      <div class="side ${bWins > aWins ? "lead" : ""}"><div class="who">${esc(B.user.username)}</div><div class="n">${bWins}</div></div>`;

    const q = $("q2").value.trim().toLowerCase();
    const sort = $("sort2").value;
    const firstAt = (x) => (x.a_at < x.b_at ? x.a_at : x.b_at);
    let rows = shared.filter((x) => !q || (x.title + " " + x.artist).toLowerCase().includes(q));
    rows.sort(
      sort === "old" ? (x, y) => firstAt(x).localeCompare(firstAt(y))
      : sort === "new" ? (x, y) => firstAt(y).localeCompare(firstAt(x))
      : (x, y) => y.gap - x.gap
    );
    state.rows2 = rows;

    const an = esc(A.user.username), bn = esc(B.user.username);
    const head = `<li class="cmp-head" aria-hidden="true"><span>song</span><span>${an}</span><span>${bn}</span><span>first</span></li>`;
    $("list2").innerHTML = rows.length
      ? head + rows.slice(0, state.shown2).map((x) => {
          const who = x.first === "tie" ? "tie" : x.first === "a" ? an : bn;
          return `<li class="row cmp${state.focus === x.id ? " hl" : ""}" tabindex="0" data-id="${esc(x.id)}">
            <span class="t"><div class="title">${esc(x.title)}</div><div class="artist">${esc(x.artist)}</div></span>
            <span class="d2${x.first === "a" ? " win" : ""}"><small class="lbl">${an}</small>${fmtDate(x.a_at)}</span>
            <span class="d2${x.first === "b" ? " win" : ""}"><small class="lbl">${bn}</small>${fmtDate(x.b_at)}</span>
            <span class="ago">${who}<small>${gapText(x)}</small></span></li>`;
        }).join("")
      : `<li class="empty">${q ? "nothing matches that." : "no songs in common. yet."}</li>`;
    $("more2").hidden = rows.length <= state.shown2;
  }

  // ---------- song card ----------
  function openCard(id) {
    const compare = !!state.b;
    const x = compare ? state.shared.find((r) => r.id === id) : state.a.items.find((r) => r.id === id);
    if (!x) return;
    const A = state.a.user, B = state.b && state.b.user;

    let html;
    if (compare) {
      const winner = x.first === "b" ? B : A;
      const loser = x.first === "b" ? A : B;
      const winAt = x.first === "b" ? x.b_at : x.a_at;
      const loseAt = x.first === "b" ? x.a_at : x.b_at;
      html = `<p class="k">it was in my likes first</p>
        <p class="song">${esc(x.title)}</p><p class="by">${esc(x.artist)}</p>
        ${x.first === "tie"
          ? `<p class="big">dead heat.</p><p class="when">both liked it on ${fmtLong(x.a_at)}</p>`
          : `<p class="big">${esc(winner.username)}</p>
             <p class="when">had it first, ${gapSpan(x).days === 0 ? "earlier the same day" : "by " + long(gapSpan(x))}</p>
             <p class="vs">${esc(winner.username)} · <b>${fmtLong(winAt)}</b><br>${esc(loser.username)} · ${fmtLong(loseAt)}</p>`}`;
    } else {
      html = `<p class="k">it was in my likes first</p>
        <p class="song">${esc(x.title)}</p><p class="by">${esc(x.artist)}</p>
        <p class="big">${agoLong(x.liked_at)}</p>
        <p class="when">${esc(A.username)} liked it on ${fmtLong(x.liked_at)}</p>`;
    }
    $("card-body").innerHTML = html;
    $("open").href = x.url || "#";
    $("open").hidden = !x.url;
    $("card").dataset.id = id;
    $("copy").textContent = state.src === "sp" ? "copy text" : "copy link";
    $("open").textContent = state.src === "sp" ? "open in spotify" : "open on soundcloud";
    if (!$("card").open) $("card").showModal();
  }

  function linkFor(id) {
    const p = new URLSearchParams();
    p.set("u", state.a.user.permalink);
    if (state.b) p.set("vs", state.b.user.permalink);
    if (id) p.set("t", id);
    if (DEMO && new URLSearchParams(location.search).has("demo")) p.set("demo", "");
    return `${location.origin}${location.pathname}?${p.toString().replace(/demo=(&|$)/, "demo$1")}`;
  }

  // ---------- flow ----------
  async function run(u, vs, focusId) {
    $("go").disabled = true;
    $("single").hidden = $("compare").hidden = true;
    setStatus("");
    state.focus = focusId || null;
    state.shown1 = state.shown2 = PAGE;
    try {
      state.a = await loadAccount(u, "you");
      state.b = vs ? await loadAccount(vs, "your friend") : null;
      setStatus("");
      history.replaceState(null, "", linkFor(null).replace(location.origin, ""));
      if (state.b) {
        state.shared = buildShared();
        $("compare").hidden = false;
        renderCompare();
      } else {
        $("single").hidden = false;
        renderSingle();
      }
      if (focusId) openCard(focusId);
    } catch (e) {
      setStatus(e.message || "something went wrong", true);
    } finally {
      $("go").disabled = false;
    }
  }

  // ---------- events ----------
  $("demo").hidden = !DEMO;
  $("form").addEventListener("submit", (e) => {
    e.preventDefault();
    const u = $("u").value.trim(), vs = $("vs").value.trim();
    if (u) run(u, vs);
  });
  $("q1").addEventListener("input", () => { state.shown1 = PAGE; renderSingle(); });
  $("sort1").addEventListener("change", () => { state.shown1 = PAGE; renderSingle(); });
  $("q2").addEventListener("input", () => { state.shown2 = PAGE; renderCompare(); });
  $("sort2").addEventListener("change", () => { state.shown2 = PAGE; renderCompare(); });
  $("more1").addEventListener("click", () => { state.shown1 += PAGE; renderSingle(); });
  $("more2").addEventListener("click", () => { state.shown2 += PAGE; renderCompare(); });
  for (const list of [$("list1"), $("list2")]) {
    list.addEventListener("click", (e) => { const r = e.target.closest(".row"); if (r) openCard(r.dataset.id); });
    list.addEventListener("keydown", (e) => { if (e.key === "Enter") { const r = e.target.closest(".row"); if (r) openCard(r.dataset.id); } });
  }
  $("close").addEventListener("click", () => $("card").close());
  $("card").addEventListener("click", (e) => { if (e.target === $("card")) $("card").close(); });
  $("copy").addEventListener("click", async () => {
    // Spotify likes are private, so a link can't show them to anyone else — copy a sentence instead.
    const id = $("card").dataset.id;
    let text = linkFor(id);
    if (state.src === "sp") {
      const x = state.a.items.find((r) => r.id === id);
      text = `I liked "${x.title}" by ${x.artist} on Spotify on ${fmtLong(x.liked_at)} (${agoLong(x.liked_at)}).${x.url ? " " + x.url : ""}`;
    }
    try { await navigator.clipboard.writeText(text); $("copy").textContent = "copied"; }
    catch { prompt("copy this", text); }
  });

  // ---------- pdf ----------
  for (const btn of document.querySelectorAll(".pdf")) {
    btn.addEventListener("click", async () => {
      const compare = btn.dataset.list === "2";
      const rows = compare ? state.rows2 : state.rows1;
      if (!rows.length) return;
      btn.disabled = true;
      const label = btn.textContent;
      btn.textContent = "building…";
      try {
        const q = $(compare ? "q2" : "q1").value.trim();
        const sortSel = $(compare ? "sort2" : "sort1");
        const A = state.a.user, B = state.b && state.b.user;
        await window.exportPdf({
          source: state.src === "sp" ? "Spotify" : "SoundCloud",
          accent: state.src === "sp" ? [30, 215, 96] : [255, 85, 0],
          title: compare ? `${A.username} vs ${B.username}` : A.username,
          subtitle: [
            compare ? `${n(rows.length)} shared likes` : `${n(rows.length)} ${state.src === "sp" ? "liked songs" : "likes"}`,
            q ? `filtered: "${q}"` : null,
            `sorted: ${sortSel.options[sortSel.selectedIndex].text}`,
          ].filter(Boolean).join(" · "),
          head: compare ? ["Song", "Artist", `${A.username} liked`, `${B.username} liked`, "First to it", "Head start"] : ["Liked on", "Song", "Artist", "When"],
          dateCols: compare ? [2, 3] : [0],
          body: rows.map((x) => compare
            ? [x.title, x.artist, fmtDate(x.a_at), fmtDate(x.b_at),
               x.first === "tie" ? "tie" : (x.first === "a" ? A : B).username,
               gapText(x).replace(/^by /, "")]
            : [fmtDate(x.liked_at), x.title, x.artist, agoShort(x.liked_at).join(" ").trim()]),
          filename: `likes-${state.src === "sp" ? "spotify" : "soundcloud"}-${(compare ? A.permalink + "-vs-" + B.permalink : A.permalink)}.pdf`,
        });
      } catch (e) {
        setStatus("couldn't build the pdf — " + (e.message || e), true);
      } finally {
        btn.disabled = false;
        btn.textContent = label;
      }
    });
  }

  // ---------- source switch (soundcloud / spotify) ----------
  function setSource(src, opts = {}) {
    state.src = src;
    document.body.classList.toggle("sp", src === "sp");
    $("src-sc").setAttribute("aria-selected", src === "sc");
    $("src-sp").setAttribute("aria-selected", src === "sp");
    $("tag").textContent = `receipts for your ${src === "sp" ? "spotify" : "soundcloud"} taste.`;
    document.querySelector('meta[name="theme-color"]').content = "#0a0a0a";
    $("form").hidden = src === "sp";
    $("sp-panel").hidden = src !== "sp";
    $("demo").hidden = !(DEMO && src === "sc");
    if (!opts.keep) {
      $("single").hidden = $("compare").hidden = true;
      state.a = state.b = null;
      setStatus("");
    }
    try { localStorage.setItem("iwimlf:src", src); } catch {}
    if (!opts.keep) history.replaceState(null, "", location.pathname + (src === "sp" ? "?src=spotify" : ""));
    if (src === "sp") spotifyUI();
  }

  function spotifyUI() {
    const loggedIn = !!Spotify.token();
    $("sp-login").hidden = loggedIn;
    $("sp-logout").hidden = !loggedIn;
    $("sp-who").hidden = !(loggedIn && state.a);
    if (loggedIn && state.a) $("sp-who").innerHTML = `logged in as <b>${esc(state.a.user.username)}</b>`;
    if (!Spotify.configured() && !DEMO) {
      $("sp-login").disabled = true;
      setStatus("spotify isn't set up on this site yet.");
    }
  }

  async function runSpotify() {
    $("sp-login").disabled = true;
    state.b = null;
    state.focus = null;
    state.shown1 = PAGE;
    try {
      const key = "iwimlf:sp:likes";
      state.a = cacheGet(key);
      if (DEMO && !Spotify.token()) {
        await new Promise((r) => setTimeout(r, 250));
        state.a = window.demoLikes("you");
        state.a.items.forEach((x) => (x.url = "https://open.spotify.com/"));
      }
      if (!state.a) {
        setStatus("loading your liked songs…");
        state.a = await Spotify.loadLikes((got, total) => setStatus(`loading your liked songs · ${n(got)}${total ? " of " + n(total) : ""}`));
        cacheSet(key, state.a);
      }
      setStatus("");
      $("single").hidden = false;
      renderSingle();
    } catch (e) {
      setStatus(e.message || "something went wrong", true);
    } finally {
      $("sp-login").disabled = false;
      spotifyUI();
    }
  }

  $("src-sc").addEventListener("click", () => state.src !== "sc" && setSource("sc"));
  $("src-sp").addEventListener("click", () => {
    if (state.src === "sp") return;
    setSource("sp");
    if (Spotify.token()) runSpotify();
  });
  $("sp-login").addEventListener("click", () => (DEMO && !Spotify.configured() ? runSpotify() : Spotify.login().catch((e) => setStatus(e.message, true))));
  $("sp-logout").addEventListener("click", () => {
    Spotify.logout();
    try { sessionStorage.removeItem("iwimlf:sp:likes"); } catch {}
    setSource("sp");
  });

  // ---------- startup ----------
  const p = new URLSearchParams(location.search);
  let saved = null;
  try { saved = localStorage.getItem("iwimlf:src"); } catch {}
  const startSp = p.get("src") === "spotify" || p.has("code") || p.has("error") || (!p.get("u") && saved === "sp");

  if (startSp) {
    setSource("sp", { keep: true });
    Spotify.handleCallback()
      .then(() => { if (Spotify.token()) runSpotify(); else spotifyUI(); })
      .catch((e) => { setStatus(e.message, true); spotifyUI(); });
  } else {
    setSource("sc", { keep: true });
    // Deep links: ?u=asher&vs=friend&t=t123
    if (p.get("u")) {
      $("u").value = p.get("u");
      $("vs").value = p.get("vs") || "";
      run(p.get("u"), p.get("vs") || "", p.get("t"));
    }
  }
})();
