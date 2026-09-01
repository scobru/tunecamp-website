/**
 * Play queue — the list that is *playing*, kept apart from the list that is
 * *shown*.
 *
 * The player used to index straight into `filteredTracks`, so typing in the
 * search box or switching the artist dropdown mid-song silently rewrote what
 * would play next. With favourites, playlists and per-artist views that gets
 * worse: "play this playlist" has to keep playing the playlist even while the
 * listener browses the network tab.
 *
 * A queue therefore owns its own copy of the tracks plus the context they came
 * from, and the visible list only feeds it when the listener actually starts
 * something.
 */

import { getNextTrackIndex, getPrevTrackIndex } from './audio-controller.js';

/** Fisher-Yates over the remaining positions: shuffle plays each track once. */
function shuffledOrder(length, startIndex) {
    const order = [];
    for (let i = 0; i < length; i++) if (i !== startIndex) order.push(i);
    for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = order[i];
        order[i] = order[j];
        order[j] = tmp;
    }
    return order;
}

export class PlayQueue {
    constructor() {
        this.tracks = [];
        this.index = -1;
        /** {type, id, label} — 'network' | 'favorites' | 'playlist' | 'artist' | 'recents' */
        this.source = { type: 'network', id: null, label: 'Network' };
        this.shuffle = false;
        this._bag = [];
    }

    get current() {
        return this.index >= 0 && this.index < this.tracks.length ? this.tracks[this.index] : null;
    }

    get length() {
        return this.tracks.length;
    }

    isEmpty() {
        return this.tracks.length === 0;
    }

    /** Replaces the queue wholesale — a new play context. */
    set(tracks, source, startIndex) {
        this.tracks = Array.isArray(tracks) ? tracks.slice() : [];
        this.source = source || this.source;
        this.index = typeof startIndex === 'number' ? startIndex : -1;
        this._refillBag();
        return this.current;
    }

    /** Moves within the current queue without changing its context. */
    jumpTo(index) {
        if (index < 0 || index >= this.tracks.length) return null;
        this.index = index;
        this._dropFromBag(index);
        return this.current;
    }

    setShuffle(on) {
        this.shuffle = !!on;
        this._refillBag();
    }

    next() {
        if (this.tracks.length === 0) return null;
        if (this.shuffle) {
            if (this._bag.length === 0) this._refillBag();
            const nextIndex = this._bag.shift();
            if (nextIndex == null) return null;
            this.index = nextIndex;
            return this.current;
        }
        const seq = getNextTrackIndex(this.tracks, this.index, false);
        if (seq == null) return null;
        this.index = seq;
        return this.current;
    }

    /**
     * Restarts the current track when it is more than a few seconds in, matching
     * every other player; returns null in that case so the caller only seeks.
     */
    prev(currentTime) {
        if (this.tracks.length === 0) return null;
        const prevIndex = getPrevTrackIndex(this.tracks, this.index, currentTime);
        if (prevIndex === -1 || prevIndex == null) return null;
        this.index = prevIndex;
        this._dropFromBag(prevIndex);
        return this.current;
    }

    /**
     * Keeps the queue pointing at the same song after the catalog reloads with
     * fresher copies. Matching is by key so a track that moved instance still
     * counts as the same one.
     */
    remap(tracks, keyOf) {
        const playing = this.current;
        const playingKey = playing ? keyOf(playing) : null;
        this.tracks = Array.isArray(tracks) ? tracks.slice() : [];
        this.index = playingKey == null
            ? -1
            : this.tracks.findIndex((t) => keyOf(t) === playingKey);
        this._refillBag();
        return this.current;
    }

    _refillBag() {
        this._bag = this.shuffle ? shuffledOrder(this.tracks.length, this.index) : [];
    }

    _dropFromBag(index) {
        if (this._bag.length) this._bag = this._bag.filter((i) => i !== index);
    }
}
