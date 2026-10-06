/**
 * Optional sync of the personal library through a FID identity.
 *
 * The library itself lives in localStorage and works with no account at all.
 * When a listener has unlocked a FID identity (the Ed25519 keypair the Profile
 * page derives and stores under `tunecamp_zen_user`) and linked it to a
 * TuneCamp instance, this mirrors the same library to that instance so it
 * follows them to another browser or device. Plain HTTP, no relay: the
 * instance stores opaque records and only accepts writes signed by the
 * identity key of one of its own accounts (see /api/auth/zen/library on the
 * TuneCamp server).
 *
 * What crosses the wire, and in what shape:
 *
 *   favorites/<id>  { d: <ciphertext>, at, del }   private, encrypted to the identity
 *   artists/<id>    { d: <ciphertext>, at, del }   private, encrypted to the identity
 *   playlists/<id>  { d: <ciphertext>, at, del }   private, encrypted to the identity
 *   shared/<id>     { d: <JSON>, at, del }         PUBLIC and in the clear
 *
 * Only the payload is encrypted; timestamps stay readable because the merge
 * needs them. So the instance can see how many items an identity has and when
 * they changed, but not what they are. `shared/` is the deliberate exception:
 * a playlist the listener marked public, republished in the clear so a link to
 * it opens for anyone — that is the point of sharing one.
 *
 * Listening history and player preferences are never synced.
 */

import * as Library from './library.js';
import { signData, isValidPair } from '../vendor/identity.js';

const PRIVATE_BUCKETS = ['favorites', 'artists', 'playlists'];
const API = '/api/auth/zen/library/';
/** Coalesces a burst of edits (and swallows the echo of an incoming merge). */
const PUSH_DEBOUNCE_MS = 400;
/** A request that never answers must not wedge the queue. */
const REQUEST_TIMEOUT_MS = 10000;
/** Backoff after a failed batch, so a down instance is retried but not hammered. */
const RETRY_MS = 15000;
/** Another device may have written while this one's clock was behind; re-read a little further back. */
const PULL_OVERLAP_MS = 5 * 60 * 1000;
/** How often an open player looks for changes made on another device. */
const POLL_MS = 60000;
const RECORDS_PER_PUT = 100;
const RECORD_BYTE_BUDGET = 60 * 1000; // the server refuses records over 64 KB
/** One shared playlist is one record, so it cannot grow without bound. */
export const SHARED_TRACK_LIMIT = 200;

const enc = new TextEncoder();
const dec = new TextDecoder();
const toHex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

/** The last write on a record, whichever kind it was. Mirrors library.js. */
function stampOf(record) {
    return (record && (record.deletedAt || record.updatedAt || record.addedAt)) || 0;
}

/** Library keys may contain `/`, which is the API's own path separator. */
function nodeId(key) {
    return encodeURIComponent(String(key));
}

/* ---------------------------------------------------------------- crypto */

async function dataKey(priv) {
    const base = await crypto.subtle.importKey('raw', enc.encode(priv), 'HKDF', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('tunecamp-library-v1'), info: new Uint8Array() },
        base,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

/** AES-GCM under a key derived from the identity key. Output: base64url(iv ‖ ciphertext). */
export async function encryptRecord(record, priv) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await dataKey(priv), enc.encode(JSON.stringify(record))));
    const out = new Uint8Array(iv.length + ct.length);
    out.set(iv);
    out.set(ct, iv.length);
    return b64u(out);
}

/** Throws when the data was written under another key or has been tampered with. */
export async function decryptRecord(d, priv) {
    const raw = unb64u(d);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, await dataKey(priv), raw.slice(12));
    return JSON.parse(dec.decode(plain));
}

/* -------------------------------------------------------------- identity */

/**
 * Reads the identity the Profile page unlocked. This module only consumes it;
 * creating and storing it stays profile.html's job.
 */
