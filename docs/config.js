// Where the API lives. On inmylikes.com and the workers.dev address the API is the same site;
// the GitHub Pages copy calls the worker directly.
window.WORKER_URL = location.hostname.endsWith("github.io")
  ? "https://it-was-in-my-likes-first.ashbo2mail.workers.dev"
  : /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? "" : location.origin;

// Spotify app Client ID (public, safe to commit). Leave empty to hide direct Spotify login.
window.SPOTIFY_CLIENT_ID = "";

// Google AdSense. Paste your publisher ID (ca-pub-…) and the ad unit's slot ID to turn the banner on.
// Ads only show on inmylikes.com (AdSense won't serve on the other addresses).
window.ADSENSE_CLIENT = "";
window.ADSENSE_SLOT = "";
