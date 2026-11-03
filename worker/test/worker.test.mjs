// Run: node --test worker/test
// Mocks SoundCloud so the worker logic can be checked without network access.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

let calls = [];
let staleServesLeft = 0;

globalThis.fetch = async (input) => {
  const url = typeof input === "string" ? input : input.url;
  calls.push(url);
  if (url === "https://soundcloud.com") {
    return new Response('<script crossorigin src="https://a-v2.sndcdn.com/assets/0-aaa.js"></script><script crossorigin src="https://a-v2.sndcdn.com/assets/49-bbb.js"></script>');
  }
  if (url.endsWith("49-bbb.js")) {
    return new Response(`x={client_id:"${staleServesLeft-- > 0 ? "OLDKEYOLDKEYOLDKEYOLDKEY12" : "NEWKEYNEWKEYNEWKEYNEWKEY34"}",y:1}`);
  }
  if (url.endsWith("0-aaa.js")) return new Response("nothing here");
  if (url.startsWith("https://api-v2.soundcloud.com/")) {
    if (url.includes("client_id=OLDKEY")) return new Response("", { status: 401 });
    if (url.includes("/resolve")) {
      if (url.includes("nobody")) return new Response("", { status: 404 });
      return Response.json({ kind: "user", id: 42, username: "Asher", permalink: "asher", permalink_url: "https://soundcloud.com/asher", avatar_url: "https://i1.sndcdn.com/avatars-x-large.jpg", likes_count: 3 });
    }
    if (url.includes("/users/42/likes")) {
      const page2 = url.includes("offset=CUR2");
      return Response.json({
        collection: page2
          ? [{ created_at: "2019-01-02T00:00:00Z", playlist: { id: 9, title: "Mix", user: { username: "dj" }, permalink_url: "https://soundcloud.com/dj/sets/mix" } }]
          : [
              { created_at: "2021-05-01T10:00:00Z", track: { id: 1, title: "Song A", user: { username: "uploader1" }, publisher_metadata: { artist: "Real Artist" }, permalink_url: "https://soundcloud.com/u/a", created_at: "2021-04-01T00:00:00Z" } },
              { created_at: "2020-03-01T10:00:00Z", track: { id: 2, title: "Song B", user: { username: "uploader2", avatar_url: "av.jpg" }, permalink_url: "https://soundcloud.com/u/b" } },
              { created_at: "2020-01-01T00:00:00Z", track: null },
            ],
        next_href: page2 ? null : "https://api-v2.soundcloud.com/users/42/likes?offset=CUR2&limit=200",
      });
    }
  }
  return new Response("unexpected " + url, { status: 500 });
};

const { default: worker, normalizeUsername } = await import("../src/index.js");
const call = (path, origin) =>
  worker.fetch(new Request("https://w.example" + path, { headers: origin ? { Origin: origin } : {} }), {}, { waitUntil() {} });

beforeEach(() => { calls = []; });

test("normalizes usernames and profile links", () => {
  assert.equal(normalizeUsername("Asher"), "asher");
  assert.equal(normalizeUsername("https://soundcloud.com/asher/likes"), "asher");
  assert.equal(normalizeUsername("m.soundcloud.com/asher".replace(/^/, "https://")), "asher");
  assert.equal(normalizeUsername("@dj-name_1"), "dj-name_1");
  assert.equal(normalizeUsername("bad name!"), null);
  assert.equal(normalizeUsername(""), null);
});

test("resolves a user", async () => {
  const r = await call("/user?u=https://soundcloud.com/Asher");
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.id, 42);
  assert.equal(j.avatar, "https://i1.sndcdn.com/avatars-x-t200x200.jpg");
  assert.equal(r.headers.get("Access-Control-Allow-Origin"), "*");
});

test("unknown user is a 404 with a readable message", async () => {
  const r = await call("/user?u=nobody");
  assert.equal(r.status, 404);
  assert.match((await r.json()).error, /nobody/);
});

test("likes: trims fields, drops deleted tracks, returns cursor", async () => {
  const j = await (await call("/likes?id=42")).json();
  assert.equal(j.items.length, 2);
  assert.deepEqual(j.items[0], { id: "t1", kind: "track", liked_at: "2021-05-01T10:00:00Z", title: "Song A", artist: "Real Artist", uploader: "uploader1", url: "https://soundcloud.com/u/a", artwork: null, posted_at: "2021-04-01T00:00:00Z" });
  assert.equal(j.items[1].artwork, "av.jpg");
  assert.equal(j.next, "CUR2");
  const j2 = await (await call("/likes?id=42&cursor=CUR2")).json();
  assert.equal(j2.items[0].id, "p9");
  assert.equal(j2.next, null);
});

test("rejects bad input", async () => {
  assert.equal((await call("/likes?id=abc")).status, 400);
  assert.equal((await call("/likes?id=42&cursor=<x>")).status, 400);
  assert.equal((await call("/user?u=")).status, 400);
});

test("re-scrapes the key once when SoundCloud rotates it", async () => {
  // Fresh module state: force the cached key to be the stale one.
  staleServesLeft = 1; // first scrape returns a dead key, the retry gets a live one
  const { default: w2 } = await import("../src/index.js?fresh=" + Date.now());
  const r = await w2.fetch(new Request("https://w.example/user?u=asher"), {}, {});
  assert.equal(r.status, 200);
  assert.ok(calls.some((u) => u.includes("client_id=OLDKEY")));
  assert.ok(calls.some((u) => u.includes("client_id=NEWKEY")));
});

test("origin lock", async () => {
  const env = { ALLOWED_ORIGINS: "https://asher.github.io" };
  const ok = await worker.fetch(new Request("https://w.example/health", { headers: { Origin: "https://asher.github.io" } }), env, {});
  assert.equal(ok.headers.get("Access-Control-Allow-Origin"), "https://asher.github.io");
  const bad = await worker.fetch(new Request("https://w.example/health", { headers: { Origin: "https://evil.example" } }), env, {});
  assert.equal(bad.status, 403);
  const pre = await worker.fetch(new Request("https://w.example/likes", { method: "OPTIONS", headers: { Origin: "https://evil.example" } }), env, {});
  assert.equal(pre.status, 403);
});
