export function playNextTrack(filteredTracks, isShuffle, currentTrackIndex, playTrackIndex) {
    if (filteredTracks.length === 0) return;
    let next = isShuffle ? Math.floor(Math.random() * filteredTracks.length) : currentTrackIndex + 1;
    if (next >= filteredTracks.length) next = 0;
    playTrackIndex(next);
}

export function playPrevTrack(filteredTracks, audio, currentTrackIndex, playTrackIndex) {
    if (filteredTracks.length === 0) return;
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    let prev = currentTrackIndex - 1;
    if (prev < 0) prev = filteredTracks.length - 1;
    playTrackIndex(prev);
}
