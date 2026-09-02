/**
 * Unit tests for the personal library and the play queue.
 *
 * The site has no build step and no test runner, so this is a plain script:
 *
 *     node --experimental-default-type=module tests/library.test.js
 *
 * (the flag is what lets Node load the browser modules, which are ESM but live
 * in a directory with no package.json). It exits non-zero on the first failure.
 */

// Minimal harness: assertions are plain throws, no runner involved.
const store = new Map();
globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
};
globalThis.window = { addEventListener() {} };

const L = await import('../components/library.js');
const { PlayQueue } = await import('../components/queue.js');

let passed = 0;
function ok(cond, msg) {
    if (!cond) throw new Error('FAIL: ' + msg);
    passed++;
}

const t = (over) => Object.assign({
    id: 42, title: 'Blue Room', artistName: 'Nina K', releaseTitle: 'EP',
    coverUrl: 'https://a.test/c.jpg', audioUrl: 'https://a.test/s.mp3',
    duration: 210, siteUrl: 'https://a.test'
}, over);

// --- identity -------------------------------------------------------------
ok(L.trackKey(t()) === 'fp:blue room::nina k', 'fingerprint key');
ok(L.trackKey(t({ siteUrl: 'https://b.test', id: 7 })) === L.trackKey(t()),
   'same song on another instance shares a key');
ok(L.trackKey(t({ title: 'Blué  Room!', artistName: 'NINA k' })) === L.trackKey(t()),
   'accents, case and punctuation normalise away');
ok(L.canonicalId(t()) === 'tc:v1:a.test/42', 'canonical carries provenance');
ok(L.trackKey(t({ title: 'Untitled', artistName: 'Unknown Artist', id: 9 })) === 'tc:v1:a.test/9',
   'unusable title/artist falls back to canonical');

// --- favourites -----------------------------------------------------------
ok(L.isFavorite(t()) === false, 'not a favourite initially');
ok(L.toggleFavorite(t()) === true, 'toggle on returns true');
ok(L.isFavorite(t()) === true, 'now a favourite');
ok(L.isFavorite(t({ siteUrl: 'https://b.test', id: 7 })) === true,
   'favourite recognised on a different instance copy');
ok(L.listFavorites()[0].audioUrl === 'https://a.test/s.mp3', 'snapshot keeps a playable url');
ok(L.toggleFavorite(t()) === false && L.countFavorites() === 0, 'toggle off');
ok(store.has('tc_library_v1'), 'persisted to storage');

// deletion leaves a tombstone for a future sync to honour
const persisted = JSON.parse(store.get('tc_library_v1'));
ok(persisted.favorites['fp:blue room::nina k'].deletedAt > 0, 'tombstone written, not dropped');

// --- artists --------------------------------------------------------------
ok(L.toggleArtist('Nina K') === true && L.isArtistFollowed('nina  k') === true, 'follow artist');
ok(L.toggleArtist('') === false && L.listArtists().length === 1, 'empty artist ignored');

// --- playlists ------------------------------------------------------------
const pl = L.createPlaylist('Late night');
ok(L.listPlaylists().length === 1, 'playlist created');
ok(L.addToPlaylist(pl.id, t()) === true, 'track added');
ok(L.addToPlaylist(pl.id, t({ siteUrl: 'https://b.test', id: 7 })) === false, 'no duplicate across instances');
ok(L.playlistHas(pl.id, t()) === true, 'membership check');
ok(L.removeFromPlaylist(pl.id, L.trackKey(t())) === true && L.getPlaylist(pl.id).items.length === 0, 'remove');
L.renamePlaylist(pl.id, 'Nightshift');
ok(L.getPlaylist(pl.id).name === 'Nightshift', 'rename');
L.deletePlaylist(pl.id);
ok(L.getPlaylist(pl.id) === null && L.listPlaylists().length === 0, 'delete');

// --- recents --------------------------------------------------------------
L.pushRecent(t());
L.pushRecent(t({ title: 'Second', id: 2 }));
L.pushRecent(t());
ok(L.listRecents().length === 2 && L.listRecents()[0].title === 'Blue Room', 'recents dedupe, newest first');

// --- hydration ------------------------------------------------------------
const live = t({ siteUrl: 'https://c.test', id: 99, audioUrl: 'https://c.test/s.mp3' });
const index = L.buildLiveIndex([live]);
ok(L.hydrate(L.snapshot(t()), index).audioUrl === 'https://c.test/s.mp3', 'stored item re-binds to the live copy');
ok(L.hydrate(L.snapshot(t()), new Map()).audioUrl === 'https://a.test/s.mp3', 'falls back to the snapshot');

