/**
 * TuneCamp personal library — favourites, followed artists, playlists, recents.
 *
 * The community player aggregates tracks from every reachable instance, so a
 * saved item cannot be a plain foreign-key: the instance that served the track
 * today may be offline tomorrow, may move domain, or the player's own
 * de-duplication (title+artist) may pick a different copy on the next load.
 * Everything saved here is therefore a *snapshot* — enough to render and play
 * the track on its own — plus two identifiers:
 *
 *   canonical   `tc:v1:<host>/<sourceId>`  — where this copy came from
 *   key         `fp:<title>::<artist>`     — what the track *is*
 *
 * `key` is the map key, matching the de-duplication the player already does in
 * updateTracksList(), so a favourite re-binds itself to whichever copy of the
 * song is alive at the moment. Tracks with no usable title/artist fall back to
 * the canonical id as their key.
 *
 * Storage is always local: localStorage, per-browser and anonymous — no
 * account, no server, nothing leaves the device. On top of that, an optional
 * sync layer (components/library-sync.js, driven by a FID identity) mirrors the
 * same library through the Zen graph so it follows the listener across devices.
 * Local stays the source of truth for rendering; sync only merges.
 *
 * Merging is last-write-wins per item, never per list: two devices editing
 * different favourites must not overwrite each other's work. Deletions leave
 * tombstones (`deletedAt`) rather than dropping the record, so a delete on one
 * device is not resurrected by the other's stale copy.
 */

const STORAGE_KEY = 'tc_library_v1';
const SCHEMA_VERSION = 1;
const RECENTS_LIMIT = 60;
/** Tombstones outlive the deletion long enough for any other device to see it. */
const TOMBSTONE_TTL_MS = 180 * 24 * 60 * 60 * 1000;

const UNKNOWN_VALUES = new Set(['', 'unknown', 'unknown artist', 'untitled', 'various', 'various artists']);

/* ------------------------------------------------------------------ identity */

/** Lowercased, accent-stripped, punctuation-collapsed — the comparison form. */
function norm(value) {
    return String(value == null ? '' : value)
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function isMeaningful(value) {
    const n = norm(value);
    return n.length > 0 && !UNKNOWN_VALUES.has(n);
}

function hostOf(siteUrl) {
    if (!siteUrl) return 'local';
    try {
        return new URL(siteUrl).host;
    } catch (e) {
        return String(siteUrl).replace(/^https?:\/\//, '').replace(/\/.*$/, '') || 'local';
    }
}

/** Provenance id: which copy, on which instance, this snapshot was taken from. */
export function canonicalId(track) {
    if (!track) return null;
    const id = track.id != null ? track.id : track.sourceId;
    return `tc:v1:${hostOf(track.siteUrl)}/${id == null ? '' : id}`;
}

/** Identity id: what the song is, independent of which instance serves it. */
export function trackKey(track) {
    if (!track) return null;
    if (track.key) return track.key;
    if (isMeaningful(track.title) && isMeaningful(track.artistName || track.artist)) {
        return `fp:${norm(track.title)}::${norm(track.artistName || track.artist)}`;
    }
    return canonicalId(track);
}

export function artistKey(name) {
    return `ar:${norm(name)}`;
}

/** The stored form of a track: renderable and playable with no network catalog. */
export function snapshot(track) {
    if (!track) return null;
    return {
        key: trackKey(track),
        canonical: canonicalId(track),
        title: track.title || 'Untitled',
        artistName: track.artistName || track.artist || 'Unknown Artist',
        releaseTitle: track.releaseTitle || '',
        coverUrl: track.coverUrl || '',
        audioUrl: track.audioUrl || '',
        duration: track.duration || 0,
        siteUrl: track.siteUrl || '',
        sourceId: track.id != null ? track.id : (track.sourceId != null ? track.sourceId : null)
    };
}

/* ------------------------------------------------------------------- backend */

const localBackend = {
    name: 'local',
    load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            console.warn('[library] could not read local storage:', e);
            return null;
        }
    },
    save(state) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            return true;
        } catch (e) {
            // Quota exhausted or storage disabled (private mode): the library
            // keeps working for this session, it just will not survive a reload.
            console.warn('[library] could not persist:', e);
            return false;
        }
    }
};

let backend = localBackend;

/** Phase 2 hook: swap in a synced backend (FID/Zen) without touching callers. */
export function setBackend(next) {
    backend = next || localBackend;
    state = migrate(backend.load());
    emit();
}

/* --------------------------------------------------------------------- state */

function emptyState() {
    return {
        v: SCHEMA_VERSION,
        favorites: {},
        artists: {},
        playlists: {},
        recents: [],
        prefs: {}
    };
}

