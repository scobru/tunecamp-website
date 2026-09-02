/**
 * Optional sync of the personal library through a FID identity.
 *
 * The library itself lives in localStorage and works with no account at all.
 * When a listener has unlocked a FID identity (the Zen SEA keypair the Profile
 * page derives and stores under `tunecamp_zen_user`), this mirrors the same
 * library into their own subtree of the Zen graph — `~<pub>/tc-library-v1/…` —
 * so it follows them to another browser or device. No TuneCamp server is
 * involved: the relay only carries signed writes it cannot forge, and only the
 * holder of the private key can write under that subtree.
 *
 * What crosses the wire, and in what shape:
 *
 *   favorites/<id>  { d: <ciphertext>, at, del }   private, encrypted to the pair
 *   artists/<id>    { d: <ciphertext>, at, del }   private, encrypted to the pair
 *   playlists/<id>  { d: <ciphertext>, at, del }   private, encrypted to the pair
 *   shared/<id>     { name, items, at, del }       PUBLIC and in the clear
 *
 * Only the payload is encrypted; timestamps stay readable because the merge
 * needs them. So the relay can see how many items an identity has and when they
 * changed, but not what they are. `shared/` is the deliberate exception: a
 * playlist the listener marked public, republished in the clear so a link to it
 * opens for anyone — that is the point of sharing one.
 *
 * Listening history and player preferences are never synced.
 */

import * as Library from './library.js';

const ROOT = 'tc-library-v1';
const PRIVATE_BUCKETS = ['favorites', 'artists', 'playlists'];
/** Coalesces a burst of edits (and swallows the echo of an incoming merge). */
const PUSH_DEBOUNCE_MS = 400;
/**
 * A write that is never acknowledged must not wedge the queue. Without this the
 * push loop awaits an ack that may never come — the library then looks
 * connected while nothing has moved, which is exactly what a stalled relay
 * looked like in the field.
 */
const PUT_TIMEOUT_MS = 10000;
/** Backoff after a failed batch, so a down relay is retried but not hammered. */
const RETRY_MS = 15000;
/** One shared playlist is one graph node, so it cannot grow without bound. */
export const SHARED_TRACK_LIMIT = 200;

/** The last write on a record, whichever kind it was. Mirrors library.js. */
function stampOf(record) {
    return (record && (record.deletedAt || record.updatedAt || record.addedAt)) || 0;
}

/** Library keys may contain `/`, which is the graph's own path separator. */
function nodeId(key) {
    return encodeURIComponent(String(key));
}

/**
 * Reads the identity the Profile page unlocked. This module only consumes it;
 * creating and storing it stays profile.html's job.
 */
export function readIdentity() {
    try {
        const parsed = JSON.parse(localStorage.getItem('tunecamp_zen_user') || 'null');
        if (!parsed || !parsed.alias || !parsed.pair || !parsed.pair.pub || !parsed.pair.priv) return null;
        return { alias: parsed.alias, pair: parsed.pair };
    } catch (e) {
        return null;
    }
}

/** `?pl=<pub>.<id>` — the shareable address of a public playlist. */
export function shareToken(pub, id) {
    return `${pub}.${id}`;
}

export function parseShareToken(token) {
    const raw = String(token || '');
    const dot = raw.lastIndexOf('.');
    if (dot <= 0 || dot === raw.length - 1) return null;
    return { pub: raw.slice(0, dot), id: raw.slice(dot + 1) };
}

/**
 * Fetches a public playlist without any identity — this is what opening a
 * shared link does. Resolves null when nothing answers before `timeout`, which
 * is the normal outcome when the relay is unreachable.
 */
export function fetchSharedPlaylist({ Zen, relay, pub, id, timeout = 8000 }) {
    return new Promise((resolve) => {
        let settled = false;
        const done = (value) => { if (!settled) { settled = true; resolve(value); } };
        setTimeout(() => done(null), timeout);
        try {
            const zen = new Zen({ peers: relay ? [relay] : [] });
            zen.get('~' + pub).get(ROOT).get('shared').get(id).on((node) => {
                if (!node || node.del) return;
                let items = [];
                try {
                    items = JSON.parse(node.items || '[]');
                } catch (e) {
                    return done(null);
                }
                if (!Array.isArray(items)) return done(null);
                done({ id, pub, name: node.name || 'Shared playlist', owner: node.owner || '', items });
            });
        } catch (e) {
            done(null);
        }
    });
}

