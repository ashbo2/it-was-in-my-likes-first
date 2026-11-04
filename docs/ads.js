// Loads one Google AdSense banner at the bottom of the page — only on inmylikes.com,
// only once a publisher ID and slot are set in config.js.
(function () {
  const client = window.ADSENSE_CLIENT, slot = window.ADSENSE_SLOT;
  const onDomain = /(^|\.)inmylikes\.com$/.test(location.hostname);
  if (!client || !slot || !onDomain || new URLSearchParams(location.search).has("demo")) return;

  const box = document.getElementById("ad");
  const ins = box.querySelector("ins");
  ins.setAttribute("data-ad-client", client);
  ins.setAttribute("data-ad-slot", slot);
  box.hidden = false;

  const s = document.createElement("script");
  s.async = true;
  s.crossOrigin = "anonymous";
  s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(client);
  s.onerror = () => { box.hidden = true; }; // ad blocker: just hide the slot
  document.head.appendChild(s);
  (window.adsbygoogle = window.adsbygoogle || []).push({});
})();