function migrate(raw) {
    const fresh = emptyState();
    if (!raw || typeof raw !== 'object') return fresh;
    return {
        v: SCHEMA_VERSION,
        favorites: raw.favorites && typeof raw.favorites === 'object' ? raw.favorites : fresh.favorites,
        artists: raw.artists && typeof raw.artists === 'object' ? raw.artists : fresh.artists,
        playlists: raw.playlists && typeof raw.playlists === 'object' ? raw.playlists : fresh.playlists,
        recents: Array.isArray(raw.recents) ? raw.recents : fresh.recents,
        prefs: raw.prefs && typeof raw.prefs === 'object' ? raw.prefs : fresh.prefs
    };
}

let state = migrate(backend.load());

const listeners = new Set();

function emit() {
    listeners.forEach((fn) => {
        try {
            fn(state);
        } catch (e) {
            console.warn('[library] listener failed:', e);
        }
    });
}

function persist() {
    backend.save(state);
    emit();
}

/** Fires on every mutation, and when another tab writes the same library. */
export function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('storage', (e) => {
        if (e.key !== STORAGE_KEY || backend !== localBackend) return;
        state = migrate(localBackend.load());
        emit();
    });
}

function alive(record) {
    return !!record && !record.deletedAt;
}

function prune() {
    const cutoff = Date.now() - TOMBSTONE_TTL_MS;
    let changed = false;
    for (const bucket of [state.favorites, state.artists, state.playlists]) {
        for (const id of Object.keys(bucket)) {
            const rec = bucket[id];
            if (rec && rec.deletedAt && rec.deletedAt < cutoff) {
                delete bucket[id];
                changed = true;
            }
        }
    }
    return changed;
}
if (prune()) backend.save(state);

/* ----------------------------------------------------------------- favourites */

export function isFavorite(track) {
    return alive(state.favorites[trackKey(track)]);
}

/** Adds or removes, and returns the resulting state (true = now a favourite). */
export function toggleFavorite(track) {
    const key = trackKey(track);
    if (!key) return false;
    if (alive(state.favorites[key])) {
        state.favorites[key] = { key, deletedAt: Date.now() };
        persist();
        return false;
    }
    state.favorites[key] = Object.assign(snapshot(track), { addedAt: Date.now() });
    persist();
    return true;
}

export function listFavorites() {
    return Object.values(state.favorites)
        .filter(alive)
        .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
}

export function countFavorites() {
    return listFavorites().length;
}

/* -------------------------------------------------------------------- artists */

export function isArtistFollowed(name) {
    return alive(state.artists[artistKey(name)]);
}

export function toggleArtist(name) {
    if (!isMeaningful(name)) return false;
    const key = artistKey(name);
    if (alive(state.artists[key])) {
        state.artists[key] = { key, deletedAt: Date.now() };
        persist();
        return false;
    }
    state.artists[key] = { key, name: String(name), addedAt: Date.now() };
    persist();
    return true;
}

export function listArtists() {
    return Object.values(state.artists)
        .filter(alive)
        .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
}

/* ------------------------------------------------------------------ playlists */

function newId() {
    return 'pl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function createPlaylist(name) {
    const id = newId();
    const now = Date.now();
    state.playlists[id] = {
        id,
        name: String(name || 'New playlist').slice(0, 120),
        items: [],
        createdAt: now,
        updatedAt: now
    };
    persist();
    return state.playlists[id];
}

/**
 * Marks a playlist public, which is what the sync layer republishes in the
 * clear so a link to it can be opened by anyone. Everything else a listener
 * saves stays encrypted to their own key.
 */
export function setPlaylistPublic(id, isPublic) {
    const pl = getPlaylist(id);
    if (!pl) return null;
    pl.isPublic = !!isPublic;
    pl.updatedAt = Date.now();
    persist();
    return pl;
}

export function renamePlaylist(id, name) {
    const pl = state.playlists[id];
    if (!alive(pl)) return null;
    pl.name = String(name || pl.name).slice(0, 120);
    pl.updatedAt = Date.now();
    persist();
    return pl;
}

export function deletePlaylist(id) {
    const pl = state.playlists[id];
    if (!alive(pl)) return false;
    state.playlists[id] = { id, deletedAt: Date.now() };
    persist();
    return true;
}

export function getPlaylist(id) {
    const pl = state.playlists[id];
    return alive(pl) ? pl : null;
}

