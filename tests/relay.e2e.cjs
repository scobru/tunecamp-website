/**
 * The one test that proves the sync actually syncs: two independent browsers,
 * one identity, a real relay in between.
 *
 * The relay is a dumb websocket broadcast — which is all a Zen relay has to be,
 * since every write is signed and the clients do their own de-duplication — so
 * the test needs no live infrastructure and never touches the public relay.
 *
 * Optional; needs Playwright and `ws`:
 *
 *     npx http-server -p 8123 -s .
 *     npm install ws && node tests/relay.e2e.cjs
 *
 * PLAYWRIGHT_CHROMIUM overrides the browser binary, BASE_URL the server,
 * RELAY_PORT the port the throwaway relay listens on.
 */
const { WebSocketServer } = require('ws');
const { chromium } = require('playwright');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8123';
const PORT = Number(process.env.RELAY_PORT || 8199);
const RELAY = `ws://127.0.0.1:${PORT}/zen`;
const SEED = 'alice:hunter2';

let passed = 0;
function ok(cond, msg) { if (!cond) throw new Error('FAIL: ' + msg); passed++; console.log('  ok  ' + msg); }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Waits for a value the other device is expected to produce, or gives up. */
async function until(page, fn, arg, timeout = 12000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await page.evaluate(fn, arg);
    if (value) return value;
    await wait(400);
  }
  return null;
}