export function readIdentity() {
    try {
        const parsed = JSON.parse(localStorage.getItem('tunecamp_zen_user') || 'null');
        if (!parsed || !parsed.alias || !parsed.pair || !parsed.pair.pub || !parsed.pair.priv) return null;
        // Ed25519 keys are 32 bytes, 43 base64url characters. A key saved by the old Zen-based
        // page has another shape, and is not an identity any more.
        if (!KEY_SHAPE.test(parsed.pair.pub) || !KEY_SHAPE.test(parsed.pair.priv)) return null;
        return { alias: parsed.alias, pair: parsed.pair };
    } catch (e) {
        return null;
    }
}

const KEY_SHAPE = /^[A-Za-z0-9_-]{43}$/;

/**
 * readIdentity, plus the check that the private key really produces the public one. A session
 * that fails it is removed, so a stale Zen-era login cannot keep failing on every signature.
 */
export async function readValidIdentity() {
    const identity = readIdentity();
    if (identity && await isValidPair(identity.pair)) return identity;
    if (localStorage.getItem('tunecamp_zen_user')) {
        try { localStorage.removeItem('tunecamp_zen_user'); } catch (e) { /* storage unavailable */ }
    }
    return null;
}

/**
 * The instance that stores the library: the first one the identity is linked to
 * (the Profile page keeps those passports in `tunecamp_linked_instances`), else
 * the one discoverInstance found on this device. Returns an origin like
 * `https://host`, or null when neither is known yet.
 */
export function readInstance() {
    try {
        const list = JSON.parse(localStorage.getItem('tunecamp_linked_instances') || '[]');
        for (const item of Array.isArray(list) ? list : []) {
            const raw = String((item && (item.instanceDomain || item.instanceUrl)) || '').trim();
            if (!raw) continue;
            const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
            if (url.protocol === 'https:' || url.hostname === 'localhost') return url.origin;
        }
    } catch (e) { /* fall through */ }
    try { return localStorage.getItem(DISCOVERED_KEY) || null; } catch (e) { return null; }
}

/** Where `discoverInstance` last found the identity's account, for devices with no linked passport. */
const DISCOVERED_KEY = 'tunecamp_sync_instance';

export function rememberInstance(origin) {
    try { localStorage.setItem(DISCOVERED_KEY, origin); } catch (e) { /* storage unavailable: rediscover next time */ }
}

/**
 * Finds the instance that holds an account for this identity key by asking the
 * directory instances (config.js) — what the relay used to do for a new device.
 * Resolves the first origin that answers, or null.
 */
export async function discoverInstance({ pub, directory, timeout = 6000, fetchImpl }) {
    const ask = async (origin) => {
        const res = await (fetchImpl || fetch)(`${origin}${API}${encodeURIComponent(pub)}/account`, { signal: AbortSignal.timeout(timeout) });
        if (!res.ok) throw new Error('no account');
        return origin;
    };
    try {
        return await Promise.any((directory || []).map(ask));
    } catch (e) {
        return null;
    }
}

/** `?pl=<pub>.<id>@<host>` — the shareable address of a public playlist. */
export function shareToken(pub, id, instance) {
    return `${pub}.${id}@${new URL(instance).host}`;
}

export function parseShareToken(token) {
    const raw = String(token || '');
    const at = raw.lastIndexOf('@');
    const dot = raw.indexOf('.'); // the pub key is base64url, so it never contains one
    if (at <= 0 || dot <= 0 || dot > at - 1 || at === raw.length - 1) return null;
    const host = raw.slice(at + 1);
    let instance;
    try {
        instance = new URL(`https://${host}`);
    } catch (e) {
        return null;
    }
    if (instance.host !== host.toLowerCase()) return null;
    return { pub: raw.slice(0, dot), id: raw.slice(dot + 1, at), instance: instance.origin };
}

/**
 * Fetches a public playlist without any identity — this is what opening a
 * shared link does. Resolves null when nothing answers before `timeout`, which
 * is the normal outcome when the instance is unreachable or the owner
 * unpublished the playlist.
 */
