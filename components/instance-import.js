/**
 * Import what a listener already starred on their own TuneCamp instances.
 *
 * The Profile page links instances to a FID identity and stores the passports
 * in localStorage; each instance then exposes that account's public activity at
 * `/api/auth/zen/user/<username>/public` — no session needed, wildcard CORS, so
 * the player can read it directly. Track likes found there become favourites in
 * the local library.
 *
 * Two limits come from the instance side, not from here:
 *
 *   - the public payload returns the 20 most recent starred items;
 *   - a public playlist's tracks come from `GET /api/playlists/:id/public`,
 *     which older instances do not have — `GET /api/playlists/:id` is
 *     members-only, so on those the playlist is reported as found but not
 *     readable rather than silently skipped.
 *
 * Album likes are reported and skipped: the library is a library of tracks, and
 * silently exploding an album into a dozen separate hearts would misrepresent
 * what the listener actually starred.
 */

import * as Library from './library.js';

const REQUEST_TIMEOUT_MS = 12000;

/**
 * The instances the Profile page has linked, from either of the two stores it
 * writes (the link flow uses one, the FID portal the other). profile.html keeps
 * its own copy of this merge because it also tags entries for its Zen sync;
 * this reader only needs somewhere to fetch from.
 */
export function readLinkedInstances() {
    const read = (key) => {
        try {
            const parsed = JSON.parse(localStorage.getItem(key) || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    };

    const identity = (() => {
        try {
            return JSON.parse(localStorage.getItem('tunecamp_zen_user') || 'null');
        } catch (e) {
            return null;
        }
    })();

    const seen = new Set();
    return read('tunecamp_linked_instances').concat(read('fid_registry')).reduce((list, entry) => {
        if (!entry) return list;
        const domain = entry.instanceDomain || entry.instanceUrl;
        const username = entry.localUsername || entry.username || (identity && identity.alias) || '';
        if (!domain || !username) return list;
        const host = String(domain).replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        const key = `${host}::${username}`;
        if (seen.has(key)) return list;
        seen.add(key);
        list.push({ domain: host, username, baseUrl: `https://${host}` });
        return list;
    }, []);
}

function toAbsolute(url, baseUrl) {
    if (!url) return '';
    if (/^(https?:|data:|blob:)/.test(url)) return url;
    return baseUrl.replace(/\/+$/, '') + (url.startsWith('/') ? url : '/' + url);
}

/**
 * Turns one public "like" row into the track shape the library stores. The
 * stream URL is the instance's own; resolveAgainstNetwork() upgrades it to a
 * live copy when the aggregated catalog has one.
 */
export function likeToTrack(like, instance) {
    if (!like || like.type !== 'track') return null;
    const title = like.track_title || like.title;
    const artistName = like.track_artist || like.artist;
    if (!title || !artistName) return null;
    return {
        id: like.id,
        title,
        artistName,
        releaseTitle: like.album_title || '',
        coverUrl: toAbsolute(like.album_cover, instance.baseUrl),
        audioUrl: `${instance.baseUrl}/api/tracks/${like.id}/stream`,
        duration: like.duration || 0,
        siteUrl: instance.baseUrl
    };
}

/**
 * Prefers the copy the player already found on the network: it is the one known
 * to be reachable, and it carries the duration and cover the public likes
 * payload leaves out.
 */
export function resolveAgainstNetwork(track, liveIndex) {
    if (!liveIndex) return track;
    const live = liveIndex.get(Library.trackKey(track));
    return live || track;
}

async function fetchJson(url) {
    const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

/** Turns one row of a public playlist into the track shape the library stores. */
export function playlistTrackToTrack(row, instance) {
    if (!row || !row.title) return null;
    return {
        id: row.id,
        title: row.title,
        artistName: row.artistName || 'Unknown Artist',
        releaseTitle: row.albumTitle || '',
        coverUrl: toAbsolute(row.coverUrl, instance.baseUrl),
        audioUrl: toAbsolute(row.streamUrl || `/api/tracks/${row.id}/stream`, instance.baseUrl),
        duration: row.duration || 0,
        siteUrl: instance.baseUrl
    };
}

/** Reads one instance's public activity for the linked account. */
export async function fetchInstanceActivity(instance, { fetchImpl } = {}) {
    const get = fetchImpl || fetchJson;
    const data = await get(`${instance.baseUrl}/api/auth/zen/user/${encodeURIComponent(instance.username)}/public`);
    return {
        likes: Array.isArray(data && data.publicLikes) ? data.publicLikes : [],
        playlists: Array.isArray(data && data.publicPlaylists) ? data.publicPlaylists : []
    };
}

/**
 * Copies one public playlist into the library, or tops up the copy a previous
 * run made. Never destructive: a track the listener removed from their copy
 * comes back, but nothing they added is lost.
 */
async function importPlaylist(instance, entry, { liveIndex, fetchImpl }) {
    const get = fetchImpl || fetchJson;
    const remote = await get(`${instance.baseUrl}/api/playlists/${encodeURIComponent(entry.id)}/public`);
    const rows = Array.isArray(remote && remote.tracks) ? remote.tracks : [];
    if (!rows.length) return { added: 0, created: false };

    const origin = `${instance.domain}/${entry.id}`;
    let playlist = Library.findPlaylistByOrigin(origin);
    const created = !playlist;
    if (!playlist) {
        playlist = Library.createPlaylist(remote.name || entry.name || 'Imported playlist', {
            importedFrom: origin,
            importedOwner: remote.username || instance.username
        });
    }

    let added = 0;
    for (const row of rows) {
        const track = playlistTrackToTrack(row, instance);
        if (!track) continue;
        if (Library.addToPlaylist(playlist.id, resolveAgainstNetwork(track, liveIndex))) added++;
    }
    return { added, created };
}

/**
 * Imports every linked instance's track likes, and the tracks of any public
 * playlist the instance is new enough to expose. Idempotent: running it again
 * re-adds nothing, because favourites are keyed by what the track *is* and
 * imported playlists carry where they came from.
 */
export async function importFrom(instances, { liveIndex, fetchImpl, includePlaylists = true } = {}) {
    const summary = {
        added: 0, alreadyThere: 0, albums: 0,
        playlists: 0, playlistTracks: 0, playlistsUnavailable: 0,
        instances: []
    };

    for (const instance of instances) {
        const result = {
            domain: instance.domain, username: instance.username,
            added: 0, alreadyThere: 0, albums: 0,
            playlists: 0, playlistTracks: 0, playlistsUnavailable: 0,
            error: null
        };
        try {
            const { likes, playlists } = await fetchInstanceActivity(instance, { fetchImpl });

            for (const like of likes) {
                if (like && like.type !== 'track') { result.albums++; continue; }
                const track = likeToTrack(like, instance);
                if (!track) { result.albums++; continue; }
                if (Library.addFavorite(resolveAgainstNetwork(track, liveIndex))) result.added++;
                else result.alreadyThere++;
            }

            if (includePlaylists) {
                for (const entry of playlists) {
                    try {
                        const outcome = await importPlaylist(instance, entry, { liveIndex, fetchImpl });
                        result.playlists++;
                        result.playlistTracks += outcome.added;
                    } catch (e) {
                        // An instance without the anonymous read answers 404 here:
                        // the playlist exists but cannot be fetched, which is worth
                        // saying rather than passing over in silence.
                        result.playlistsUnavailable++;
                    }
                }
            }
        } catch (e) {
            result.error = e.name === 'TimeoutError' ? 'did not answer in time' : e.message;
        }
        ['added', 'alreadyThere', 'albums', 'playlists', 'playlistTracks', 'playlistsUnavailable']
            .forEach((k) => { summary[k] += result[k]; });
        summary.instances.push(result);
    }

    return summary;
}

/** One line summing up a run, for the menu. */
export function describeImport(summary) {
    if (!summary.instances.length) return 'No linked instances to import from.';
    const failed = summary.instances.filter((i) => i.error);
    const parts = [];
    if (summary.added) parts.push(`${summary.added} favourite${summary.added === 1 ? '' : 's'} imported`);
    if (summary.alreadyThere) parts.push(`${summary.alreadyThere} already saved`);
    if (!summary.added && !summary.alreadyThere) parts.push('nothing to import');
    if (summary.albums) parts.push(`${summary.albums} album like${summary.albums === 1 ? '' : 's'} skipped`);
    if (summary.playlists) {
        parts.push(`${summary.playlists} playlist${summary.playlists === 1 ? '' : 's'} imported`
            + (summary.playlistTracks ? ` (${summary.playlistTracks} tracks)` : ''));
    }
    if (summary.playlistsUnavailable) {
        parts.push(`${summary.playlistsUnavailable} playlist${summary.playlistsUnavailable === 1 ? '' : 's'} not readable on that instance`);
    }
    if (failed.length) parts.push(`${failed.length} instance${failed.length === 1 ? '' : 's'} unreachable`);
    return parts.join(' · ');
}
