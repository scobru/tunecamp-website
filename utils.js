function escapeHtml(s) {
    return s ? String(s).replace(/[&<>"']/g, function(m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[m];
    }) : '';
}

function sanitizeUrl(urlStr, allowData = false) {
    if (!urlStr) return '#';
    try {
        const u = new URL(urlStr, window.location.origin);
        if (['javascript:', 'vbscript:'].includes(u.protocol)) return '#';
        if (!allowData && u.protocol === 'data:') return '#';
        return urlStr;
    } catch (e) {
        return '#';
    }
}