(async () => {
  const wss = new WebSocketServer({ port: PORT });
  let forwarded = 0;
  wss.on('connection', (sock) => {
    sock.on('message', (data) => {
      forwarded++;
      for (const client of wss.clients) if (client !== sock && client.readyState === 1) client.send(data.toString());
    });
  });

  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined,
    args: ['--no-sandbox']
  });

  // Separate contexts: separate localStorage, so each page has its own library.
  const deviceA = await (await browser.newContext()).newPage();
  const deviceB = await (await browser.newContext()).newPage();
  const errors = [];
  for (const p of [deviceA, deviceB]) {
    p.on('pageerror', (e) => errors.push(String(e)));
    await p.goto(`${BASE_URL}/tests/sync-fixture.html`);
    await p.waitForFunction(() => window.harnessReady === true, null, { timeout: 15000 });
  }

  const attach = async (page) => page.evaluate(async ({ relay, seed }) => {
    const { Zen, Library, Sync } = window.harness;
    const pair = await window.harness.makePair(seed);
    window.harness.pair = pair;
    Library.clearAll();
    const sync = Sync.createSync({ Zen, relay, identity: { pair, alias: 'alice' }, onStatus: (s) => { window.lastStatus = s; } });
    window.harness.sync = sync;
    sync.start();
    return pair.pub;
  }, { relay: RELAY, seed: SEED });

  const pubA = await attach(deviceA);
  const pubB = await attach(deviceB);
  ok(pubA === pubB, 'both devices derive the same identity from the same passphrase');

  const connected = await until(deviceA, () => window.harness.sync.status().connected || null);
  ok(connected === true, 'the sync reports a live relay connection');

  // --- a favourite made on A appears on B ---------------------------------
  await deviceA.evaluate(async () => {
    window.harness.Library.toggleFavorite({
      id: 7, title: 'Blue Room', artistName: 'Nina K',
      siteUrl: 'https://a.test', audioUrl: 'https://a.test/s.mp3', coverUrl: ''
    });
    await window.harness.wait(600);
    await window.harness.sync.flush();
  });

  const onB = await until(deviceB, () => {
    const favs = window.harness.Library.listFavorites();
    return favs.length ? favs[0].title : null;
  });
  ok(onB === 'Blue Room', 'the favourite crossed the relay to the second device');

  const decrypted = await deviceB.evaluate(() => {
    const f = window.harness.Library.listFavorites()[0];
    return { audioUrl: f.audioUrl, artist: f.artistName };
  });
  ok(decrypted.audioUrl === 'https://a.test/s.mp3' && decrypted.artist === 'Nina K',
     'the whole snapshot survived the round trip, decrypted');

  // --- a deletion on B removes it on A ------------------------------------
  await deviceB.evaluate(async () => {
    const f = window.harness.Library.listFavorites()[0];
    window.harness.Library.toggleFavorite(f);
    await window.harness.wait(600);
    await window.harness.sync.flush();
  });
  const goneOnA = await until(deviceA, () => window.harness.Library.countFavorites() === 0 ? 'gone' : null);
  ok(goneOnA === 'gone', 'the deletion propagated back — the tombstone, not a resurrection');

  // --- concurrent edits on different items both survive -------------------
  await deviceA.evaluate(async () => {
    window.harness.Library.toggleFavorite({ id: 1, title: 'Salt', artistName: 'Ori Vale', siteUrl: 'https://a.test', audioUrl: 'https://a.test/1.mp3' });
    await window.harness.sync.flush();
  });
  await deviceB.evaluate(async () => {
    window.harness.Library.toggleFavorite({ id: 2, title: 'Halo', artistName: 'Mesa Rey', siteUrl: 'https://b.test', audioUrl: 'https://b.test/2.mp3' });
    await window.harness.sync.flush();
  });
  const bothOnA = await until(deviceA, () => {
    const titles = window.harness.Library.listFavorites().map((f) => f.title).sort().join(',');
    return titles === 'Halo,Salt' ? titles : null;
  });
  ok(bothOnA === 'Halo,Salt', 'two devices editing different items keep both');

  // --- a returning device: nothing to transfer, but everything is mirrored -
  const returning = await deviceA.evaluate(async ({ relay, seed }) => {
    const { Zen, Library, Sync, wait } = window.harness;
    const pair = await window.harness.makePair(seed);
    // a fresh sync handle, as a page reload would create
    const sync = Sync.createSync({ Zen, relay, identity: { pair, alias: 'alice' }, onStatus: () => {} });
    sync.start();
    await wait(3000);
    const status = sync.status();
    sync.stop();
    return { pushed: status.pushed, pulled: status.pulled, pending: status.pending, mirrored: status.mirrored, favorites: Library.countFavorites() };
  }, { relay: RELAY, seed: SEED });
  ok(returning.favorites === 2 && returning.mirrored >= 2,
     'a returning device reports what is mirrored, not an empty transfer count');
  ok(returning.pushed === 0 && returning.pending === 0,
     'and pushes nothing, because it is already up to date');

  // --- a public playlist opens for someone with no identity at all --------
  const playlistId = await deviceA.evaluate(async () => {
    const { Library, sync } = window.harness;
    const pl = Library.createPlaylist('Nightshift');
    Library.addToPlaylist(pl.id, { id: 3, title: 'Long Way Down', artistName: 'Ori Vale', siteUrl: 'https://a.test', audioUrl: 'https://a.test/3.mp3' });
    Library.setPlaylistPublic(pl.id, true);
    await window.harness.wait(600);
    await sync.flush();
    return pl.id;
  });

  const visitor = await (await browser.newContext()).newPage();
  visitor.on('pageerror', (e) => errors.push(String(e)));
  await visitor.goto(`${BASE_URL}/tests/sync-fixture.html`);
  await visitor.waitForFunction(() => window.harnessReady === true, null, { timeout: 15000 });
  const fetched = await visitor.evaluate(async ({ relay, pub, id }) => {
    const { Zen, Sync } = window.harness;
    const pl = await Sync.fetchSharedPlaylist({ Zen, relay, pub, id, timeout: 12000 });
    return pl && { name: pl.name, owner: pl.owner, count: pl.items.length, first: pl.items[0] && pl.items[0].title };
  }, { relay: RELAY, pub: pubA, id: playlistId });
  ok(fetched && fetched.name === 'Nightshift', 'a stranger can open the shared playlist over the relay');
  ok(fetched.owner === 'alice' && fetched.count === 1 && fetched.first === 'Long Way Down', 'with its tracks and its author');

  const privateLeak = await visitor.evaluate(async ({ relay, pub }) => {
    const { Zen } = window.harness;
    return new Promise((res) => {
      const zen = new Zen({ peers: [relay] });
      let found = null;
      zen.get('~' + pub).get('tc-library-v1').get('favorites').map().on((node) => {
        if (node && node.d && !found) found = String(node.d);
      });
      setTimeout(() => res(found), 6000);
    });
  }, { relay: RELAY, pub: pubA });
  ok(privateLeak && !/Salt|Halo|Ori Vale|Mesa Rey/.test(privateLeak),
     'a stranger reading the private buckets sees ciphertext only');

  ok(forwarded > 0, `the relay really carried the traffic (${forwarded} messages)`);
  ok(errors.length === 0, 'no page errors: ' + JSON.stringify(errors.slice(0, 3)));

  console.log(`\nok — ${passed} checks passed`);
  await browser.close();
  wss.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
