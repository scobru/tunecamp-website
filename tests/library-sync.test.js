/**
 * Tests for components/library-sync.js against an in-process stand-in for the
 * TuneCamp server's /api/auth/zen/library routes (same contract: signed
 * requests, last write wins by `at`, tombstones, public shared playlists).
 *
 *     node --experimental-default-type=module tests/library-sync.test.js
 *
 * Two "devices" are the same process with the library reset in between, which
 * is what a second browser looks like to the sync layer.
 */
import crypto from 'node:crypto';

const store = new Map();
globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
};
globalThis.window = { addEventListener() {} };

const Library = await import('../components/library.js');
const Sync = await import('../components/library-sync.js');
const { generatePair, deriveMasterPair } = await import('../vendor/identity.js');

let passed = 0;
function ok(cond, msg) { if (!cond) throw new Error('FAIL: ' + msg); passed++; }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** The server's contract, minimal: verifies X-Fid-Auth exactly like routes/auth/library.ts. */
function fakeInstance({ accounts }) {
    const rows = new Map(); // pub/bucket/id -> { d, at, del }
    const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
    const fetchImpl = async (url, init = {}) => {
        const u = new URL(url);
        const method = init.method || 'GET';
        const m = u.pathname.match(/^\/api\/auth\/zen\/library\/([^/]+)(?:\/(shared|account)(?:\/(.+))?)?$/);
        if (!m) return json(404, { error: 'Not found' });
        const [, pub, sub, rest] = m;
        if (sub === 'account') return accounts.has(pub) ? json(200, { username: accounts.get(pub) }) : json(404, {});
        if (sub === 'shared') {
            const row = rows.get(`${pub}/shared/${decodeURIComponent(rest)}`);
            return row && !row.del ? json(200, { ...JSON.parse(row.d), at: row.at }) : json(404, {});
        }
        const [ts, sig] = String((init.headers || {})['X-Fid-Auth'] || '').split('.');
        const body = init.body || '';
        const hash = crypto.createHash('sha256').update(body).digest('hex');
        const payload = `fid-library:${method}:${u.pathname}:${ts}:${hash}`;
        const key = crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: pub }, format: 'jwk' });
        if (!sig || !crypto.verify(null, Buffer.from(payload), key, Buffer.from(sig, 'base64url'))) return json(401, { error: 'Invalid signature' });
        if (!accounts.has(pub)) return json(403, { error: 'This identity is not linked to an account on this instance' });
        if (method === 'GET') {
            const since = Number(u.searchParams.get('since')) || 0;
            const records = [...rows].filter(([k, r]) => k.startsWith(pub + '/') && r.at > since)
                .map(([k, r]) => ({ bucket: k.split('/')[1], id: k.split('/').slice(2).join('/'), ...r }));
            return json(200, { records });
        }
        for (const r of JSON.parse(body).records) {
            const k = `${pub}/${r.bucket}/${r.id}`;
            const old = rows.get(k);
            if (!old || r.at > old.at) rows.set(k, { d: r.del ? '' : r.d, at: r.at, del: r.del });
        }
        return json(200, { ok: true });
    };
    return { fetchImpl, rows };
}

const track = (n) => ({ id: n, title: `Song ${n}`, artistName: 'Nina K', siteUrl: 'https://a.test', audioUrl: 'https://a.test/s.mp3' });
const INSTANCE = 'https://sudorecords.test';
const identityOf = (pair) => ({ alias: 'alice', pair });

// --- crypto ---------------------------------------------------------------
const pairA = await deriveMasterPair('alice', 'correct horse battery staple');
const pairOther = await generatePair();
const sealed = await Sync.encryptRecord({ key: 'k', title: 'secret' }, pairA.priv);
ok(!sealed.includes('secret'), 'ciphertext does not contain the plaintext');
ok((await Sync.decryptRecord(sealed, pairA.priv)).title === 'secret', 'decrypts under the same key');
let refused = false;
try { await Sync.decryptRecord(sealed, pairOther.priv); } catch (e) { refused = true; }
ok(refused, 'another key cannot read it');
ok((await Sync.encryptRecord({ a: 1 }, pairA.priv)) !== (await Sync.encryptRecord({ a: 1 }, pairA.priv)), 'every encryption uses a fresh IV');

// --- share links ----------------------------------------------------------
const token = Sync.shareToken(pairA.pub, 'id.with.dots', 'https://sudorecords.test:8443');
const parsed = Sync.parseShareToken(token);
ok(parsed && parsed.pub === pairA.pub && parsed.id === 'id.with.dots' && parsed.instance === 'https://sudorecords.test:8443', 'share token round-trips, dots in the id and a port included');
ok(Sync.parseShareToken('garbage') === null && Sync.parseShareToken(`${pairA.pub}.x@`) === null, 'malformed tokens are refused');
ok(Sync.parseShareToken(`${pairA.pub}.x@evil.test/path`) === null, 'a host with a path is refused');

