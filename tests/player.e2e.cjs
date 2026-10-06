/**
 * Browser smoke test for the community player: favourites, playlists, followed
 * artists, recents, the play queue's independence from the visible list, and
 * persistence across a reload — all against a stubbed federation, so it never
 * touches a real instance.
 *
 * Optional (it needs Playwright and a local server, neither of which the site
 * itself depends on):
 *
 *     npx http-server -p 8123 -s .
 *     node tests/player.e2e.cjs
 *
 * PLAYWRIGHT_CHROMIUM overrides the browser binary, BASE_URL the server.
 */
const { chromium } = require('playwright');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8123';

// 1 second of silence, 8kHz mono WAV — enough for real play/pause events.
function silentWav() {
  const dataLen = 8000;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + dataLen, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(8000, 24); buf.writeUInt32LE(8000, 28);
  buf.writeUInt16LE(1, 32); buf.writeUInt16LE(8, 34);
  buf.write('data', 36); buf.writeUInt32LE(dataLen, 40);
  buf.fill(128, 44);
  return buf;
}

const SITE = 'https://alpha.test';
const CATALOG = {
  releases: [{
    title: 'First Light', slug: 'first-light', artistName: 'Nina K', created_at: 3,
    tracks: [
      { id: 1, title: 'Blue Room', duration: 200 },
      { id: 2, title: 'Green Door', duration: 180 }
    ]
  }, {
    title: 'Dust', slug: 'dust', artistName: 'Ori Vale', created_at: 2,
    tracks: [{ id: 3, title: 'Long Way', duration: 240 }]
  }]
};

