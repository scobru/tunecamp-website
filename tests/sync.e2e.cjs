/**
 * Browser test for components/library-sync.js against the real Zen library.
 *
 * No relay is involved. Writes go through real Zen and land in its local store,
 * so the push path — encryption, signing, node shape — is genuinely exercised,
 * as is the relay's refusal of a write signed by the wrong key. Incoming nodes
 * are handed to sync.receive() directly, carrying real ciphertext: a graph
 * subscription only fires for what a peer pushes, and there is no peer here.
 * The wire hop itself is therefore the one thing this does not cover.
 *
 * Optional, like the other browser test:
 *
 *     npx http-server -p 8123 -s .
 *     node tests/sync.e2e.cjs
 *
 * PLAYWRIGHT_CHROMIUM overrides the browser binary, BASE_URL the server.
 */
const { chromium } = require('playwright');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8123';

let passed = 0;
function ok(cond, msg) { if (!cond) throw new Error('FAIL: ' + msg); passed++; console.log('  ok  ' + msg); }

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined,
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(`${BASE_URL}/tests/sync-fixture.html`);
  await page.waitForFunction(() => window.harnessReady === true, null, { timeout: 15000 });

  // --- identity ------------------------------------------------------------
  const identity = await page.evaluate(async () => {
    const pair = await window.harness.makePair('alice:hunter2');
    window.harness.pair = pair;
    localStorage.setItem('tunecamp_zen_user', JSON.stringify({ alias: 'alice', pair }));
    return { pub: pair.pub, read: window.harness.Sync.readIdentity() };
  });
  ok(identity.read && identity.read.alias === 'alice', 'identity read from the Profile page session');
  ok(identity.read.pair.pub === identity.pub, 'identity carries the keypair');

  ok(await page.evaluate(() => {
    localStorage.setItem('tunecamp_zen_user', JSON.stringify({ alias: 'bob' }));   // no pair
    const out = window.harness.Sync.readIdentity() === null;
    localStorage.setItem('tunecamp_zen_user', JSON.stringify({ alias: 'alice', pair: window.harness.pair }));
    return out;
  }), 'a session without a keypair is not an identity');

  // --- push: local favourite reaches the graph, encrypted ------------------
  const pushed = await page.evaluate(async () => {
    const { Library, Sync, Zen, wait, pair } = window.harness;
    Library.clearAll();
    const sync = Sync.createSync({ Zen, relay: null, identity: { pair, alias: 'alice' }, onStatus: (s) => { window.lastStatus = s; } });
    window.harness.sync = sync;
    sync.start();
    Library.toggleFavorite({ id: 7, title: 'Blue Room', artistName: 'Nina K', siteUrl: 'https://a.test', audioUrl: 'https://a.test/s.mp3' });
    await wait(900);
    await sync.flush();
    const key = Library.trackKey({ title: 'Blue Room', artistName: 'Nina K' });
    const node = await window.harness.raw(pair.pub, ['favorites', encodeURIComponent(key)]);
    const decrypted = node && node.d ? await Zen.decrypt(node.d, pair) : null;
    return {
      key,
      hasNode: !!node,
      ciphertextType: node && typeof node.d,
      leaksTitle: !!(node && String(node.d || '').includes('Blue Room')),
      decryptedTitle: decrypted && decrypted.title,
      stamp: node && node.at,
      status: sync.status()
    };
  });
  ok(pushed.hasNode, 'the favourite reached the graph');
  ok(pushed.ciphertextType === 'string' && !pushed.leaksTitle, 'payload is ciphertext, not readable');
  ok(pushed.decryptedTitle === 'Blue Room', 'the owner can decrypt it back');
  ok(pushed.stamp > 0, 'the timestamp stays in the clear for merging');
  ok(pushed.status.pushed >= 1, 'status counts the push');

  // --- pull: another device's write merges in ------------------------------
  const pulled = await page.evaluate(async () => {
    const { Library, Zen, wait, pair } = window.harness;
    const record = { key: 'fp:salt::ori vale', title: 'Salt', artistName: 'Ori Vale', audioUrl: 'https://b.test/s.mp3', addedAt: Date.now() };
    const cipher = await Zen.encrypt(record, pair);
    await window.harness.sync.receive('favorites', encodeURIComponent(record.key), { d: cipher, at: record.addedAt, del: 0 });
    await wait(300);
    return { titles: Library.listFavorites().map((f) => f.title).sort(), pulledCount: window.lastStatus && window.lastStatus.pulled };
  });
  ok(pulled.titles.join(',') === 'Blue Room,Salt', 'a remote favourite merged into the local library');
  ok(pulled.pulledCount >= 1, 'status counts the pull');

  // --- echo guard ----------------------------------------------------------
  const echo = await page.evaluate(async () => {
    const before = window.harness.sync.status().pushed;
    await window.harness.wait(900);
    await window.harness.sync.flush();
    return { before, after: window.harness.sync.status().pushed };
  });
  ok(echo.after === echo.before, 'a merged remote item is not pushed straight back');

  // --- remote tombstone ----------------------------------------------------
  const deleted = await page.evaluate(async () => {
    const { Library, wait, pair } = window.harness;
    await window.harness.sync.receive('favorites', encodeURIComponent('fp:salt::ori vale'), { d: null, at: Date.now(), del: 1 });
    await wait(300);
    return Library.listFavorites().map((f) => f.title);
  });
  ok(deleted.join(',') === 'Blue Room', 'a remote deletion removes the favourite locally');

  // --- public playlist -----------------------------------------------------
  const shared = await page.evaluate(async () => {
    const { Library, Sync, Zen, wait, pair, sync } = window.harness;
    const pl = Library.createPlaylist('Nightshift');
    Library.addToPlaylist(pl.id, { id: 1, title: 'Blue Room', artistName: 'Nina K', siteUrl: 'https://a.test', audioUrl: 'https://a.test/s.mp3' });
    Library.setPlaylistPublic(pl.id, true);
    await wait(900);
    await sync.flush();
    const node = await window.harness.raw(pair.pub, ['shared', pl.id]);
    const fetched = await Sync.fetchSharedPlaylist({ Zen, relay: null, pub: pair.pub, id: pl.id, timeout: 4000 });
    const token = sync.shareTokenFor(pl.id);
    return {
      id: pl.id,
      nodeName: node && node.name,
      itemsAreClear: !!(node && String(node.items || '').includes('Blue Room')),
      fetchedName: fetched && fetched.name,
      fetchedCount: fetched && fetched.items.length,
      fetchedOwner: fetched && fetched.owner,
      token,
      parsed: Sync.parseShareToken(token)
    };
  });
  ok(shared.nodeName === 'Nightshift', 'a public playlist is republished under shared/');
  ok(shared.itemsAreClear, 'its tracks are in the clear — that is what makes the link openable');
  ok(shared.fetchedName === 'Nightshift' && shared.fetchedCount === 1, 'fetchSharedPlaylist reads it back with no identity');
  ok(shared.fetchedOwner === 'alice', 'the owner alias travels with it');
  ok(shared.parsed.pub === identity.pub && shared.parsed.id === shared.id, 'the share token round-trips');

  const unshared = await page.evaluate(async (id) => {
    const { Library, Sync, Zen, wait, sync, pair } = window.harness;
    Library.setPlaylistPublic(id, false);
    await wait(900);
    await sync.flush();
    return await Sync.fetchSharedPlaylist({ Zen, relay: null, pub: pair.pub, id, timeout: 2500 });
  }, shared.id);
  ok(unshared === null, 'unpublishing tombstones the shared copy, so the link stops resolving');

  ok(await page.evaluate(() => {
    const p = window.harness.Sync;
    return p.parseShareToken('') === null && p.parseShareToken('nodot') === null && p.parseShareToken('pub.') === null;
  }), 'malformed share tokens are rejected');

  // --- forgery -------------------------------------------------------------
  const forged = await page.evaluate(async () => {
    const { Zen, pair } = window.harness;
    const mallory = await window.harness.makePair('mallory:x');
    return new Promise((res) => {
      const zen = new Zen({ peers: [] });
      zen.get('~' + pair.pub).get('tc-library-v1').get('favorites').get('evil')
        .put({ d: 'x', at: Date.now(), del: 0 }, (ack) => res(ack && ack.err ? 'rejected' : 'ACCEPTED'), { authenticator: mallory });
      setTimeout(() => res('no-ack'), 4000);
    });
  });
  ok(forged === 'rejected', 'another key cannot write into this identity\'s subtree');

  // --- stopping ------------------------------------------------------------
  const stopped = await page.evaluate(async () => {
    const { Library, sync, wait, pair } = window.harness;
    sync.stop();
    const before = sync.status().pushed;
    Library.toggleFavorite({ id: 9, title: 'After Stop', artistName: 'Nobody', siteUrl: 'https://a.test', audioUrl: 'https://a.test/x.mp3' });
    await wait(900);
    const node = await window.harness.raw(pair.pub, ['favorites', encodeURIComponent('fp:after stop::nobody')], 2000);
    return { enabled: sync.status().enabled, pushedDelta: sync.status().pushed - before, node };
  });
  ok(stopped.enabled === false && stopped.pushedDelta === 0 && !stopped.node, 'stop() detaches: later edits stay local');

  ok(errors.length === 0, 'no page errors: ' + JSON.stringify(errors.slice(0, 3)));
  console.log(`\nok — ${passed} checks passed`);
  await browser.close();
})().catch(async (e) => { console.error(e.message); process.exit(1); });