// --- instance lookup ------------------------------------------------------
store.set('tunecamp_linked_instances', JSON.stringify([{ instanceDomain: 'sudorecords.test', localUsername: 'alice' }]));
ok(Sync.readInstance() === INSTANCE, 'the instance comes from the first linked passport');
store.delete('tunecamp_linked_instances');
ok(Sync.readInstance() === null, 'nothing linked, nothing discovered: no instance');
const server = fakeInstance({ accounts: new Map([[pairA.pub, 'alice']]) });
ok(await Sync.discoverInstance({ pub: pairA.pub, directory: ['https://other.test', INSTANCE], fetchImpl: async (u, i) => u.startsWith(INSTANCE) ? server.fetchImpl(u, i) : { ok: false, status: 404 } }) === INSTANCE, 'a new device finds the instance that holds its account');
ok(await Sync.discoverInstance({ pub: pairOther.pub, directory: [INSTANCE], fetchImpl: server.fetchImpl }) === null, 'a key with no account anywhere finds nothing');
Sync.rememberInstance(INSTANCE);
ok(Sync.readInstance() === INSTANCE, 'a discovered instance is remembered on this device');

// --- device A pushes, device B pulls ---------------------------------------
Library._resetForTests();
Library.addFavorite(track(1));
Library.addFavorite(track(2));
Library.addArtist('Nina K');
const playlist = Library.createPlaylist('Nightshift');
Library.addToPlaylist(playlist.id, track(1));

const a = Sync.createSync({ instance: INSTANCE, identity: identityOf(pairA), fetchImpl: server.fetchImpl });
a.start();
await wait(100);
await a.flush();
ok(a.status().connected && a.status().pending === 0, 'device A is connected with nothing pending');
ok(a.status().pushed >= 4, 'device A pushed its favorites, artist and playlist: ' + a.status().pushed);
const wire = JSON.stringify([...server.rows.values()]);
ok(!wire.includes('Song 1') && !wire.includes('Nightshift'), 'the instance only ever stores ciphertext for private items');
a.stop();

Library._resetForTests();
ok(Library.listFavorites().length === 0, 'device B starts empty');
const b = Sync.createSync({ instance: INSTANCE, identity: identityOf(pairA), fetchImpl: server.fetchImpl });
b.start();
await wait(100);
await b.pull();
ok(Library.listFavorites().length === 2, 'device B receives both favorites');
ok(Library.listArtists().length === 1 && Library.listPlaylists().length === 1, 'and the artist and the playlist');
ok(Library.listPlaylists()[0].items.length === 1, 'with the playlist contents intact');

// --- deletes travel as tombstones -------------------------------------------
Library.toggleFavorite(track(2));
await wait(50);
await b.flush();
b.stop();
Library._resetForTests();
const c = Sync.createSync({ instance: INSTANCE, identity: identityOf(pairA), fetchImpl: server.fetchImpl });
c.start();
await wait(100);
await c.pull();
ok(Library.listFavorites().length === 1, 'an un-favorited song stays gone on another device');

// --- shared playlists -------------------------------------------------------
const mine = Library.listPlaylists()[0];
Library.setPlaylistPublic(mine.id, true);
await wait(50);
await c.flush();
const shared = await Sync.fetchSharedPlaylist({ instance: INSTANCE, pub: pairA.pub, id: mine.id, fetchImpl: server.fetchImpl });
ok(shared && shared.name === 'Nightshift' && shared.owner === 'alice' && shared.items.length === 1, 'a published playlist opens for anyone');
Library.setPlaylistPublic(mine.id, false);
await wait(50);
await c.flush();
ok(await Sync.fetchSharedPlaylist({ instance: INSTANCE, pub: pairA.pub, id: mine.id, fetchImpl: server.fetchImpl }) === null, 'unpublishing it closes the link');
c.stop();

// --- refusals are reported, not swallowed ------------------------------------
Library._resetForTests();
Library.addFavorite(track(9));
const stranger = Sync.createSync({ instance: INSTANCE, identity: identityOf(pairOther), fetchImpl: server.fetchImpl });
stranger.start();
await wait(100);
await stranger.flush();
ok(!stranger.status().connected && /403/.test(stranger.status().lastError || ''), 'a key with no account here is told so: ' + stranger.status().lastError);
ok(stranger.status().pending > 0, 'its changes stay queued rather than being dropped');
stranger.stop();

console.log(`ok — ${passed} assertions passed`);
process.exit(0);
