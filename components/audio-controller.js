export function getNextTrackIndex(filteredTracks, currentTrackIndex, isShuffle) {
    if (filteredTracks.length === 0) return null;
    let next = isShuffle ? Math.floor(Math.random() * filteredTracks.length) : currentTrackIndex + 1;
    if (next >= filteredTracks.length) next = 0;
    return next;
}

export function getPrevTrackIndex(filteredTracks, currentTrackIndex, currentTime) {
    if (filteredTracks.length === 0) return null;
    if (currentTime > 3) return -1;
    let prev = currentTrackIndex - 1;
    if (prev < 0) prev = filteredTracks.length - 1;
    return prev;
}

export function toggleAudioPlayback(audio, isPlaying, currentTrackIndex, filteredTracks, playTrackIndexCb) {
    if (currentTrackIndex === -1 && filteredTracks.length > 0) {
        playTrackIndexCb(0);
        return;
    }
    if (isPlaying) {
        audio.pause();
    } else {
        audio.play().catch(() => {});
    }
}