export async function fetchSharedPlaylist({ instance, pub, id, timeout = 8000, fetchImpl }) {
    try {
        const res = await (fetchImpl || fetch)(`${instance}${API}${encodeURIComponent(pub)}/shared/${encodeURIComponent(id)}`, {
            signal: AbortSignal.timeout(timeout)
        });
        if (!res.ok) return null;
        const node = await res.json();
        if (!node || !Array.isArray(node.items)) return null;
        return { id, pub, name: node.name || 'Shared playlist', owner: node.owner || '', items: node.items };
    } catch (e) {
        return null;
    }
}

/** The shared playlist as stored: JSON in `d`, trimmed until it fits one record. */
function sharedPayload(pl, alias) {
    let items = (pl.items || []).slice(0, SHARED_TRACK_LIMIT);
    for (;;) {
        const d = JSON.stringify({ name: pl.name || 'Shared playlist', owner: alias || '', items });
        if (enc.encode(d).length < RECORD_BYTE_BUDGET || !items.length) return d;
        items = items.slice(0, Math.floor(items.length * 0.8));
    }
}

/**
 * Wires a library to an identity on one instance. Returns a handle; nothing
 * happens until start(). Safe to construct when the instance is unreachable:
 * local edits keep working and the pushes simply never leave the browser.
 */