// --- export / import ------------------------------------------------------
L.toggleFavorite(t());
const dump = L.exportJson();
L.clearAll();
ok(L.countFavorites() === 0, 'cleared');
const summary = L.importJson(dump);
ok(summary.favorites === 1 && L.isFavorite(t()), 'import restores favourites');
ok(L.importJson(dump).favorites === 1, 'import is idempotent');
try { L.importJson('not json'); throw new Error('should have thrown'); }
catch (e) { ok(/valid TuneCamp library/.test(e.message), 'bad import rejected'); }

// --- merging (what the sync layer relies on) -------------------------------
L.clearAll();
L.toggleFavorite(t());                       // local copy, addedAt = now
const localKey = L.trackKey(t());

// an older remote copy of the same item must not win
ok(L.mergeRemote({ favorites: { [localKey]: { key: localKey, title: 'Stale', addedAt: 1 } } }).length === 0,
   'older remote item is ignored');
ok(L.listFavorites()[0].title === 'Blue Room', 'local copy survives');

// a newer remote tombstone must delete it
const applied = L.mergeRemote({ favorites: { [localKey]: { key: localKey, deletedAt: Date.now() + 1000 } } });
ok(applied.length === 1 && applied[0] === 'favorites/' + localKey, 'merge reports what it applied');
ok(L.countFavorites() === 0, 'remote deletion applies locally');

// ...and a stale remote add must not resurrect it
L.mergeRemote({ favorites: { [localKey]: Object.assign(L.snapshot(t()), { addedAt: 5 }) } });
ok(L.countFavorites() === 0, 'a stale add cannot resurrect a deleted item');

// two devices editing different items keep both
L.clearAll();
L.toggleFavorite(t());
L.mergeRemote({ favorites: { 'fp:other::band': { key: 'fp:other::band', title: 'Other', artistName: 'Band', addedAt: Date.now() } } });
ok(L.countFavorites() === 2, 'per-item merge keeps both devices\' work');

// playlists merge on updatedAt, not on content
const mine = L.createPlaylist('Mine');
L.mergeRemote({ playlists: { [mine.id]: { id: mine.id, name: 'Renamed elsewhere', items: [], updatedAt: Date.now() + 1000 } } });
ok(L.getPlaylist(mine.id).name === 'Renamed elsewhere', 'newer remote rename wins');

ok(L.setPlaylistPublic(mine.id, true).isPublic === true, 'playlist can be marked public');
ok(L.setPlaylistPublic(mine.id, false).isPublic === false, 'and private again');
ok(L.setPlaylistPublic('nope', true) === null, 'unknown playlist is a no-op');

ok(L.readState().favorites === L.readState().favorites, 'readState exposes the live state for diffing');
ok(L.mergeRemote(null).length === 0 && L.mergeRemote('nonsense').length === 0, 'garbage merges are ignored');

// --- queue ----------------------------------------------------------------
const tracks = [t({ title: 'A' }), t({ title: 'B' }), t({ title: 'C' })];
const q = new PlayQueue();
q.set(tracks, { type: 'network', label: 'Network' }, 0);
ok(q.current.title === 'A', 'queue starts where told');
ok(q.next().title === 'B' && q.next().title === 'C', 'sequential advance');
ok(q.next().title === 'A', 'wraps around');
ok(q.prev(0).title === 'C', 'prev wraps back');
ok(q.prev(10) === null, 'prev past 3s restarts instead of moving');

q.setShuffle(true);
const seen = new Set([q.current.title]);
for (let i = 0; i < 2; i++) seen.add(q.next().title);
ok(seen.size === 3, 'shuffle visits every track before repeating');

// a filtered view must not silently rewrite what is playing
const q2 = new PlayQueue();
q2.set(tracks, { type: 'playlist', id: 'pl_1', label: 'Nightshift' }, 1);
ok(q2.source.type === 'playlist' && q2.current.title === 'B', 'context retained');
q2.remap([t({ title: 'Z' }), t({ title: 'B' })], L.trackKey);
ok(q2.current.title === 'B' && q2.length === 2, 'remap keeps the playing track after a catalog reload');
q2.remap([t({ title: 'Z' })], L.trackKey);
ok(q2.current === null, 'remap clears the pointer when the track is gone');

console.log(`ok — ${passed} assertions passed`);
