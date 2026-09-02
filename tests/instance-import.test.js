/**
 * Unit tests for importing instance stars into the library.
 *
 *     node --experimental-default-type=module tests/instance-import.test.js
 *
 * The network is injected, so this covers the mapping and the bookkeeping;
 * tests/player.e2e.cjs drives the same code against a stubbed instance over
 * real HTTP.
 */

const store = new Map();
globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
};
globalThis.window = { addEventListener() {} };

const Library = await import('../components/library.js');
const Import = await import('../components/instance-import.js');

let passed = 0;
function ok(cond, msg) { if (!cond) throw new Error('FAIL: ' + msg); passed++; }

const INSTANCE = { domain: 'sudorecords.test', username: 'scobru', baseUrl: 'https://sudorecords.test' };

// --- reading the linked instances ----------------------------------------
store.set('tunecamp_zen_user', JSON.stringify({ alias: 'scobru', pair: { pub: 'p', priv: 's' } }));
store.set('tunecamp_linked_instances', JSON.stringify([
    { instanceDomain: 'sudorecords.test', localUsername: 'scobru' },
    { instanceDomain: 'https://subterra.test/', username: 'Scobru' }
]));
store.set('fid_registry', JSON.stringify([
    { instanceDomain: 'sudorecords.test', localUsername: 'scobru' },   // duplicate of the first
    { instanceDomain: 'third.test' }                                    // no username: falls back to the alias
]));

const linked = Import.readLinkedInstances();
ok(linked.length === 3, 'both stores are read and duplicates dropped, got ' + linked.length);
ok(linked[0].baseUrl === 'https://sudorecords.test', 'a bare domain becomes an https base url');
ok(linked[1].domain === 'subterra.test' && linked[1].username === 'Scobru', 'a url-shaped entry is reduced to its host');
ok(linked[2].username === 'scobru', 'an entry with no username falls back to the identity alias');

store.set('tunecamp_linked_instances', 'not json');
ok(Import.readLinkedInstances().length === 2, 'a corrupt store does not take the others down');
store.set('tunecamp_linked_instances', JSON.stringify([{ instanceDomain: 'sudorecords.test', localUsername: 'scobru' }]));

// --- mapping a like to a track -------------------------------------------
const trackLike = {
    type: 'track', id: 42, track_title: 'Position', track_artist: 'Fade',
    album_title: 'Playground', album_cover: '/api/albums/3/cover'
};
const mapped = Import.likeToTrack(trackLike, INSTANCE);
ok(mapped.title === 'Position' && mapped.artistName === 'Fade', 'title and artist come from the track columns');
ok(mapped.audioUrl === 'https://sudorecords.test/api/tracks/42/stream', 'a playable stream url is built');
ok(mapped.coverUrl === 'https://sudorecords.test/api/albums/3/cover', 'the cover path is made absolute');
ok(Import.likeToTrack({ type: 'album', id: 1, album_title: 'X' }, INSTANCE) === null, 'an album like is not a track');
ok(Import.likeToTrack({ type: 'track', id: 2, track_title: 'No artist' }, INSTANCE) === null, 'a like with no artist cannot be keyed');

// --- preferring the live copy from the network ---------------------------
const live = {
    id: 9, title: 'Position', artistName: 'Fade', duration: 210,
    siteUrl: 'https://mirror.test', audioUrl: 'https://mirror.test/api/tracks/9/stream'
};
const index = Library.buildLiveIndex([live]);
ok(Import.resolveAgainstNetwork(mapped, index).audioUrl === live.audioUrl, 'the reachable network copy wins');
ok(Import.resolveAgainstNetwork(mapped, new Map()).audioUrl === mapped.audioUrl, 'otherwise the instance copy is kept');

