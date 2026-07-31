export function setupAudioPlayer(options) {
    const {
        audio,
        getState,
        setState,
        updateProgress,
        updateDuration,
        playNext,
        updatePlayButton,
        togglePlay,
        playPrev,
        onErrorCallback,
        onPlayCallback,
        onPauseCallback
    } = options;

    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', () => {
        if (getState().isRepeat) {
            audio.currentTime = 0;
            audio.play();
        } else {
            playNext();
        }
    });

    audio.addEventListener('play', () => {
        setState({ isPlaying: true });
        updatePlayButton();
        if (onPlayCallback) onPlayCallback();
    });

    audio.addEventListener('pause', () => {
        setState({ isPlaying: false });
        updatePlayButton();
        if (onPauseCallback) onPauseCallback();
    });

    audio.addEventListener('error', () => {
        setState({ isPlaying: false });
        updatePlayButton();
        if (onErrorCallback) onErrorCallback();
    });

    const playBtn = document.getElementById('playBtn');
    if (playBtn) playBtn.addEventListener('click', togglePlay);

    const prevBtn = document.getElementById('prevBtn');
    if (prevBtn) prevBtn.addEventListener('click', playPrev);

    const nextBtn = document.getElementById('nextBtn');
    if (nextBtn) nextBtn.addEventListener('click', playNext);

    const toggleShuffle = document.getElementById('toggleShuffle');
    if (toggleShuffle) {
        toggleShuffle.addEventListener('click', (e) => {
            const newIsShuffle = !getState().isShuffle;
            setState({ isShuffle: newIsShuffle });
            e.currentTarget.style.color = newIsShuffle ? 'oklch(65% 0.28 290)' : '';
        });
    }

    const toggleRepeat = document.getElementById('toggleRepeat');
    if (toggleRepeat) {
        toggleRepeat.addEventListener('click', (e) => {
            const newIsRepeat = !getState().isRepeat;
            setState({ isRepeat: newIsRepeat });
            e.currentTarget.style.color = newIsRepeat ? 'oklch(65% 0.28 290)' : '';
        });
    }

    const vol = document.getElementById('volumeSlider');
    if (vol) {
        vol.addEventListener('input', (e) => { audio.volume = e.target.value / 100; });
        audio.volume = vol.value / 100;
    }

    const progressBar = document.getElementById('progressBar');
    if (progressBar) {
        progressBar.addEventListener('click', (e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            if (audio.duration) audio.currentTime = audio.duration * percent;
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.code === 'Space') {
            const active = document.activeElement;
            if (active) {
                const tagName = active.tagName.toLowerCase();
                const role = active.getAttribute('role');
                if (['input', 'textarea', 'button', 'a', 'select'].includes(tagName) ||
                    ['button', 'link', 'menuitem', 'tab'].includes(role) ||
                    active.isContentEditable) {
                    return;
                }
            }
            e.preventDefault();
            togglePlay();
        }
    });
}
