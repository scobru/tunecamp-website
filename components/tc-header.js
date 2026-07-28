class TcHeader extends HTMLElement {
    connectedCallback() {
        const active = this.getAttribute('active') || '';
        const hasSearch = this.hasAttribute('search');

        this.innerHTML = `
        <nav class="sticky top-0 left-0 w-full z-40 bg-black/70 backdrop-blur-lg border-b border-white/10">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-6 justify-between lg:justify-start">
                <a href="index.html" class="flex items-center gap-2 font-display font-bold text-lg shrink-0">
                    <img src="tunecamp.svg" alt="TuneCamp" class="w-7 h-7" />
                    <span class="text-white font-display">TuneCamp</span>
                </a>
                
                ${hasSearch ? `
                <div class="relative flex-1 max-w-md hidden lg:block">
                    <i class="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-text-muted text-sm"></i>
                    <!-- ⚡ Bolt Performance Optimization: Debounce search input to prevent rapid full DOM rebuilds via innerHTML blocking the main thread -->
                    <input type="text" id="searchInput" aria-label="Search tracks and artists" placeholder="Search tracks and artists" oninput="clearTimeout(this.filterTimeout); this.filterTimeout = setTimeout(() => { if(typeof filterTracks==='function') filterTracks(false) }, 300)"
                        class="w-full bg-white/5 border border-white/10 rounded-full py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-primary/50 placeholder-text-muted" />
                </div>
                ` : ''}

                <div class="hidden lg:flex items-center gap-5 text-sm font-medium ml-auto">
                    <a href="index.html" class="${active === 'index' ? 'text-primary font-semibold' : 'text-text-muted hover:text-white transition-colors'}">Explore</a>
                    <a href="about.html" class="${active === 'about' ? 'text-primary font-semibold' : 'text-text-muted hover:text-white transition-colors'}">Overview</a>
                    <a href="ecosystem.html" class="${active === 'ecosystem' ? 'text-primary font-semibold' : 'text-text-muted hover:text-white transition-colors'}">Ecosystem</a>
                    <a href="run.html" class="${active === 'run' ? 'text-primary font-semibold' : 'text-text-muted hover:text-white transition-colors'}">Run Instance</a>
                    <a href="profile.html" class="${active === 'profile' ? 'text-primary font-semibold flex items-center gap-1.5' : 'text-text-muted hover:text-white transition-colors flex items-center gap-1.5'}">
                        <i class="fa-solid fa-shield-halved text-xs"></i> Identity
                    </a>
                    
                    <div class="relative" id="tcHeaderMoreContainer">
                        <button id="tcHeaderMoreBtn" type="button" class="text-text-muted hover:text-white transition-colors flex items-center gap-1">
                            More <i class="fas fa-chevron-down text-[10px]"></i>
                        </button>
                        <div id="tcHeaderMoreMenu" class="hidden absolute right-0 top-full mt-2 w-44 bg-black/95 backdrop-blur-lg border border-white/10 rounded-xl py-1 z-50 shadow-xl">
                            <a href="graphofone.html" class="block px-4 py-2 text-xs ${active === 'graphofone' ? 'text-primary font-semibold' : 'text-text-muted hover:text-white hover:bg-white/5'}">Graphofone</a>
                            <a href="sidecamp.html" class="block px-4 py-2 text-xs ${active === 'sidecamp' ? 'text-primary font-semibold' : 'text-text-muted hover:text-white hover:bg-white/5'}">Sidecamp</a>
                            <a href="network-graph.html" class="block px-4 py-2 text-xs ${active === 'network-graph' ? 'text-primary font-semibold' : 'text-text-muted hover:text-white hover:bg-white/5'}">Network Graph</a>
                            <a href="player.html" class="block px-4 py-2 text-xs ${active === 'player' ? 'text-primary font-semibold' : 'text-text-muted hover:text-white hover:bg-white/5'}">Player</a>
                            <a href="samples.html" class="block px-4 py-2 text-xs ${active === 'samples' ? 'text-primary font-semibold' : 'text-text-muted hover:text-white hover:bg-white/5'}">Samples</a>
                            <a href="usecases.html" class="block px-4 py-2 text-xs ${active === 'usecases' ? 'text-primary font-semibold' : 'text-text-muted hover:text-white hover:bg-white/5'}">Use Cases</a>
                            <a href="manifesto.html" class="block px-4 py-2 text-xs ${active === 'manifesto' ? 'text-primary font-semibold' : 'text-text-muted hover:text-white hover:bg-white/5'}">Manifesto</a>
                            <a href="press.html" class="block px-4 py-2 text-xs ${active === 'press' ? 'text-primary font-semibold' : 'text-text-muted hover:text-white hover:bg-white/5'}">Press Kit</a>
                            <a href="legal.html" class="block px-4 py-2 text-xs ${active === 'legal' ? 'text-primary font-semibold' : 'text-text-muted hover:text-white hover:bg-white/5'}">Legal</a>
                        </div>
                    </div>

                    <a href="https://scobru.github.io/tunecamp/" target="_blank" rel="noopener" class="text-text-muted hover:text-white transition-colors">Docs</a>
                    <a href="https://github.com/scobru/tunecamp" target="_blank" rel="noopener" class="text-text-muted hover:text-white transition-colors"><i class="fab fa-github"></i></a>
                    <button type="button" onclick="if(typeof toggleTheme==='function') toggleTheme()" aria-label="Toggle theme" class="text-text-muted hover:text-white transition-colors w-8 h-8 flex items-center justify-center">
                        <i data-theme-icon class="fas fa-sun text-sm"></i>
                    </button>
                </div>

                <button type="button" id="tcMobileNavToggle" aria-label="Toggle mobile menu" class="lg:hidden text-text-muted hover:text-white p-2">
                    <i class="fas fa-bars text-lg"></i>
                </button>
            </div>

            <div id="tcMobileMenu" class="hidden lg:hidden border-t border-white/10 bg-black/95 px-4 py-3 space-y-2">
                <a href="index.html" class="block py-2 text-sm ${active === 'index' ? 'text-primary font-semibold' : 'text-text-muted'}">Explore</a>
                <a href="about.html" class="block py-2 text-sm ${active === 'about' ? 'text-primary font-semibold' : 'text-text-muted'}">Overview</a>
                <a href="ecosystem.html" class="block py-2 text-sm ${active === 'ecosystem' ? 'text-primary font-semibold' : 'text-text-muted'}">Ecosystem</a>
                <a href="run.html" class="block py-2 text-sm ${active === 'run' ? 'text-primary font-semibold' : 'text-text-muted'}">Run Instance</a>
                <a href="profile.html" class="block py-2 text-sm ${active === 'profile' ? 'text-primary font-semibold' : 'text-text-muted'}"><i class="fa-solid fa-shield-halved text-xs"></i> Identity</a>
                <a href="graphofone.html" class="block py-2 text-sm ${active === 'graphofone' ? 'text-primary font-semibold' : 'text-text-muted'}">Graphofone</a>
                <a href="sidecamp.html" class="block py-2 text-sm ${active === 'sidecamp' ? 'text-primary font-semibold' : 'text-text-muted'}">Sidecamp</a>
                <a href="network-graph.html" class="block py-2 text-sm ${active === 'network-graph' ? 'text-primary font-semibold' : 'text-text-muted'}">Network Graph</a>
                <a href="player.html" class="block py-2 text-sm ${active === 'player' ? 'text-primary font-semibold' : 'text-text-muted'}">Player</a>
                <a href="samples.html" class="block py-2 text-sm ${active === 'samples' ? 'text-primary font-semibold' : 'text-text-muted'}">Samples</a>
                <a href="usecases.html" class="block py-2 text-sm ${active === 'usecases' ? 'text-primary font-semibold' : 'text-text-muted'}">Use Cases</a>
                <a href="manifesto.html" class="block py-2 text-sm ${active === 'manifesto' ? 'text-primary font-semibold' : 'text-text-muted'}">Manifesto</a>
                <a href="press.html" class="block py-2 text-sm ${active === 'press' ? 'text-primary font-semibold' : 'text-text-muted'}">Press Kit</a>
                <a href="legal.html" class="block py-2 text-sm ${active === 'legal' ? 'text-primary font-semibold' : 'text-text-muted'}">Legal</a>
                <div class="pt-2 border-t border-white/10 flex items-center justify-between">
                    <a href="https://scobru.github.io/tunecamp/" target="_blank" rel="noopener" class="text-xs text-text-muted">Docs</a>
                    <a href="https://github.com/scobru/tunecamp" target="_blank" rel="noopener" class="text-xs text-text-muted"><i class="fab fa-github"></i> GitHub</a>
                </div>
            </div>
        </nav>
        `;

        const moreBtn = this.querySelector('#tcHeaderMoreBtn');
        const moreMenu = this.querySelector('#tcHeaderMoreMenu');
        if (moreBtn && moreMenu) {
            moreBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                moreMenu.classList.toggle('hidden');
            });
            document.addEventListener('click', (e) => {
                if (!moreMenu.contains(e.target) && e.target !== moreBtn) {
                    moreMenu.classList.add('hidden');
                }
            });
        }

        const mobileBtn = this.querySelector('#tcMobileNavToggle');
        const mobileMenu = this.querySelector('#tcMobileMenu');
        if (mobileBtn && mobileMenu) {
            mobileBtn.addEventListener('click', () => {
                mobileMenu.classList.toggle('hidden');
            });
        }
    }
}

customElements.define('tc-header', TcHeader);
