// Reads an Exportify CSV (Spotify Liked Songs export) into the same shape as the SoundCloud likes.
(function () {
  // RFC 4180 parser: quoted fields, "" escapes, commas/newlines inside quotes.
  function parseCsv(text) {
    const rows = [];
    let row = [], field = "", i = 0, q = false;
    text = text.replace(/^﻿/, "");
    while (i < text.length) {
      const c = text[i];
      if (q) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          q = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"') { q = true; i++; continue; }
      if (c === ",") { row.push(field); field = ""; i++; continue; }
      if (c === "\r") { i++; continue; }
      if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
      field += c; i++;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((v) => v.trim() !== ""));
  }

  const norm = (h) => h.toLowerCase().replace(/[^a-z]/g, "");
  function col(header, ...names) {
    const n = header.map(norm);
    for (const name of names) {
      const i = n.indexOf(norm(name));
      if (i !== -1) return i;
    }
    return -1;
  }

  window.parseExportify = function (text) {
    const rows = parseCsv(text);
    if (rows.length < 2) throw new Error("that file is empty — export Liked Songs again");
    const h = rows[0];
    const iAdded = col(h, "Added At", "Date Added", "added_at");
    const iName = col(h, "Track Name", "Name", "Song");
    const iArtist = col(h, "Artist Name(s)", "Artist Names", "Artists", "Artist");
    const iAlbum = col(h, "Album Name", "Album");
    const iUri = col(h, "Track URI", "Spotify ID", "URI", "Track ID");
    const iRelease = col(h, "Release Date", "Album Release Date");
    if (iName === -1 || iAdded === -1) {
      throw new Error("that doesn't look like an Exportify file — it needs \"Track Name\" and \"Added At\" columns");
    }

    const items = [];
    let skipped = 0;
    rows.slice(1).forEach((r, n) => {
      const added = (r[iAdded] || "").trim();
      const t = Date.parse(added);
      // Spotify reports 1970 for songs with no real add date.
      if (!added || isNaN(t) || new Date(t).getUTCFullYear() < 2000) { skipped++; return; }
      const uri = iUri !== -1 ? (r[iUri] || "").trim() : "";
      const id = uri.split(":").pop() || "row" + n;
      items.push({
        id: "s" + id + "-" + n,
        kind: "track",
        liked_at: new Date(t).toISOString(),
        title: (r[iName] || "").trim() || "(untitled)",
        artist: iArtist !== -1 ? (r[iArtist] || "").trim().replace(/\s*;\s*/g, ", ") : "",
        uploader: iAlbum !== -1 ? (r[iAlbum] || "").trim() : "",
        url: /^[A-Za-z0-9]{22}$/.test(id) ? "https://open.spotify.com/track/" + id : null,
        artwork: null,
        posted_at: iRelease !== -1 ? r[iRelease] : null,
      });
    });
    if (!items.length) throw new Error("no songs with dates in that file — make sure you exported Liked Songs");
    return { items, skipped };
  };

  window._parseCsv = parseCsv; // exposed for tests
})();
