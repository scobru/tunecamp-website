function formatTime(s) {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const se = Math.floor(s % 60);
    return `${m}:${se.toString().padStart(2,'0')}`;
}
