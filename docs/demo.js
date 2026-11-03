// Fake likes for demo mode. Any username works; the same name always gets the same history.
(function () {
  const SONGS = [
    ["Midnight Corridor", "Nova Lane"], ["Glass Teeth", "Ivo"], ["Palm Static", "Sundae Club"],
    ["Low Orbit (VIP)", "Kessler"], ["Overthinker", "Mara Vey"], ["Concrete Bloom", "Hollow Sun"],
    ["ID - unreleased", "Kessler"], ["Saltwater Radio", "The Dunes"], ["Signal Fire", "Oro"],
    ["Velvet Lag", "Juno Park"], ["Heatwave Tape", "Sundae Club"], ["No Service", "Ivo"],
    ["Amber Alarm", "Lila Ford"], ["Cold Brew Edit", "Desk Plant"], ["Paper Moons", "Mara Vey"],
    ["Westside Ghost", "Nova Lane"], ["Feral", "Hollow Sun"], ["Tidepool", "Oro"],
    ["Backseat Weather", "Juno Park"], ["Under the 10", "Desk Plant"], ["Night Bus Home", "The Dunes"],
    ["Pink Noise", "Lila Ford"], ["Arcade Sleep", "Kessler"], ["Little Earthquakes (flip)", "Ivo"],
    ["Ocean Ave", "Sundae Club"], ["Glow Up Slow", "Mara Vey"], ["Hum", "Oro"], ["Satellites", "Nova Lane"],
    ["Dry Heat", "Hollow Sun"], ["Laundromat", "Desk Plant"], ["Moth", "Juno Park"], ["Overpass", "The Dunes"],
    ["Copper Sky", "Lila Ford"], ["Echo Park 4AM", "Kessler"], ["Bad Reception", "Ivo"], ["Slow Fade", "Oro"],
  ];
  function rng(seed) {
    let h = 2166136261;
    for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
  }
  window.demoLikes = function (username) {
    const r = rng(username.toLowerCase());
    const now = Date.now();
    const span = 1000 * 60 * 60 * 24 * 365 * (3 + r() * 6);
    const items = SONGS.filter(() => r() < 0.7).map(([title, artist], i) => {
      const posted = now - r() * span;
      return {
        id: "t" + (1000 + SONGS.findIndex((s) => s[0] === title)),
        kind: "track",
        liked_at: new Date(posted + r() * (now - posted) * 0.6).toISOString(),
        title, artist, uploader: artist.toLowerCase().replace(/\s/g, ""),
        url: "https://soundcloud.com/",
        artwork: null,
        posted_at: new Date(posted).toISOString(),
      };
    });
    return {
      user: { id: 0, username, permalink: username, url: "https://soundcloud.com/" + username, avatar: null, likes_count: items.length },
      items,
    };
  };
})();
