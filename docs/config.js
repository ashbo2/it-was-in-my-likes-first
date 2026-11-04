// Where the API lives. On inmylikes.com and the workers.dev address the API is the same site;
// the GitHub Pages copy calls the worker directly.
window.WORKER_URL = location.hostname.endsWith("github.io")
  ? "https://it-was-in-my-likes-first.ashbo2mail.workers.dev"
  : /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? "" : location.origin;

// Spotify app Client ID (public, safe to commit). Leave empty to hide direct Spotify login.
window.SPOTIFY_CLIENT_ID = "";

// Google AdSense. Paste your publisher ID (ca-pub-…) and one ad-unit slot ID per placement.
// A placement with an empty slot ID simply doesn't show. Ads only run on inmylikes.com.
// Preview placements anywhere with ?adpreview. Details: ADS.md in the repo.
window.ADSENSE = {
  client: "",          // e.g. "ca-pub-1234567890123456"
  placeholders: true,  // show empty "ad space" boxes until ads are live; false hides them
  slots: {
    railLeft: "",      // desktop left side rail, 160×600 display unit
    rail: "",          // desktop right side rail, 160×600 display unit
    feed: "",          // in-results unit (responsive display, or an in-feed unit)
    bottom: "",        // bottom banner, responsive horizontal display unit
  },
};