export function listPlaylists() {
    return Object.values(state.playlists)
        .filter(alive)
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function playlistHas(id, track) {
    const pl = getPlaylist(id);
    if (!pl) return false;
    const key = trackKey(track);
    return pl.items.some((it) => it.key === key);
}

export function addToPlaylist(id, track) {
    const pl = getPlaylist(id);
    if (!pl) return false;
    const key = trackKey(track);
    if (!key || pl.items.some((it) => it.key === key)) return false;
    pl.items.push(Object.assign(snapshot(track), { addedAt: Date.now() }));
    pl.updatedAt = Date.now();
    persist();
    return true;
}

export function removeFromPlaylist(id, key) {
    const pl = getPlaylist(id);
    if (!pl) return false;
    const before = pl.items.length;
    pl.items = pl.items.filter((it) => it.key !== key);
    if (pl.items.length === before) return false;
    pl.updatedAt = Date.now();
    persist();
    return true;
}

/* -------------------------------------------------------------------- recents */

export function pushRecent(track) {
    const snap = snapshot(track);
    if (!snap || !snap.key) return;
    state.recents = [Object.assign(snap, { playedAt: Date.now() })]
        .concat(state.recents.filter((r) => r.key !== snap.key))
        .slice(0, RECENTS_LIMIT);
    persist();
}

export function listRecents() {
    return state.recents.slice();
}

export function clearRecents() {
    state.recents = [];
    persist();
}

/* ---------------------------------------------------------------------- prefs */

export function getPrefs() {
    return Object.assign({}, state.prefs);
}

export function setPrefs(patch) {
    state.prefs = Object.assign({}, state.prefs, patch || {});
    persist();
}

/* ------------------------------------------------------------------ hydration */

/**
 * Re-binds a stored snapshot to the live copy in the loaded catalog, so a
 * favourite saved months ago plays from whichever instance is up now. Falls
 * back to the snapshot itself, which still carries a direct audio URL.
 */
export function hydrate(record, liveIndex) {
    if (!record) return null;
    if (liveIndex) {
        const live = liveIndex.get(record.key);
        if (live) return live;
    }
    return record;
}

export function buildLiveIndex(tracks) {
    const index = new Map();
    (tracks || []).forEach((t) => {
        const key = trackKey(t);
        if (key && !index.has(key)) index.set(key, t);
    });
    return index;
}

/* --------------------------------------------------------------- import/export */

/* ----------------------------------------------------------------- merging */

/** The timestamp an item is compared by: its last write, whatever kind. */
function stampOf(record) {
    return (record && (record.deletedAt || record.updatedAt || record.addedAt)) || 0;
}

function mergeBucket(mine, theirs, appliedKeys, bucketName) {
    Object.keys(theirs || {}).forEach((id) => {
        const incoming = theirs[id];
        if (!incoming) return;
        if (!mine[id] || stampOf(incoming) > stampOf(mine[id])) {
            mine[id] = incoming;
            if (appliedKeys) appliedKeys.push(bucketName + '/' + id);
        }
    });
}

function mergeRecents(mine, theirs) {
    const seen = new Set();
    return mine
        .concat(theirs || [])
        .sort((a, b) => (b.playedAt || 0) - (a.playedAt || 0))
        .filter((r) => (r && r.key && !seen.has(r.key)) ? seen.add(r.key) : false)
        .slice(0, RECENTS_LIMIT);
}

/**
 * Folds another copy of the library into this one — a file being imported, or
 * items arriving from the sync layer. Returns the `bucket/id` paths it actually
 * applied, which is what lets the caller avoid echoing them straight back.
 */
export function mergeRemote(partial) {
    if (!partial || typeof partial !== 'object') return [];
    const applied = [];
    mergeBucket(state.favorites, partial.favorites, applied, 'favorites');
    mergeBucket(state.artists, partial.artists, applied, 'artists');
    mergeBucket(state.playlists, partial.playlists, applied, 'playlists');
    if (Array.isArray(partial.recents) && partial.recents.length) {
        state.recents = mergeRecents(state.recents, partial.recents);
    }
    if (applied.length || (partial.recents && partial.recents.length)) persist();
    return applied;
}

/** A frozen view for the sync layer to diff against; never mutate the result. */
export function readState() {
    return state;
}

export function exportJson() {
    return JSON.stringify({
        app: 'tunecamp-community-player',
        v: SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        library: state
    }, null, 2);
}

/**
 * Merges an exported library into this one. Per item, the newer timestamp wins
 * — the same rule a future device-to-device sync will use, so importing a file
 * and syncing a relay cannot disagree about the result.
 */
export function importJson(text) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (e) {
        throw new Error('Not a valid TuneCamp library file.');
    }
    const incoming = migrate(parsed && parsed.library ? parsed.library : parsed);

    mergeBucket(state.favorites, incoming.favorites);
    mergeBucket(state.artists, incoming.artists);
    mergeBucket(state.playlists, incoming.playlists);
    state.recents = mergeRecents(state.recents, incoming.recents);
    state.prefs = Object.assign({}, incoming.prefs, state.prefs);
    persist();
    return {
        favorites: countFavorites(),
        playlists: listPlaylists().length,
        artists: listArtists().length
    };
}

export function clearAll() {
    state = emptyState();
    persist();
}

/** Test seam: swap localStorage-backed state for a known one. */
export function _resetForTests(next) {
    state = migrate(next);
}
