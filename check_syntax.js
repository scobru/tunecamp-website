const test1 = (relGrid, allReleases, escapeHtml) => {
    setHtml(relGrid, allReleases.map(rel => `
        <a href="${escapeHtml(rel.linkUrl)}" target="_blank" rel="noopener" class="p-4 bg-white/5 border border-white/10 rounded-xl flex items-center gap-4 hover:border-primary/40 hover:bg-white/[0.07] transition-all group">
            <div class="w-12 h-12 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
                ${rel.coverUrl ? `<img src="${escapeHtml(rel.coverUrl)}" alt="${escapeHtml(rel.title || '')}" class="w-full h-full object-cover" />` : `<i class="fa-solid fa-compact-disc text-amber-400 text-xl"></i>`}
            </div>
            <div class="min-w-0 flex-1">
                <div class="font-bold text-sm text-white truncate group-hover:text-primary transition-colors">${escapeHtml(rel.title || 'Untitled Release')}</div>
                <div class="text-xs text-text-muted truncate">${escapeHtml(rel.artist || rel.localUsername)}</div>
                <div class="flex items-center gap-2 text-[10px] text-primary/80 font-mono mt-1">
                    <span><i class="fa-solid fa-arrow-up-right-from-square text-[9px]"></i> ${escapeHtml(rel.instanceDomain)} (@${escapeHtml(rel.localUsername)})</span>
                    ${rel.type ? '<span class="px-1.5 py-0.5 rounded bg-white/10 text-white/70">' + escapeHtml(rel.type) + '</span>' : ''}
                </div>
            </div>
        </a>
    `).join(''));
};