export function createSync({ instance, identity, onStatus, fetchImpl }) {
    const { pair, alias } = identity;
    const base = new URL(instance).origin;
    const host = new URL(instance).host;
    const path = API + pair.pub;
    let pushTimer = null;
    let pollTimer = null;
    let unsubscribeLibrary = null;
    let running = false;
    let cursor = 0;

    /** bucket/id -> the stamp last seen on the wire, in either direction. */
    const settled = new Map();
    const status = {
        enabled: false, connected: false, alias, host,
        pushed: 0, pulled: 0,
        /** Items changed locally that the instance has not acknowledged yet. */
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
    let pushing = false;
    let pushQueued = false;

    function report() {
        if (onStatus) onStatus(Object.assign({}, status));
    }

    /** One signed request. Throws with the server's message on any non-2xx answer. */
    async function call(method, body, query = '') {
        const text = body === undefined ? '' : JSON.stringify(body);
        const ts = Date.now();
        const hash = toHex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
        const sig = await signData(`fid-library:${method}:${path}:${ts}:${hash}`, pair.priv);
        const res = await (fetchImpl || fetch)(base + path + query, {
            method,
            headers: Object.assign({ 'X-Fid-Auth': `${ts}.${sig}` }, text ? { 'Content-Type': 'text/plain' } : {}),
            body: text || undefined,
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`${host} answered ${res.status}${data.error ? ': ' + data.error : ''}`);
        return data;
    }

    function markSettled(bucket, id, stamp) {
        settled.set(bucket + '/' + id, stamp);
    }

    /**
     * Applies one record from the instance. pull() calls this; it is also the
     * seam the tests drive directly.
     */
    async function applyRemote(bucket, id, node) {
        if (!node || typeof node !== 'object' || !PRIVATE_BUCKETS.includes(bucket)) return;
        const key = decodeURIComponent(id);
        const stamp = Number(node.at) || 0;
        if (settled.get(bucket + '/' + id) === stamp) return;

        let record;
        if (node.del) {
            record = bucket === 'playlists' ? { id: key, deletedAt: stamp } : { key, deletedAt: stamp };
        } else if (node.d) {
            try {
                record = await decryptRecord(node.d, pair.priv);
            } catch (e) {
                // Written under a different key, or corrupt: skip it rather than
                // letting one bad record stop the rest of the sync.
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

    /** Reads what changed on the instance since the last look (with some overlap). */
    async function pull() {
        if (!running) return;
        try {
            const { records } = await call('GET', undefined, `?since=${Math.max(0, cursor - PULL_OVERLAP_MS)}`);
            for (const r of records || []) {
                await applyRemote(r.bucket, r.id, r);
                cursor = Math.max(cursor, Number(r.at) || 0);
            }
            status.connected = true;
            status.lastError = null;
        } catch (e) {
            status.connected = false;
            status.lastError = e.message;
        }
        report();
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
                if (settled.get(bucket + '/' + id) !== stamp) changes.push({ bucket, id, record, stamp });
            });
        });
        return changes;
    }

    /** Public playlists are republished in the clear; unpublishing tombstones the shared copy. */
    function pendingShared() {
        const state = Library.readState();
        const changes = [];
        for (const id of Object.keys(state.playlists || {})) {
            const pl = state.playlists[id];
            const wanted = !!(pl && pl.isPublic && !pl.deletedAt);
            const stamp = stampOf(pl);
            const marker = 'shared/' + id;
            if (settled.get(marker) === (wanted ? stamp : -stamp)) continue;
            changes.push({
                marker, wanted, stamp,
                record: wanted
                    ? { bucket: 'shared', id, d: sharedPayload(pl, alias), at: stamp, del: 0 }
                    : { bucket: 'shared', id, d: '', at: stamp, del: 1 }
            });
        }
        return changes;
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
            const shared = pendingShared();
            status.pending = changes.length + shared.length;
            report();
            const batches = [];
            for (let i = 0; i < changes.length; i += RECORDS_PER_PUT) batches.push(changes.slice(i, i + RECORDS_PER_PUT));
            for (let i = 0; i < shared.length; i += RECORDS_PER_PUT) batches.push(shared.slice(i, i + RECORDS_PER_PUT));
            for (const batch of batches) {
                if (!running) break;
                const records = await Promise.all(batch.map(async (c) => c.marker
                    ? c.record
                    : {
                        bucket: c.bucket, id: c.id, at: c.stamp,
                        ...(c.record.deletedAt ? { d: '', del: 1 } : { d: await encryptRecord(c.record, pair.priv), del: 0 })
                    }));
                await call('PUT', { records });
                batch.forEach((c) => (c.marker ? settled.set(c.marker, c.wanted ? c.stamp : -c.stamp) : markSettled(c.bucket, c.id, c.stamp)));
                status.pushed += batch.length;
                status.pending -= batch.length;
                status.connected = true;
                status.lastError = null;
                report();
            }
        } catch (e) {
            stalled = true;
            status.connected = false;
            status.lastError = e.message;
        } finally {
            pushing = false;
            status.pending = pendingChanges().length + pendingShared().length;
            status.mirrored = countLiveItems();
            report();
        }
        // Nothing is marked settled on a failure, so the next attempt simply
        // finds the same work waiting.
        if (stalled && running) setTimeout(() => { if (running) pushOnce(); }, RETRY_MS);
        else if (pushQueued) { pushQueued = false; schedulePush(); }
    }

    function schedulePush() {
        clearTimeout(pushTimer);
        pushTimer = setTimeout(() => {
            pushOnce().catch((e) => { status.lastError = e.message; report(); });
        }, PUSH_DEBOUNCE_MS);
    }

    function onVisible() {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') pull();
    }

    function start() {
        if (running) return handle;
        running = true;
        status.enabled = true;
        status.mirrored = countLiveItems();
        unsubscribeLibrary = Library.subscribe(schedulePush);
        // Read before writing, so a device that was offline merges instead of racing.
        pull().then(schedulePush);
        pollTimer = setInterval(pull, POLL_MS);
        if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
        report();
        return handle;
    }

    function stop() {
        running = false;
        status.enabled = false;
        status.connected = false;
        clearTimeout(pushTimer);
        clearInterval(pollTimer);
        if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
        if (unsubscribeLibrary) unsubscribeLibrary();
        unsubscribeLibrary = null;
        report();
        return handle;
    }

    const handle = {
        start,
        stop,
        /** Entry point for one incoming record; see applyRemote. */
        receive: (bucket, id, node) => applyRemote(bucket, id, node),
        /** Reads from the instance now instead of waiting for the next poll. */
        pull,
        /** Forces a push now instead of waiting out the debounce. */
        flush: () => pushOnce(),
        status: () => Object.assign({}, status),
        shareTokenFor: (id) => shareToken(pair.pub, id, base)
    };
    return handle;
}
