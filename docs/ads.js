// Ad placements — see ADS.md in the repo for the full plan.
//   rail   : 160×600, sticky in the right margin, wide desktop screens only
//   feed   : responsive, between result rows 20 and 21 (only when there are more than 20 rows)
//   bottom : responsive horizontal banner above the footer
// Ads run only on inmylikes.com once window.ADSENSE has a client ID and slot IDs.
// Add ?adpreview to any URL to see dashed placeholders where ads will go.
(function () {
  const cfg = window.ADSENSE || {};
  const slots = cfg.slots || {};
  const params = new URLSearchParams(location.search);
  const preview = params.has("adpreview");
  const live = !!cfg.client && /(^|\.)inmylikes\.com$/.test(location.hostname) && !params.has("demo");
  const SIZES = { rail: "160 × 600", feed: "responsive · in results", bottom: "responsive banner" };
  let scriptAdded = false;

  function loadScript() {
    if (scriptAdded) return;
    scriptAdded = true;
    const s = document.createElement("script");
    s.async = true;
    s.crossOrigin = "anonymous";
    s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(cfg.client);
    // Ad blocker or network error: remove every slot so no empty boxes are left behind
    s.onerror = () => document.querySelectorAll(".ad").forEach((el) => el.remove());
    document.head.appendChild(s);
  }

  // Fill a slot once. Requesting an ad only once per slot keeps it from reloading on search/sort.
  function fill(box) {
    if (!box || box.dataset.filled) return true;
    const name = box.dataset.ad;
    if (preview && !live) {
      box.classList.add("ad-preview");
      box.querySelector("ins").textContent = `${name} ad · ${SIZES[name]}`;
      box.dataset.filled = "1";
      return true;
    }
    if (!live || !slots[name]) return false;
    const ins = box.querySelector("ins");
    ins.setAttribute("data-ad-client", cfg.client);
    ins.setAttribute("data-ad-slot", slots[name]);
    loadScript();
    box.hidden = false; // must be visible before the request so AdSense can measure it
    (window.adsbygoogle = window.adsbygoogle || []).push({});
    box.dataset.filled = "1";
    return true;
  }

  function show(box) {
    box.hidden = false;
    if (!fill(box)) box.hidden = true;
  }

  // Bottom banner: always
  const bottom = document.getElementById("ad-bottom");
  if (bottom) show(bottom);

  // Side rail: only when the screen is wide enough to have an empty margin for it
  const rail = document.getElementById("ad-rail");
  if (rail && matchMedia("(min-width: 1280px) and (min-height: 740px)").matches) show(rail);

  window.Ads = {
    // Called by app.js after each render of a results list
    feed(box, enoughRows) {
      if (!box) return;
      if (!enoughRows) { box.hidden = true; return; }
      show(box);
    },
  };
})();