/**
 * Wires a library to an identity's subtree. Returns a handle; nothing happens
 * until start(). Safe to construct when the relay is unreachable: local edits
 * keep working and the pushes simply never leave the browser.
 */
export function createSync({ Zen, relay, identity, onStatus }) {
    const { pair, alias } = identity;
    let zen = null;
    let root = null;
    let unsubscribeLibrary = null;
    let pushTimer = null;
    let running = false;

    /** bucket/id -> the stamp last seen on the wire, in either direction. */
    const settled = new Map();
    const status = {
        enabled: false, connected: false, alias, relay,
        pushed: 0, pulled: 0,
        /** Items changed locally that the relay has not acknowledged yet. */
        pending: 0,
        /**
         * Live items this identity keeps mirrored. Reported because pushed/pulled
         * count only this session's traffic: a listener who returns already in
         * sync legitimately transfers nothing, and a bare "0 sent, 0 received"
         * reads as a failure when it means "up to date".
         */
        mirrored: 0,
        lastError: null
    };
    let peers = 0;
    let pushing = false;
    let pushQueued = false;

    function report() {
        if (onStatus) onStatus(Object.assign({}, status));
    }

    function markSettled(bucket, id, stamp) {
        settled.set(bucket + '/' + id, stamp);
    }

    /**
     * Applies one node from the graph. The bucket subscriptions call this; it
     * is also the seam the tests drive directly, because a graph subscription
     * only delivers what a relay pushes and the tests run without one.
     */
    async function applyRemote(bucket, id, node) {
        if (!node || typeof node !== 'object') return;
        const key = decodeURIComponent(id);
        const stamp = Number(node.at) || 0;
        if (settled.get(bucket + '/' + id) === stamp) return;

        let record;
        if (node.del) {
            record = bucket === 'playlists' ? { id: key, deletedAt: stamp } : { key, deletedAt: stamp };
        } else if (node.d) {
            try {
                record = await Zen.decrypt(node.d, pair);
            } catch (e) {
                // Written under a different key, or corrupt: skip it rather than
                // letting one bad node stop the rest of the sync.
                return;
            }
            if (!record || typeof record !== 'object') return;
        } else {
            return;
        }

        markSettled(bucket, id, stamp);
        const applied = Library.mergeRemote({ [bucket]: { [key]: record } });
        if (applied.length) {
            status.pulled += applied.length;
            report();
        }
    }

    function subscribe() {
        PRIVATE_BUCKETS.forEach((bucket) => {
            root.get(bucket).map().on((node, id) => { applyRemote(bucket, id, node); });
        });
    }

    /** Live (non-tombstoned) items across the synced buckets. */
    function countLiveItems() {
        const state = Library.readState();
        return PRIVATE_BUCKETS.reduce((total, bucket) => {
            const items = state[bucket] || {};
            return total + Object.keys(items).filter((key) => items[key] && !items[key].deletedAt).length;
        }, 0);
    }

    /** Everything whose current stamp differs from what the wire last carried. */
    function pendingChanges() {
        const state = Library.readState();
        const changes = [];
        PRIVATE_BUCKETS.forEach((bucket) => {
            const items = state[bucket] || {};
            Object.keys(items).forEach((key) => {
                const record = items[key];
                const stamp = stampOf(record);
                const id = nodeId(key);
                if (settled.get(bucket + '/' + id) !== stamp) changes.push({ bucket, id, key, record, stamp });
            });
        });
        return changes;
    }

    function put(node, value) {
        return new Promise((resolve) => {
            let settledHere = false;
            const done = (ok, err) => {
                if (settledHere) return;
                settledHere = true;
                status.lastError = err || null;
                resolve(ok);
            };
            const timer = setTimeout(
                () => done(false, 'the relay did not acknowledge a write within ' + (PUT_TIMEOUT_MS / 1000) + 's'),
                PUT_TIMEOUT_MS
            );
            try {
                node.put(value, (ack) => {
                    clearTimeout(timer);
                    if (ack && ack.err) done(false, String(ack.err));
                    else done(true);
                }, { authenticator: pair });
            } catch (e) {
                clearTimeout(timer);
                done(false, e.message);
            }
        });
    }

    async function pushOnce() {
        if (!running) return;
        // One push at a time: a second run would re-send what the first is still
        // waiting on, and both would fight over the same settled markers.
        if (pushing) { pushQueued = true; return; }
        pushing = true;
        let stalled = false;
        try {
            const changes = pendingChanges();
            status.pending = changes.length;
            for (const change of changes) {
                if (!running) break;
                const value = change.record.deletedAt
                    ? { d: null, at: change.stamp, del: 1 }
                    : { d: await Zen.encrypt(change.record, pair), at: change.stamp, del: 0 };
                const ok = await put(root.get(change.bucket).get(change.id), value);
                if (!ok) { stalled = true; break; }
                markSettled(change.bucket, change.id, change.stamp);
                status.pushed++;
                status.pending--;
                report();
            }
            if (!stalled) stalled = !(await syncShared());
        } finally {
            pushing = false;
            status.pending = pendingChanges().length;
            status.mirrored = countLiveItems();
            report();
        }
        // Nothing is marked settled on a failure, so the next attempt simply
        // finds the same work waiting.
        if (stalled && running) setTimeout(() => { if (running) pushOnce(); }, RETRY_MS);
        else if (pushQueued) { pushQueued = false; schedulePush(); }
    }

    /**
     * Public playlists are republished in the clear, and unpublishing one
     * tombstones the shared copy so an old link stops resolving.
     */
    async function syncShared() {
        const state = Library.readState();
        for (const id of Object.keys(state.playlists || {})) {
            const pl = state.playlists[id];
            const wanted = !!(pl && pl.isPublic && !pl.deletedAt);
            const stamp = stampOf(pl);
            const marker = 'shared/' + id;
            if (settled.get(marker) === (wanted ? stamp : -stamp)) continue;

            const value = wanted
                ? {
                    name: pl.name || 'Shared playlist',
                    owner: alias || '',
                    items: JSON.stringify((pl.items || []).slice(0, SHARED_TRACK_LIMIT)),
                    at: stamp,
                    del: 0
                }
                : { name: null, owner: null, items: null, at: stamp, del: 1 };

            const ok = await put(root.get('shared').get(id), value);
            if (!ok) return false;
            settled.set(marker, wanted ? stamp : -stamp);
        }
        return true;
    }

    function schedulePush() {
        clearTimeout(pushTimer);
        pushTimer = setTimeout(() => {
            pushOnce().catch((e) => { status.lastError = e.message; report(); });
        }, PUSH_DEBOUNCE_MS);
    }

    function start() {
        if (running) return handle;
        try {
            zen = new Zen({ peers: relay ? [relay] : [] });
            root = zen.get('~' + pair.pub).get(ROOT);
        } catch (e) {
            status.lastError = e.message;
            report();
            return handle;
        }
        // Zen reports peers joining and leaving, which is the only honest way to
        // say whether anything is actually reaching the relay: writes made while
        // it is unreachable stay queued in the browser rather than failing.
        zen.on('hi', () => { peers++; status.connected = peers > 0; report(); });
        zen.on('bye', () => { peers = Math.max(0, peers - 1); status.connected = peers > 0; report(); });

        running = true;
        status.enabled = true;
        status.mirrored = countLiveItems();
        subscribe();
        unsubscribeLibrary = Library.subscribe(schedulePush);
        schedulePush();
        report();
        return handle;
    }

    function stop() {
        running = false;
        status.enabled = false;
        status.connected = false;
        clearTimeout(pushTimer);
        if (unsubscribeLibrary) unsubscribeLibrary();
        unsubscribeLibrary = null;
        report();
        return handle;
    }

    const handle = {
        start,
        stop,
        /** Entry point for one incoming node; see applyRemote. */
        receive: (bucket, id, node) => applyRemote(bucket, id, node),
        /** Forces a push now instead of waiting out the debounce. */
        flush: () => pushOnce(),
        status: () => Object.assign({}, status),
        shareTokenFor: (id) => shareToken(pair.pub, id)
    };
    return handle;
}
