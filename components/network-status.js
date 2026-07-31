window.setNetworkStatus = function(state) {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    if (!dot || !text) return;

    dot.style.background = '';
    dot.style.boxShadow = '';

    if (state === 'live') {
        dot.className = 'w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]';
        text.textContent = 'Network Live';
    } else if (state === 'connecting') {
        dot.className = 'w-2 h-2 rounded-full bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.8)]';
        text.textContent = 'Connecting...';
    } else {
        dot.className = 'w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]';
        text.textContent = 'Offline';
    }
};
