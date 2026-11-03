(function () {
  const $ = (id) => document.getElementById(id);
  const API = (window.WORKER_URL || "").replace(/\/$/, "");
  const DEMO = !API || new URLSearchParams(location.search).has("demo");
  const PAGE = 200; // rows rendered per "show more"
  const MAX_PAGES = 100; // 20k likes safety cap
  const DAY = 86400000;

  const state = { a: null, b: null, rows1: [], rows2: [], shown1: PAGE, shown2: PAGE, focus: null };

  // ---------- formatting ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const fmtLong = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const n = (x) => x.toLocaleString("en-US");

  function span(fromMs, toMs) {
    const a = new Date(Math.min(fromMs, toMs)), b = new Date(Math.max(fromMs, toMs));
    let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
    if (b.getDate() < a.getDate()) months--;
    const days = Math.floor((b - a) / DAY);
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
      ? `<b>${esc(user.username)}</b> · ${n(items.length)} public likes · liking since <span class="o">${oldest ? fmtDate(oldest) : "—"}</span>`
      : `<b>${esc(user.username)}</b> has no public likes.`;

    $("list1").innerHTML = rows.length
      ? rows.slice(0, state.shown1).map((x) => {
          const s = ago(x.liked_at);
          return `<li class="row${state.focus === x.id ? " hl" : ""}" tabindex="0" data-id="${esc(x.id)}">
            <span class="date">${fmtDate(x.liked_at)}</span>
            <span class="t"><div class="title">${esc(x.title)}</div><div class="artist">${esc(x.artist)}</div></span>
            <span class="ago">${short(s)}<small>ago</small></span></li>`;
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

    $("list2").innerHTML = rows.length
      ? rows.slice(0, state.shown2).map((x) => {
          const who = x.first === "tie" ? "tie" : esc((x.first === "a" ? A : B).user.username);
          const g = span(0, x.gap);
          return `<li class="row${state.focus === x.id ? " hl" : ""}" tabindex="0" data-id="${esc(x.id)}">
            <span class="date">${fmtDate(firstAt(x))}</span>
            <span class="t"><div class="title">${esc(x.title)}</div><div class="artist">${esc(x.artist)}</div></span>
            <span class="ago">${who}<small>${x.first === "tie" ? "same day" : "by " + short(g)}</small></span></li>`;
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
             <p class="when">had it first, by ${long(span(0, x.gap))}</p>
             <p class="vs">${esc(winner.username)} · <b>${fmtLong(winAt)}</b><br>${esc(loser.username)} · ${fmtLong(loseAt)}</p>`}`;
    } else {
      html = `<p class="k">it was in my likes first</p>
        <p class="song">${esc(x.title)}</p><p class="by">${esc(x.artist)}</p>
        <p class="big">${long(ago(x.liked_at))} ago</p>
        <p class="when">${esc(A.username)} liked it on ${fmtLong(x.liked_at)}</p>`;
    }
    $("card-body").innerHTML = html;
    $("open").href = x.url || "#";
    $("open").hidden = !x.url;
    $("card").dataset.id = id;
    $("copy").textContent = "copy link";
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
    const url = linkFor($("card").dataset.id);
    try { await navigator.clipboard.writeText(url); $("copy").textContent = "copied"; }
    catch { prompt("copy this link", url); }
  });

  // Deep links: ?u=asher&vs=friend&t=t123
  const p = new URLSearchParams(location.search);
  if (p.get("u")) {
    $("u").value = p.get("u");
    $("vs").value = p.get("vs") || "";
    run(p.get("u"), p.get("vs") || "", p.get("t"));
  }
})();
