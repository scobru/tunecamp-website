
        document.addEventListener('DOMContentLoaded', () => {
            const relay = window.ZEN_RELAY || "wss://delay.scobrudot.dev/zen";
            let zen = null;
            let currentPair = null;

            if (Zen) {
                zen = new Zen({ peers: [relay] });
            }

            const loginForm = document.getElementById('loginForm');
            const aliasInput = document.getElementById('aliasInput');
            const passphraseInput = document.getElementById('passphraseInput');
            const loggedInView = document.getElementById('loggedInView');
            const currentAlias = document.getElementById('currentAlias');
            const currentPubKey = document.getElementById('currentPubKey');
            const logoutBtn = document.getElementById('logoutBtn');
            const copyPubKeyBtn = document.getElementById('copyPubKeyBtn');
            const instancesList = document.getElementById('instancesList');
            const linkInstanceForm = document.getElementById('linkInstanceForm');
            const linkInstanceDomainInput = document.getElementById('linkInstanceDomainInput');
            const linkInstanceArtistInput = document.getElementById('linkInstanceArtistInput');

            // Escape HTML entities to prevent XSS
            function escapeHtml(str) {
                if (str == null) return '';
                return String(str)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');
            }

            function setText(el, text) {
                if (!el) return;
                el.textContent = text;
            }

            function setHtml(el, html) {
                if (!el) return;
                el.innerHTML = html;
            }

            function zenSign(data, priv) {
                return new Promise((resolve, reject) => {
                    Zen.sign(data, { priv }, (out) => {
                        if (typeof out === "string") resolve(out);
                        else reject(new Error("Zen.sign failed"));
                    });
                });
            }

            // Load saved session or check Zen session
            const savedSession = localStorage.getItem('tunecamp_zen_user');
            if (savedSession) {
                try {
                    const parsed = JSON.parse(savedSession);
                    if (parsed.pair) {
                        currentPair = parsed.pair;
                        showLoggedIn(parsed.alias, parsed.pair.pub);
                    }
                } catch (e) { }
            }

            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const alias = aliasInput.value.trim();
                const pass = passphraseInput.value.trim();
                if (!alias || !pass) return;

                const submitBtn = loginForm.querySelector('button[type="submit"]');
                const originalHtml = submitBtn.innerHTML;
                setText(submitBtn, '');
                const icon = document.createElement('i');
                icon.className = 'fas fa-circle-notch fa-spin mr-2';
                submitBtn.appendChild(icon);
                const span = document.createElement('span');
                span.textContent = 'Authenticating...';
                submitBtn.appendChild(span);

                try {
                    if (Zen) {
                        Zen.pair((pair) => {
                            if (pair && pair.pub) {
                                currentPair = pair;
                                saveAndShowUser(alias, pair);
                            } else {
                                alert("Failed to generate identity.");
                            }
                            submitBtn.innerHTML = originalHtml;
                        }, { seed: alias + ':' + pass });
                    } else {
                        throw new Error("Zen SEA library not loaded");
                    }
                } catch (err) {
                    alert('Auth error: ' + err.message);
                    submitBtn.innerHTML = originalHtml;
                }
            });

            function saveAndShowUser(alias, pair) {
                const sessionData = { alias, pair };
                localStorage.setItem('tunecamp_zen_user', JSON.stringify(sessionData));
                showLoggedIn(alias, pair.pub);
            }

            function showLoggedIn(alias, pub) {
                loginForm.classList.add('hidden');
                loggedInView.classList.remove('hidden');
                currentAlias.textContent = '@' + alias;
                currentPubKey.textContent = pub;
                loadLinkedInstances(alias);
            }

            logoutBtn.addEventListener('click', () => {
                localStorage.removeItem('tunecamp_zen_user');
                currentPair = null;
                loginForm.classList.remove('hidden');
                loggedInView.classList.add('hidden');
                instancesList.textContent = '';
            });

            copyPubKeyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(currentPubKey.textContent);
                alert('Zen PubKey copied to clipboard!');
            });

            // Link Instance Flow
            linkInstanceForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const instanceDomain = linkInstanceDomainInput.value.trim();
                const artistName = linkInstanceArtistInput.value.trim();

                if (!instanceDomain) {
                    alert('Inserisci il dominio dell\'istanza (es. sudorecords.scobrudot.dev)');
                    return;
                }

                const identity = getActiveIdentity();
                const privKey = currentPair?.priv || identity?.pair?.priv;
                const pubKey = currentPair?.pub || identity?.pair?.pub;
                const alias = (currentAlias?.textContent?.replace('@', '') || identity?.alias || 'anonymous').toLowerCase();

                if (!privKey || alias === 'anonymous') {
                    alert('Devi prima autenticarti con Zen SEA.');
                    return;
                }

                const submitBtn = linkInstanceForm.querySelector('button[type="submit"]');
                const originalText = submitBtn.textContent;
                setText(submitBtn, '');
                const icon = document.createElement('i');
                icon.className = 'fas fa-circle-notch fa-spin mr-2';
                submitBtn.appendChild(icon);
                const span = document.createElement('span');
                span.textContent = 'Linking...';
                submitBtn.appendChild(span);
                submitBtn.disabled = true;

                try {
                    // Step 1: fetch challenge from instance
                    const challengeRes = await fetch(
                        `https://${instanceDomain}/api/auth/zen/challenge?zenPubKey=${encodeURIComponent(pubKey)}`
                    );
                    if (!challengeRes.ok) {
                        const err = await challengeRes.json().catch(() => ({ error: 'Unknown error' }));
                        throw new Error(err.error || `HTTP ${challengeRes.status}`);
                    }
                    const { challenge } = await challengeRes.json();
                    if (!challenge?.nonce) throw new Error('L\'istanza non ha restituito alcun challenge');

                    // Step 2: sign challenge
                    const signature = await zenSign(`${challenge.username}:${challenge.nonce}`, privKey);

                    // Step 3: submit signed challenge to get passport
                    const response = await fetch(`https://${instanceDomain}/api/auth/zen/link`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            zenPubKey: pubKey,
                            challenge,
                            seaSignature: signature
                        })
                    });

                    if (!response.ok) {
                        const err = await response.json().catch(() => ({ error: 'Unknown error' }));
                        throw new Error(err.error || `HTTP ${response.status}`);
                    }
                    const data = await response.json();
                    if (!data.success || !data.passport) {
                        throw new Error('Risposta non valida dall\'istanza');
                    }

                    // Step 4: save to registry & local linked instances
                    const entry = {
                        instanceDomain,
                        localUsername: data.passport.localUsername,
                        artistName: artistName || data.passport.localUsername || 'Unknown',
                        artistSlug: (artistName || data.passport.localUsername || '').toLowerCase().replace(/\s+/g, '-'),
                        publicKey: pubKey,
                        passportSignature: data.passport.passportSignature,
                        publicDataEndpoint: data.passport.publicDataEndpoint,
                        linkedAt: new Date().toISOString(),
                        verified: 1
                    };

                    saveLinkedInstance(entry);

                    let registry = [];
                    try {
                        registry = JSON.parse(localStorage.getItem('fid_registry') || '[]');
                    } catch (e) {
                        console.error('Error parsing fid_registry:', e);
                        registry = [];
                    }
                    const existingIndex = registry.findIndex(e => e.instanceDomain === instanceDomain);
                    if (existingIndex >= 0) {
                        registry[existingIndex] = entry;
                    } else {
                        registry.push(entry);
                    }
                    localStorage.setItem('fid_registry', JSON.stringify(registry));

                    linkInstanceDomainInput.value = '';
                    linkInstanceArtistInput.value = '';
                    alert(`Istanza ${instanceDomain} collegata!`);
                    loadLinkedInstances(alias);
                } catch (err) {
                    alert('Collegamento fallito: ' + err.message);
                } finally {
                    setText(submitBtn, '');
                    const icon = document.createElement('i');
                    icon.className = 'fas fa-circle-notch fa-spin mr-2';
                    submitBtn.appendChild(icon);
                    const span = document.createElement('span');
                    span.textContent = originalText || 'Collega';
                    submitBtn.appendChild(span);
                    submitBtn.disabled = false;
                }
            });

            function saveLinkedInstance(passport) {
                let existing;
                try {
                    existing = JSON.parse(localStorage.getItem('tunecamp_linked_instances') || '[]');
                } catch (e) {
                    console.error('Error parsing linked_instances:', e);
                    existing = []; // fallback to empty array
                }
                const domain = passport.instanceDomain || passport.instanceUrl;
                const user = passport.localUsername || passport.username || '';
                const key = `${domain}::${user}`;

                existing = existing.filter(item => {
                    const itemDomain = item.instanceDomain || item.instanceUrl;
                    const itemUser = item.localUsername || item.username || '';
                    return `${itemDomain}::${itemUser}` !== key;
                });

                existing.push(passport);
                localStorage.setItem('tunecamp_linked_instances', JSON.stringify(existing));

                // Sync to Zen relay if authenticated
                if (zen && currentPair) {
                    const safeId = key.replace(/[^a-z0-9]/gi, '_');
                    zen.get('~' + currentPair.pub).get('instances').get(safeId).put(passport, null, { authenticator: currentPair });
                }

                const activeUser = getActiveIdentity()?.alias;
                loadLinkedInstances(activeUser);
            }

            window.unlinkInstance = function (keyToUnlink) {
                // The panel renders both stores, so unlinking has to reach both — otherwise a
                // FID registry entry reappears on the next render.
                const keep = item => {
                    const domain = item.instanceDomain || item.instanceUrl;
                    const user = item.localUsername || item.username || '';
                    return `${domain}::${user}` !== keyToUnlink && domain !== keyToUnlink;
                };
                for (const store of ['tunecamp_linked_instances', 'fid_registry']) {
                    let kept;
                    try {
                        kept = JSON.parse(localStorage.getItem(store) || '[]');
                    } catch (e) {
                        console.error('Error parsing stored data:', e);
                        kept = []; // fallback
                    }
                    localStorage.setItem(store, JSON.stringify(kept.filter(keep)));
                }

                // Sync to Zen relay if authenticated
                if (zen && currentPair) {
                    const safeId = keyToUnlink.replace(/[^a-z0-9]/gi, '_');
                    zen.get('~' + currentPair.pub).get('instances').get(safeId).put(null, null, { authenticator: currentPair });
                }

                const activeUser = getActiveIdentity()?.alias;
                loadLinkedInstances(activeUser);
            };

            function loadLinkedInstances(alias) {
                // Two stores feed this one panel: passports from the "Link Instance" flow on
                // this page, and entries the FID portal wrote to fid_registry. Rendering only
                // one of them made instances linked through the other look lost.
                let passports;
                try {
                    passports = JSON.parse(localStorage.getItem('tunecamp_linked_instances') || '[]');
                } catch (e) {
                    console.error('Error parsing linked_instances:', e);
                    passports = [];
                }
                let fidRegistry;
                try {
                    fidRegistry = JSON.parse(localStorage.getItem('fid_registry') || '[]');
                } catch (e) {
                    console.error('Error parsing fid_registry:', e);
                    fidRegistry = [];
                }
                fidRegistry = fidRegistry
                    // Tagged so the Zen sync below writes only real passports back to
                    // tunecamp_linked_instances instead of copying the registry into it.
                    .map(entry => ({ ...entry, __fromFidRegistry: true }));
                const rawExisting = [...passports, ...fidRegistry];
                const activeUser = alias || getActiveIdentity()?.alias;

                const seen = new Set();
                let existing = rawExisting.filter(item => {
                    const domain = item.instanceDomain || item.instanceUrl;
                    const user = item.localUsername || item.username || activeUser || '';
                    const key = `${domain}::${user}`;
                    if (!domain || seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });

                const renderInstances = (instancesListToRender) => {
                    if (instancesListToRender.length === 0) {
                        setHtml(instancesList, `
                            <div class="text-center py-8 text-text-muted text-sm italic">
                                No instances or artist accounts linked yet. Authenticate above and click "Link Instance" to bind your TuneCamp node accounts.
                            </div>`);
                        const grid = document.getElementById('publicReleasesGrid');
                        if (grid) {
                            setHtml(grid, `
                                <div class="sm:col-span-2 text-center py-6 text-text-muted text-xs">
                                    Connect your accounts to view aggregated public releases across the network.
                                </div>`);
                        }
                        return;
                    }

                    const cardsHtml = instancesListToRender.map(item => {
                        const domain = escapeHtml(item.instanceDomain || item.instanceUrl);
                        const localUser = escapeHtml(item.localUsername || item.username || activeUser || '');
                        const key = `${item.instanceDomain || item.instanceUrl}::${item.localUsername || item.username || activeUser || ''}`;
                        const safeId = key.replace(/[^a-z0-9]/gi, '_');
                        const linkedDate = new Date(item.linkedAt || Date.now()).toLocaleDateString();
                        return `
                        <div class="p-4 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between gap-4" id="inst-card-${safeId}">
                            <div class="flex items-center gap-3 min-w-0">
                                <div class="w-10 h-10 rounded-lg bg-primary/20 text-primary flex items-center justify-center overflow-hidden shrink-0" id="inst-avatar-${safeId}">
                                    <i class="fa-solid fa-user-astronaut"></i>
                                </div>
                                <div class="min-w-0">
                                    <div class="font-bold text-sm text-white truncate" id="inst-title-${safeId}">
                                        @${localUser} <span class="text-xs font-normal text-text-muted">(${domain})</span>
                                    </div>
                                    <div class="text-xs text-text-muted">Linked: ${linkedDate}</div>
                                </div>
                            </div>
                            <div class="flex items-center gap-2 shrink-0">
                                <span class="px-2.5 py-1 text-xs rounded-full badge-verified font-medium">
                                    <i class="fa-solid fa-shield-check"></i> Verified
                                </span>
                                <button type="button" onclick="unlinkInstance('${safeId}')" title="Unlink Account" class="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs transition-colors">
                                    <i class="fa-solid fa-trash-can"></i>
                                </button>
                            </div>
                        </div>`;
                    }).join('');
                    setHtml(instancesList, cardsHtml);

                    if (activeUser) {
                        fetchAggregatedPublicReleases(activeUser, instancesListToRender);
                    }
                };

                // Initial local render
                renderInstances(existing);

                // Sync from Zen network
                if (zen && currentPair) {
                    zen.get('~' + currentPair.pub).get('instances').map().once((data, safeId) => {
                        if (!safeId || safeId === '_' || !data) return;
                        if (data === null) {
                            // Instance unlinked remotely
                            existing = existing.filter(item => {
                                const domain = item.instanceDomain || item.instanceUrl;
                                const user = item.localUsername || item.username || activeUser || '';
                                const key = `${domain}::${user}`;
                                return key.replace(/[^a-z0-9]/gi, '_') !== safeId;
                            });
                        } else if (data && (data.instanceDomain || data.instanceUrl)) {
                            // Instance linked remotely
                            const domain = data.instanceDomain || data.instanceUrl;
                            const user = data.localUsername || data.username || activeUser || '';
                            const key = `${domain}::${user}`;
                            if (!seen.has(key)) {
                                seen.add(key);
                                existing.push(data);
                            }
                        } else {
                            return;
                        }

                        // Update local cache and UI
                        localStorage.setItem('tunecamp_linked_instances',
                            JSON.stringify(existing.filter(item => !item.__fromFidRegistry)));
                        renderInstances(existing);
                    });
                }
            }

            window.switchProfileTab = function (tab) {
                const releasesBtn = document.getElementById('tabReleasesBtn');
                const likesBtn = document.getElementById('tabLikesBtn');
                const playlistsBtn = document.getElementById('tabPlaylistsBtn');

                const releasesContent = document.getElementById('tabReleasesContent');
                const likesContent = document.getElementById('tabLikesContent');
                const playlistsContent = document.getElementById('tabPlaylistsContent');

                [releasesBtn, likesBtn, playlistsBtn].forEach(b => {
                    if (b) {
                        b.className = 'px-3 py-1.5 rounded-md font-medium text-text-muted hover:text-white transition-colors';
                    }
                });
                [releasesContent, likesContent, playlistsContent].forEach(c => {
                    if (c) c.classList.add('hidden');
                });

                if (tab === 'releases') {
                    if (releasesBtn) releasesBtn.className = 'px-3 py-1.5 rounded-md font-medium text-white bg-primary transition-colors';
                    if (releasesContent) releasesContent.classList.remove('hidden');
                } else if (tab === 'likes') {
                    if (likesBtn) likesBtn.className = 'px-3 py-1.5 rounded-md font-medium text-white bg-primary transition-colors';
                    if (likesContent) likesContent.classList.remove('hidden');
                } else if (tab === 'playlists') {
                    if (playlistsBtn) playlistsBtn.className = 'px-3 py-1.5 rounded-md font-medium text-white bg-primary transition-colors';
                    if (playlistsContent) playlistsContent.classList.remove('hidden');
                }
            };

            function toAbsoluteUrl(url, base) {
                if (!url) return '';
                if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
                const cleanBase = base.replace(/\/+$/, '');
                const cleanPath = url.startsWith('/') ? url : `/${url}`;
                return `${cleanBase}${cleanPath}`;
            }

            async function fetchAggregatedPublicReleases(alias, instances) {
                const relGrid = document.getElementById('publicReleasesGrid');
                const likesGrid = document.getElementById('publicLikesGrid');
                const plGrid = document.getElementById('publicPlaylistsGrid');

                if (!instances || instances.length === 0) {
                    if (relGrid) setHtml(relGrid, `<div class="sm:col-span-2 text-center py-6 text-text-muted text-xs">Connect your accounts to view aggregated public releases across the network.</div>`);
                    return;
                }

                let allReleases = [];
                let allLikes = [];
                let allPlaylists = [];

                for (const inst of instances) {
                    let domain;
                    try {
                        domain = inst.instanceDomain || (inst.instanceUrl ? new URL(inst.instanceUrl).hostname : '');
                    } catch (e) {
                        console.error('Error parsing domain from instance:', e);
                        domain = null;
                    }
                    if (!domain) continue;

                    const targetUser = inst.localUsername || inst.username || alias;
                    const protocol = inst.instanceUrl && inst.instanceUrl.startsWith('http') ? '' : 'https://';
                    const baseUrl = inst.instanceUrl || `${protocol}${domain}`;
                    const endpoint = inst.publicDataEndpoint || `${baseUrl}/api/auth/zen/user/${targetUser}/public`;
                    const key = `${domain}::${targetUser}`;
                    const safeId = key.replace(/[^a-z0-9]/gi, '_');

                    try {
                        const res = await fetch(endpoint);
                        if (res.ok) {
                            const data = await res.json();

                            // 1. Update Linked Instance card with user profile picture & artist name
                            const prof = data.publicProfile || data.user || data.profile;
                            if (prof) {
                                const titleEl = document.getElementById(`inst-title-${safeId}`);
                                const avatarEl = document.getElementById(`inst-avatar-${safeId}`);
                                const artistDisplayName = prof.artistName || prof.displayName || prof.username || targetUser;
                                if (titleEl) {
                                    setHtml(titleEl, `${escapeHtml(artistDisplayName)} <span class="text-xs font-normal text-text-muted">(@${escapeHtml(targetUser)} on ${escapeHtml(domain)})</span>`);
                                }
                                const rawAvatar = prof.imageUrl || prof.avatar;
                                if (avatarEl && rawAvatar) {
                                    const avatarUrl = toAbsoluteUrl(rawAvatar, baseUrl);
                                    setHtml(avatarEl, `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(artistDisplayName)}" class="w-full h-full object-cover" />`);
                                }
                            }

                            // 2. Parse releases/albums
                            const relList = data.publicReleases || data.releases || [];
                            if (Array.isArray(relList)) {
                                relList.forEach(rel => {
                                    const rawCover = rel.cover_url || rel.coverUrl || prof?.imageUrl || prof?.avatar;
                                    allReleases.push({
                                        id: rel.id,
                                        title: rel.title,
                                        artist: prof?.artistName || prof?.displayName || targetUser,
                                        coverUrl: toAbsoluteUrl(rawCover, baseUrl),
                                        releaseDate: rel.release_date || rel.releaseDate,
                                        type: rel.type || 'Album',
                                        linkUrl: `${baseUrl}/#album-${rel.id}`,
                                        instanceDomain: domain,
                                        localUsername: targetUser
                                    });
                                });
                            }

                            // 3. Parse starred/likes
                            const likeList = data.publicLikes || data.likes || [];
                            if (Array.isArray(likeList)) {
                                likeList.forEach(lk => {
                                    const rawCover = lk.album_cover || prof?.imageUrl;
                                    allLikes.push({
                                        id: lk.id,
                                        title: lk.album_title || lk.track_title || `Item #${lk.id}`,
                                        artist: lk.track_artist || prof?.artistName || targetUser,
                                        coverUrl: toAbsoluteUrl(rawCover, baseUrl),
                                        type: lk.type || 'Favorite',
                                        linkUrl: `${baseUrl}`,
                                        instanceDomain: domain,
                                        localUsername: targetUser
                                    });
                                });
                            }

                            // 4. Parse playlists
                            const plList = data.publicPlaylists || data.playlists || [];
                            if (Array.isArray(plList)) {
                                plList.forEach(pl => {
                                    const rawCover = pl.cover_url || prof?.imageUrl;
                                    allPlaylists.push({
                                        id: pl.id,
                                        title: pl.name || pl.title || 'Playlist',
                                        artist: targetUser,
                                        coverUrl: toAbsoluteUrl(rawCover, baseUrl),
                                        type: 'Playlist',
                                        linkUrl: `${baseUrl}`,
                                        instanceDomain: domain,
                                        localUsername: targetUser
                                    });
                                });
                            }
                        }
                    } catch (err) {
                        console.warn(`[Zen Aggregator] Could not fetch public data for @${targetUser} from ${domain}:`, err);
                    }
                }

                // Update counters
                document.getElementById('releasesCount').textContent = allReleases.length;
                document.getElementById('likesCount').textContent = allLikes.length;
                document.getElementById('playlistsCount').textContent = allPlaylists.length;

                // Render Releases
                if (relGrid) {
                    if (allReleases.length === 0) {
                        setHtml(relGrid, `<div class="sm:col-span-2 text-center py-6 text-text-muted text-xs">No public releases found yet for linked accounts. Make sure your albums/releases are set to Public or Released status on your TuneCamp nodes.</div>`);
                    } else {
                        setHtml(relGrid, allReleases.map(rel => `
                            <a href="${escapeHtml(rel.linkUrl)}" target="_blank" rel="noopener" class="p-4 bg-white/5 border border-white/10 rounded-xl flex items-center gap-4 hover:border-primary/40 hover:bg-white/[0.07] transition-all group">
                                <div class="w-12 h-12 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
                                    ${rel.coverUrl ? `<img src="${escapeHtml(rel.coverUrl?.split('`').join('``'))} alt="${escapeHtml(rel.title || '')}" class="w-full h-full object-cover" />` : `<i class="fa-solid fa-compact-disc text-amber-400 text-xl"></i>`}
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
                        `).join('');
                    }
                }

                // Render Favorites
                if (likesGrid) {
                    if (allLikes.length === 0) {
                        setHtml(likesGrid, `<div class="sm:col-span-2 text-center py-6 text-text-muted text-xs">No starred favorites found for linked accounts.</div>`);
                        } else {
                        setHtml(likesGrid, allLikes.map(lk => `
                            <a href="${escapeHtml(lk.linkUrl)}" target="_blank" rel="noopener" class="p-4 bg-white/5 border border-white/10 rounded-xl flex items-center gap-4 hover:border-rose-400/40 hover:bg-white/[0.07] transition-all group">
                                <div class="w-12 h-12 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
                                    ${lk.coverUrl ? `<img src="${escapeHtml(lk.coverUrl?.split('`').join('``'))} alt="${escapeHtml(lk.title || '')}" class="w-full h-full object-cover" />` : `<i class="fa-solid fa-heart text-rose-400 text-xl"></i>`}
                                </div>
                                <div class="min-w-0 flex-1">
                                    <div class="font-bold text-sm text-white truncate group-hover:text-rose-400 transition-colors">${escapeHtml(lk.title)}</div>
                                    <div class="text-xs text-text-muted truncate">${escapeHtml(lk.artist)}</div>
                                    <div class="flex items-center gap-2 text-[10px] text-rose-400/80 font-mono mt-1">
                                        <span><i class="fa-solid fa-arrow-up-right-from-square text-[9px]"></i> ${escapeHtml(lk.instanceDomain)}</span>
                                    </div>
                                </div>
                            </a>
                        `).join('');
                    }
                }

                // Render Playlists
                if (plGrid) {
                    if (allPlaylists.length === 0) {
                        setHtml(plGrid, `<div class="sm:col-span-2 text-center py-6 text-text-muted text-xs">No public playlists found for linked accounts.</div>`);
                    } else {
                        setHtml(plGrid, allPlaylists.map(pl => `
                            <a href="${escapeHtml(pl.linkUrl)}" target="_blank" rel="noopener" class="p-4 bg-white/5 border border-white/10 rounded-xl flex items-center gap-4 hover:border-purple-400/40 hover:bg-white/[0.07] transition-all group">
                                <div class="w-12 h-12 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
                                    ${pl.coverUrl ? `<img src="${escapeHtml(pl.coverUrl?.split('`').join('``'))} alt="${escapeHtml(pl.title || '')}" class="w-full h-full object-cover" />` : `<i class="fa-solid fa-list-music text-purple-400 text-xl"></i>`}
                                </div>
                                <div class="min-w-0 flex-1">
                                    <div class="font-bold text-sm text-white truncate group-hover:text-purple-400 transition-colors">${escapeHtml(pl.title)}</div>
                                    <div class="text-xs text-text-muted truncate">By @${escapeHtml(pl.localUsername)}</div>
                                    <div class="flex items-center gap-2 text-[10px] text-purple-400/80 font-mono mt-1">
                                        <span><i class="fa-solid fa-arrow-up-right-from-square text-[9px]"></i> ${escapeHtml(pl.instanceDomain)}</span>
                                    </div>
                                </div>
                            </a>
                        `).join('');
                    }
                }
            }
            function getActiveIdentity() {
                const raw = localStorage.getItem('tunecamp_zen_user');
                if (!raw) return null;
                try {
                    const parsed = JSON.parse(raw);
                    return parsed?.alias ? parsed : null;
                } catch (e) {
                    return null;
                }
            }

            // Cross-Instance Unification: pull public data for the FID registry entries.
            // This used to be a second function also named loadLinkedInstances, declared after the
            // one that renders the panel. Being a function declaration in the same scope, it won
            // the binding, so every "instance linked!" refresh ran this one instead: it reads
            // fid_registry while the link flow writes tunecamp_linked_instances, so a freshly
            // linked instance was saved and then rendered away as "No instances linked yet".
            // The panel now has a single renderer (loadLinkedInstances, which merges both stores);
            // this function only fetches.
            async function loadFidRegistryData() {
                let registry;
                try {
                    registry = JSON.parse(localStorage.getItem('fid_registry') || '[]');
                } catch (e) {
                    console.error('Error parsing fid_registry:', e);
                    registry = [];
                };

                for (const entry of registry) {
                    if (entry.verified) {
                        await fetchInstanceData(entry.instanceDomain);
                    }
                }
            }

            async function fetchInstanceData(instanceDomain) {
                try {
                    const response = await fetch(`https://${instanceDomain}/api/auth/zen/user/${currentAlias}`);
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    const data = await response.json();
                    if (data.success) {
                        // Store the data for aggregation
                        const instanceData = JSON.parse(localStorage.getItem('tunecamp_instance_data') || '{}');
                        instanceData[instanceDomain] = data;
                        localStorage.setItem('tunecamp_instance_data', JSON.stringify(instanceData));
                        renderAggregatedData();
                    }
                } catch (err) {
                    console.error(`[Profile] Failed to fetch data from ${instanceDomain}:`, err);
                }
            }

            function renderAggregatedData() {
                let instanceData;
                try {
                    instanceData = JSON.parse(localStorage.getItem('tunecamp_instance_data') || '{}');
                } catch (e) {
                    console.error('Error parsing instance_data:', e);
                    instanceData = {};
                }
                const instances = Object.keys(instanceData);

                // Aggregate releases
                let allReleases = [];
                let allLikes = [];
                let allPlaylists = [];

                for (const domain of instances) {
                    const data = instanceData[domain];
                    if (data.publicReleases) {
                        allReleases.push(...data.publicReleases.map(r => ({ ...r, instanceDomain: domain })));
                    }
                    if (data.publicLikes) {
                        allLikes.push(...data.publicLikes.map(l => ({ ...l, instanceDomain: domain })));
                    }
                    if (data.publicPlaylists) {
                        allPlaylists.push(...data.publicPlaylists.map(p => ({ ...p, instanceDomain: domain })));
                    }
                }

                // Update counts
                document.getElementById('releasesCount').textContent = allReleases.length;
                document.getElementById('likesCount').textContent = allLikes.length;
                document.getElementById('playlistsCount').textContent = allPlaylists.length;

                // Render releases
                const releasesGrid = document.getElementById('publicReleasesGrid');
                if (releasesGrid) {
                    if (allReleases.length === 0) {
                        setHtml(releasesGrid, '<div class="sm:col-span-2 text-center py-6 text-text-muted text-xs">No public releases found across linked instances.</div>');
                    } else {
                        setHtml(releasesGrid, allReleases.slice(0, 12).map(r => `
                        <a href="https://${r.instanceDomain}/album/${r.slug || r.id}" target="_blank" rel="noopener" class="group glass-card p-4 flex gap-4 hover:border-primary/50 transition-colors">
                            <div class="w-16 h-16 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
                                ${r.cover_url ? `<img src="${r.cover_url}" alt="${r.title}" class="w-full h-full object-cover" />` : `<i class="fa-solid fa-compact-disc text-primary text-xl"></i>`}
                            </div>
                            <div class="min-w-0 flex-1">
                                <div class="font-bold text-sm text-white truncate group-hover:text-primary transition-colors">${r.title}</div>
                                <div class="text-xs text-text-muted truncate">By @${r.artist_name || 'Unknown'}</div>
                                <div class="flex items-center gap-2 text-[10px] text-primary/80 font-mono mt-1">
                                    <span><i class="fa-solid fa-arrow-up-right-from-square text-[9px]"></i> ${r.instanceDomain}</span>
                                </div>
                            </div>
                        </a>
                    `).join(''));
                    }
                }

                // Render likes
                const likesGrid = document.getElementById('publicLikesGrid');
                if (likesGrid) {
                    if (allLikes.length === 0) {
                        setHtml(likesGrid, '<div class="sm:col-span-2 text-center py-6 text-text-muted text-xs">No starred favorites aggregated yet.</div>');
                    } else {
                        setHtml(likesGrid, allLikes.slice(0, 12).map(l => `
                        <div class="glass-card p-4 flex gap-4">
                            <div class="w-16 h-16 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
                                ${l.album_cover ? `<img src="${l.album_cover}" alt="${l.album_title || l.track_title}" class="w-full h-full object-cover" />` : `<i class="fa-solid fa-heart text-rose-400 text-xl"></i>`}
                            </div>
                            <div class="min-w-0 flex-1">
                                <div class="font-bold text-sm text-white truncate">${l.track_title || l.album_title || 'Unknown'}</div>
                                <div class="text-xs text-text-muted truncate">By @${l.track_artist || 'Unknown'}</div>
                                <div class="flex items-center gap-2 text-[10px] text-primary/80 font-mono mt-1">
                                    <span><i class="fa-solid fa-arrow-up-right-from-square text-[9px]"></i> ${l.instanceDomain}</span>
                                </div>
                            </div>
                        </div>
                    `).join(''));
                    }
                }

                // Render playlists
                const playlistsGrid = document.getElementById('publicPlaylistsGrid');
                if (playlistsGrid) {
                    if (allPlaylists.length === 0) {
                        setHtml(playlistsGrid, '<div class="sm:col-span-2 text-center py-6 text-text-muted text-xs">No public playlists aggregated yet.</div>');
                    } else {
                        setHtml(playlistsGrid, allPlaylists.slice(0, 12).map(pl => `
                        <a href="https://${pl.instanceDomain}/playlist/${pl.id}" target="_blank" rel="noopener" class="group glass-card p-4 flex gap-4 hover:border-purple-400/50 transition-colors">
                            <div class="w-16 h-16 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
                                ${pl.coverUrl ? `<img src="${pl.coverUrl}" alt="${pl.title}" class="w-full h-full object-cover" />` : `<i class="fa-solid fa-list-music text-purple-400 text-xl"></i>`}
                            </div>
                            <div class="min-w-0 flex-1">
                                <div class="font-bold text-sm text-white truncate group-hover:text-purple-400 transition-colors">${pl.title}</div>
                                <div class="text-xs text-text-muted truncate">By @${pl.localUsername}</div>
                                <div class="flex items-center gap-2 text-[10px] text-purple-400/80 font-mono mt-1">
                                    <span><i class="fa-solid fa-arrow-up-right-from-square text-[9px]"></i> ${pl.instanceDomain}</span>
                                </div>
                            </div>
                        </a>
                    `).join(''));
                    }
                }
            }

            // showLoggedIn already renders the panel via loadLinkedInstances; this only adds the
            // network fetch for FID registry entries.
            const originalShowLoggedIn = showLoggedIn;
            showLoggedIn = function (alias, pubKey) {
                originalShowLoggedIn(alias, pubKey);
                loadFidRegistryData();
            };

            // Initial load if already logged in
            if (getActiveIdentity()) {
                loadFidRegistryData();
            }

        });
    