let passed = 0;
function ok(cond, msg) { if (!cond) throw new Error('FAIL: ' + msg); passed++; console.log('  ok  ' + msg); }

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined,
    args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox']
  });
  const page = await browser.newPage();
  // The sync tests below talk to a stubbed instance, and one run points at an
  // instance that refuses the connection: that failed request is expected.
  // Everything else must stay silent.
  const EXPECTED = [/\/api\/auth\/zen\/library\//, /ERR_CONNECTION_REFUSED/, /Failed to load resource/];
  const expected = (text, url) => EXPECTED.some((re) => re.test(url || '') || re.test(text || ''));
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const url = (m.location() && m.location().url) || '';
    if (!expected(m.text(), url)) errors.push('console: ' + m.text() + ' @ ' + url);
  });

  await page.route('**/config.js', (r) =>
    r.fulfill({ contentType: 'application/javascript', body:
      `window.TUNECAMP_DIRECTORY = ["${SITE}"];` }));
  await page.route('**/api/community/sites', (r) =>
    r.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{ url: SITE, name: 'Alpha' }]) }));
  await page.route('**/api/catalog/full', (r) =>
    r.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(CATALOG) }));
  await page.route('**/api/tracks/*/stream', (r) =>
    r.fulfill({ contentType: 'audio/wav', headers: { 'Access-Control-Allow-Origin': '*' }, body: silentWav() }));
  // A 1x1 PNG for every cover: a 404 here would log a console error and drown
  // out the real ones this test is watching for.
  const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.route('**/api/albums/**', (r) =>
    r.fulfill({ contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: PIXEL }));

  await page.goto(`${BASE_URL}/player.html`);
  await page.waitForFunction(() => document.querySelectorAll('#tracksContainer .track-row[data-idx]').length === 3, null, { timeout: 10000 });
  ok(true, 'network catalog renders 3 tracks');
  ok(await page.textContent('#trackCount') === '3', 'track count in header');

  // --- favourites ---------------------------------------------------------
  await page.click('#tracksContainer .track-row[data-idx="0"] [data-act="fav"]');
  ok(await page.textContent('#countFavorites') === '1', 'favourite counted in the tab');
  ok(await page.getAttribute('#tracksContainer .track-row[data-idx="0"] [data-act="fav"]', 'aria-pressed') === 'true', 'heart is pressed');
  ok(await page.isVisible('#toast'), 'toast shown');

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('tc_library_v1')));
  const favKey = Object.keys(stored.favorites)[0];
  ok(favKey.startsWith('fp:'), 'stored under a fingerprint key: ' + favKey);
  ok(!!stored.favorites[favKey].audioUrl, 'snapshot keeps a playable url');

  await page.click('[data-view="favorites"]');
  await page.waitForSelector('#tracksContainer .track-row[data-idx="0"]');
  ok(await page.$$eval('#tracksContainer .track-row[data-idx]', (r) => r.length) === 1, 'favourites view lists it');

  // --- playback + queue context ------------------------------------------
  await page.click('#tracksContainer .track-row[data-idx="0"]');
  await page.waitForFunction(() => document.getElementById('playIcon').className.includes('fa-pause'), null, { timeout: 5000 });
  ok(true, 'clicking a favourite starts playback');
  ok((await page.textContent('#queueSource')).includes('Favorites'), 'queue reports its context: ' + await page.textContent('#queueSource'));
  ok(await page.textContent('#playerTitle') === 'Blue Room', 'now playing title');

  // switching tabs and searching must not change what is playing
  await page.click('[data-view="network"]');
  await page.fill('#searchInput', 'long');
  await page.waitForFunction(() => document.querySelectorAll('#tracksContainer .track-row[data-idx]').length === 1);
  ok(await page.textContent('#playerTitle') === 'Blue Room', 'browsing does not hijack the queue');
  ok((await page.textContent('#queueSource')).includes('Favorites'), 'queue context survives browsing');
  await page.fill('#searchInput', '');
  await page.waitForFunction(() => document.querySelectorAll('#tracksContainer .track-row[data-idx]').length === 3);

  // --- playlists ----------------------------------------------------------
  await page.click('#tracksContainer .track-row[data-idx="2"] [data-act="add"]');
  await page.waitForSelector('#playlistPicker:not(.hidden)');
  ok((await page.textContent('#pickerTrack')).includes('Long Way'), 'picker names the track');
  await page.fill('#pickerNewName', 'Nightshift');
  await page.click('#pickerNewForm button[type="submit"]');
  await page.waitForSelector('#pickerList [data-plid]');
  ok(await page.getAttribute('#pickerList [data-plid]', 'aria-pressed') === 'true', 'track added to the new playlist');
  await page.click('#pickerClose');

  await page.click('[data-view="playlists"]');
  await page.waitForSelector('[data-pl]');
  ok(await page.textContent('#countPlaylists') === '1', 'playlist counted');
  await page.click('#tracksContainer [data-pl]');
  await page.waitForSelector('#viewHeader:not(.hidden)');
  ok((await page.textContent('#viewHeader')).includes('Nightshift'), 'playlist detail header');
  ok(await page.evaluate(() => getComputedStyle(document.getElementById('viewHeader')).display) === 'flex',
     'the header lays its controls out in a row');
  ok(await page.$$eval('#tracksContainer .track-row[data-idx]', (r) => r.length) === 1, 'playlist shows its track');

  await page.click('#viewHeader [data-act="playall"]');
  await page.waitForFunction(() => document.getElementById('playerTitle').textContent === 'Long Way', null, { timeout: 5000 });
  ok((await page.textContent('#queueSource')).includes('Nightshift'), 'playing from the playlist');

  await page.click('#tracksContainer .track-row[data-idx="0"] [data-act="remove"]');
  await page.waitForFunction(() => document.querySelectorAll('#tracksContainer .track-row[data-idx]').length === 0);
  ok(true, 'track removed from the playlist');
  await page.click('#viewHeader [data-act="back"]');
  ok(await page.isVisible('[data-view="playlists"].tab-active'), 'back returns to the playlist list');

  // --- follow artist ------------------------------------------------------
  await page.click('#npFollow');
  ok(await page.textContent('#countArtists') === '1', 'artist followed from the player');
  await page.click('[data-view="artists"]');
  await page.waitForSelector('[data-artist]');
  ok((await page.textContent('#tracksContainer')).includes('Ori Vale'), 'followed artist listed');
  await page.click('#tracksContainer [data-artist]');
  await page.waitForSelector('#viewHeader:not(.hidden)');
  ok(await page.$$eval('#tracksContainer .track-row[data-idx]', (r) => r.length) === 1, 'artist drill-in filters the catalog');

  // --- recents ------------------------------------------------------------
  await page.click('[data-view="recents"]');
  await page.waitForSelector('#tracksContainer .track-row[data-idx]');
  ok(await page.$$eval('#tracksContainer .track-row[data-idx]', (r) => r.length) === 2, 'recents holds both played tracks');

  // --- persistence across a reload ---------------------------------------
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('#tracksContainer .track-row[data-idx]').length === 3, null, { timeout: 10000 });
  ok(await page.textContent('#countFavorites') === '1', 'favourites survive a reload');
  ok(await page.textContent('#playerTitle') === 'Long Way', 'last track restored into the player');
  ok(await page.getAttribute('#npFollow', 'aria-pressed') === 'true', 'follow state restored');
  ok(await page.textContent('#playIcon') !== null && !(await page.getAttribute('#playIcon', 'class')).includes('fa-pause'), 'restored session is paused');

  // --- export -------------------------------------------------------------
  const json = await page.evaluate(async () => {
    const mod = await import('./components/library.js');
    return mod.exportJson();
  });
  const parsed = JSON.parse(json);
  ok(parsed.app === 'tunecamp-community-player' && Object.keys(parsed.library.favorites).length === 1, 'export contains the library');

  // --- sync status, sharing, and opening a shared link ---------------------
  await page.click('#libraryMenuBtn');
  ok((await page.textContent('#syncStatus')).includes('Sign in to sync your library'),
     'with no identity the menu says the library is browser-only');
  await page.click('#libraryMenuBtn');

  // unlock an identity the way profile.html would, then reload into it
  // and an instance for it to sync with — one that is down for now
  const LIBRARY_API = '**/sudorecords.test/api/auth/zen/library/**';
  await page.route(LIBRARY_API, (r) => r.abort('connectionrefused'));
  const alias = await page.evaluate(async () => {
    const { deriveMasterPair } = await import('./vendor/identity.js');
    const pair = await deriveMasterPair('alice', 'correct horse battery staple');
    localStorage.setItem('tunecamp_zen_user', JSON.stringify({ alias: 'alice', pair }));
    localStorage.setItem('tunecamp_linked_instances', JSON.stringify([{ instanceDomain: 'sudorecords.test', localUsername: 'alice' }]));
    return 'alice';
  });
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('#tracksContainer .track-row[data-idx]').length === 3, null, { timeout: 10000 });
  await page.waitForFunction((a) => {
    const box = document.getElementById('syncStatus');
    return box && box.textContent.includes('@' + a);
  }, alias, { timeout: 15000 });
  // The instance is down, so the status must say so rather than claiming the
  // library is reaching it.
  const syncText = (await page.textContent('#syncStatus')).replace(/\s+/g, ' ');
  ok(syncText.includes('Sync pending') && syncText.includes('unreachable'),
     'an unreachable instance is reported honestly: ' + syncText.trim().slice(0, 90));
  ok(syncText.includes('saved here'), 'and the listener is told their changes are kept locally');

  // --- importing the stars the listener made on their own instances --------
  await page.route('**/api/auth/zen/user/*/public', (r) =>
    r.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({
      success: true,
      publicProfile: { username: 'alice', artistName: 'Alice' },
      publicLikes: [
        { type: 'track', id: 77, track_title: 'Starred Elsewhere', track_artist: 'Remote Band', album_cover: '/api/albums/4/cover' },
        { type: 'track', id: 78, track_title: 'Blue Room', track_artist: 'Nina K' },
        { type: 'album', id: 9, album_title: 'An album' }
      ],
      publicPlaylists: [{ id: 3, name: 'Their playlist' }]
    }) }));
  await page.route('**/api/playlists/*/public', (r) =>
    r.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({
      id: 3, name: 'Their playlist', username: 'alice', isPublic: true, trackCount: 1,
      tracks: [{ id: 90, title: 'From Their Playlist', artistName: 'Ori Vale', duration: 133, streamUrl: '/api/tracks/90/stream', coverUrl: null }]
    }) }));

  const beforeImport = Number(await page.textContent('#countFavorites'));
  await page.evaluate(() => localStorage.setItem('tunecamp_linked_instances', JSON.stringify([
    { instanceDomain: 'sudorecords.test', localUsername: 'alice' }
  ])));
  await page.click('#libraryMenuBtn');
  await page.waitForFunction(() => document.getElementById('importInstancesBtn').textContent.includes('(1)'));
  ok(true, 'the menu counts the linked instance');
  await page.click('#importInstancesBtn');
  await page.waitForFunction((n) => Number(document.getElementById('countFavorites').textContent) > n, beforeImport, { timeout: 15000 });

  const afterImport = await page.evaluate(async () => {
    const Library = await import('./components/library.js');
    return Library.listFavorites().map((f) => ({ title: f.title, audioUrl: f.audioUrl }));
  });
  ok(afterImport.some((f) => f.title === 'Starred Elsewhere'), 'a star from the instance became a favourite');
  ok(afterImport.find((f) => f.title === 'Starred Elsewhere').audioUrl === 'https://sudorecords.test/api/tracks/77/stream',
     'it carries a playable stream url from that instance');
  const fromNetwork = afterImport.find((f) => f.title === 'Blue Room');
  ok(fromNetwork && fromNetwork.audioUrl.includes('alpha.test'),
     'one already on the network is saved as the reachable network copy, not the instance one');
  ok((await page.textContent('#toast')).includes('album like'), 'the album star is reported as skipped: ' + await page.textContent('#toast'));
  ok(await page.evaluate(() => document.querySelector('[data-view="favorites"]').classList.contains('tab-active')),
     'the player switches to Favorites so the import is visible');

  const importedPlaylist = await page.evaluate(async () => {
    const Library = await import('./components/library.js');
    const pl = Library.listPlaylists().find((p) => p.importedFrom);
    return pl && { name: pl.name, from: pl.importedFrom, first: pl.items[0] && pl.items[0].title, audio: pl.items[0] && pl.items[0].audioUrl };
  });
  ok(importedPlaylist && importedPlaylist.name === 'Their playlist', 'the public playlist came across too');
  ok(importedPlaylist.from === 'sudorecords.test/3', 'stamped with its origin');
  ok(importedPlaylist.first === 'From Their Playlist' && importedPlaylist.audio === 'https://sudorecords.test/api/tracks/90/stream',
     'with playable tracks');

  const repeat = await page.evaluate(async () => {
    const Import = await import('./components/instance-import.js');
    const Library = await import('./components/library.js');
    const before = { favorites: Library.countFavorites(), playlists: Library.listPlaylists().length };
    const summary = await Import.importFrom(Import.readLinkedInstances(), { liveIndex: null });
    return { before, favorites: Library.countFavorites(), playlists: Library.listPlaylists().length, added: summary.added, already: summary.alreadyThere };
  });
  ok(repeat.favorites === repeat.before.favorites && repeat.added === 0 && repeat.already === 2,
     'importing again adds no favourites');
  ok(repeat.playlists === repeat.before.playlists, 'and does not duplicate the imported playlist');

  page.on('dialog', (d) => d.accept());

  // the instance comes back: a stand-in that stores records and serves shared playlists
  await page.unroute(LIBRARY_API);
  const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'X-Fid-Auth, Content-Type', 'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS' };
  const rows = new Map();
  await page.route(LIBRARY_API, (r) => {
    const req = r.request();
    const json = (status, body) => r.fulfill({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) });
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
    const u = new URL(req.url());
    const shared = u.pathname.match(/\/library\/([^/]+)\/shared\/(.+)$/);
    if (shared) {
      const row = rows.get(`shared/${decodeURIComponent(shared[2])}`);
      return row && !row.del ? json(200, { ...JSON.parse(row.d), at: row.at }) : json(404, {});
    }
    if (req.method() === 'PUT') {
      for (const rec of JSON.parse(req.postData()).records) rows.set(`${rec.bucket}/${rec.id}`, rec);
      return json(200, { ok: true });
    }
    return json(200, { records: [...rows.values()] });
  });

  // the playlist was emptied earlier in this run; put a track back before sharing
  await page.click('[data-view="network"]');
  await page.waitForSelector('#tracksContainer .track-row[data-idx="0"]');
  await page.click('#tracksContainer .track-row[data-idx="0"] [data-act="add"]');
  await page.waitForSelector('#pickerList [data-plid]');
  // by name: the import added a playlist of its own, so position is not identity
  await page.click('#pickerList [data-plid]:has-text("Nightshift")');
  await page.waitForFunction(() => Array.from(document.querySelectorAll('#pickerList [data-plid]'))
    .some((b) => b.textContent.includes('Nightshift') && b.getAttribute('aria-pressed') === 'true'));
  await page.click('#pickerClose');

  await page.click('[data-view="playlists"]');
  await page.waitForSelector('[data-pl]');
  await page.click('#tracksContainer [data-pl]:has-text("Nightshift")');
  await page.waitForSelector('#viewHeader [data-act="share"]');
  await page.click('#viewHeader [data-act="share"]');
  await page.waitForFunction(() => document.querySelector('#viewHeader [data-act="share"]').getAttribute('aria-pressed') === 'true', null, { timeout: 5000 });
  ok(true, 'a playlist can be published');

  const token = await page.evaluate(async () => {
    const Sync = await import('./components/library-sync.js');
    const Library = await import('./components/library.js');
    const identity = Sync.readIdentity();
    const pl = Library.listPlaylists().find((p) => p.name === 'Nightshift');
    return { token: Sync.shareToken(identity.pair.pub, pl.id, Sync.readInstance()), isPublic: pl.isPublic, name: pl.name };
  });
  ok(token.isPublic === true, 'the playlist is marked public in the library');

  await page.click('[data-view="playlists"]');
  await page.waitForSelector('[data-pl]');
  ok((await page.textContent('#tracksContainer')).includes('public'), 'the playlist row shows it is public');

  // wait until the published copy is actually readable before following the
  // link: the graph publishes on its own schedule and this test is faster than a
  // human with a copied URL ever is
  const readable = await (async () => {
    for (let i = 0; i < 20; i++) {
      const found = await page.evaluate(async (t) => {
        const Sync = await import('./components/library-sync.js');
        const parsed = Sync.parseShareToken(t);
        const pl = await Sync.fetchSharedPlaylist({ instance: parsed.instance, pub: parsed.pub, id: parsed.id, timeout: 1500 });
        return pl ? pl.name : null;
      }, token.token);
      if (found) return found;
    }
    return null;
  })();
  ok(readable === token.name, 'the published playlist is readable from the instance');

  // open the share link as a visitor would
  await page.goto(`${BASE_URL}/player.html?pl=${encodeURIComponent(token.token)}`);
  await page.waitForSelector('#viewHeader:not(.hidden)', { timeout: 15000 });
  await page.waitForFunction(() => {
    const h = document.getElementById('viewHeader');
    return h && !h.textContent.includes('Fetching');
  }, null, { timeout: 15000 });
  ok((await page.textContent('#viewHeader')).includes(token.name), 'the shared link opens that playlist: ' + (await page.textContent('#viewHeader')).replace(/\s+/g, ' ').trim().slice(0, 60));
  ok((await page.textContent('#viewHeader')).includes('@alias'.replace('alias', alias)), 'and credits who shared it');
  ok(await page.$$eval('#tracksContainer .track-row[data-idx]', (r) => r.length) === 1, 'its track is listed');

  await page.click('#viewHeader [data-act="saveshared"]');
  await page.waitForFunction(() => document.getElementById('viewHeader').textContent.includes('from @'), null, { timeout: 5000 });
  ok(true, 'a visitor can save it into their own library');

  ok(errors.length === 0, 'no page errors: ' + JSON.stringify(errors.slice(0, 3)));
  console.log(`\nok — ${passed} checks passed`);
  await browser.close();
})().catch(async (e) => { console.error(e.message); process.exit(1); });