// --- importing ------------------------------------------------------------
const payload = {
    publicLikes: [
        trackLike,
        { type: 'track', id: 43, track_title: 'Crisalide', track_artist: 'La Guerra delle Formiche' },
        { type: 'album', id: 7, album_title: 'An album' }
    ],
    publicPlaylists: [{ id: 1, name: 'Nightshift' }]
};
const PLAYLIST_ROWS = {
    id: 1, name: 'Nightshift', username: 'scobru',
    tracks: [
        { id: 90, title: 'Salt', artistName: 'Ori Vale', albumTitle: 'Dust', duration: 133, coverUrl: '/api/albums/8/cover', streamUrl: '/api/tracks/90/stream' },
        { id: 91, title: 'Halo', artistName: 'Mesa Rey', duration: 301, streamUrl: '/api/tracks/91/stream' }
    ]
};
/** An instance new enough to expose a public playlist's tracks. */
const fetchImpl = async (url) => {
    if (!url.includes('sudorecords.test')) throw new Error('HTTP 502');
    if (url.includes('/api/playlists/')) return PLAYLIST_ROWS;
    return payload;
};
/** An instance that predates the anonymous read: the playlist 404s. */
const fetchOld = async (url) => {
    if (!url.includes('sudorecords.test')) throw new Error('HTTP 502');
    if (url.includes('/api/playlists/')) throw new Error('HTTP 404');
    return payload;
};

Library.clearAll();
const first = await Import.importFrom(
    [INSTANCE, { domain: 'down.test', username: 'x', baseUrl: 'https://down.test' }],
    { liveIndex: null, fetchImpl }
);
ok(first.added === 2, 'both track likes became favourites');
ok(first.albums === 1, 'the album like is reported, not imported');
ok(first.instances[1].error === 'HTTP 502', 'an unreachable instance is recorded, not fatal');
ok(Library.countFavorites() === 2, 'the library holds them');

// --- playlists ------------------------------------------------------------
ok(first.playlists === 1 && first.playlistTracks === 2, 'the public playlist came across with its tracks');
const imported = Library.listPlaylists()[0];
ok(imported.name === 'Nightshift', 'named as it is on the instance');
ok(imported.importedFrom === 'sudorecords.test/1', 'stamped with where it came from');
ok(imported.items[0].audioUrl === 'https://sudorecords.test/api/tracks/90/stream', 'its tracks are playable');
ok(imported.items[0].coverUrl === 'https://sudorecords.test/api/albums/8/cover', 'relative cover paths are absolute');

const second = await Import.importFrom([INSTANCE], { liveIndex: null, fetchImpl });
ok(second.added === 0 && second.alreadyThere === 2, 'a second run adds no favourites');
ok(Library.countFavorites() === 2, 'and does not remove what the first run added');
ok(Library.listPlaylists().length === 1, 'nor does it duplicate the playlist');
ok(second.playlistTracks === 0, 'with nothing new to add to it');

// a track the listener added to the imported playlist survives the next run
Library.addToPlaylist(imported.id, { id: 500, title: 'Mine Too', artistName: 'Someone', siteUrl: 'https://a.test', audioUrl: 'https://a.test/500.mp3' });
await Import.importFrom([INSTANCE], { liveIndex: null, fetchImpl });
ok(Library.getPlaylist(imported.id).items.length === 3, 'an import tops the playlist up, it never rewrites it');

// an instance without the anonymous read says so instead of failing quietly
const old = await Import.importFrom([INSTANCE], { liveIndex: null, fetchImpl: fetchOld });
ok(old.playlists === 0 && old.playlistsUnavailable === 1, 'an older instance reports the playlist as unreadable');
ok(old.added === 0, 'while its likes still import fine');

// opting out of playlists entirely
const likesOnly = await Import.importFrom([INSTANCE], { liveIndex: null, fetchImpl, includePlaylists: false });
ok(likesOnly.playlists === 0 && likesOnly.playlistsUnavailable === 0, 'playlists can be left out of a run');

// a favourite the listener made by hand is untouched by an import
Library.toggleFavorite({ id: 1, title: 'Mine', artistName: 'Someone', siteUrl: 'https://a.test', audioUrl: 'https://a.test/1.mp3' });
await Import.importFrom([INSTANCE], { liveIndex: null, fetchImpl });
ok(Library.countFavorites() === 3, 'an unrelated favourite survives an import');

// --- the summary line -----------------------------------------------------
ok(Import.describeImport(first).includes('2 favourites imported'), 'the summary counts what came in');
ok(Import.describeImport(first).includes('unreachable'), 'and names the failure');
ok(Import.describeImport(second).includes('already saved'), 'a repeat run says so');
ok(Import.describeImport(first).includes('1 playlist imported (2 tracks)'), 'and the playlist is counted');
ok(Import.describeImport(old).includes('not readable on that instance'), 'an older instance is named as such');
ok(Import.describeImport({ instances: [] }).includes('No linked instances'), 'nothing linked is stated plainly');

console.log(`ok — ${passed} assertions passed`);
