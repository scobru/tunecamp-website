/**
 * GET /api/network?depth=1..3 — server-side crawl of the TuneCamp federation.
 *
 * network-graph.html used to crawl the network from the visitor's browser,
 * which made every pageview probe dozens of third-party instances (leaking
 * visitor IPs to hosts that never asked for the traffic), and reported any
 * CORS-restricted instance as "offline" even when it federates fine. This
 * Vercel function does the same BFS crawl once, server-side, and the result
 * is cached at the CDN edge (s-maxage) so the network sees at most one
 * polite crawler every half hour instead of one per visitor.
 *
 * Seeds come from config.js (single source of truth with the browser pages);
 * vercel.json's includeFiles makes that file available to the function.
 *
 * Response: { crawledAt, depth, nodes: [{url, name, version, description,
 * artistName, communityLink, reachable, seed}], edges: [{from, to}] }.
 * `reachable` is true (answered as TuneCamp), false (probe failed), or null
 * (referenced by a peer list but never probed — "known only").
 */

const fs = require("fs");
const path = require("path");
const dns = require("dns").promises;
const http = require("http");
const https = require("https");

const FETCH_TIMEOUT = 5000;   // ms per request
const MAX_NODES = 80;         // safety cap, mirrors the browser crawler
const MAX_DEPTH = 3;

/** Reads window.TUNECAMP_DIRECTORY out of config.js without a browser. */
function loadSeeds() {
    const src = fs.readFileSync(path.join(process.cwd(), "config.js"), "utf8");
    const sandbox = {};
    new Function("window", src)(sandbox);
    return Array.isArray(sandbox.TUNECAMP_DIRECTORY) ? sandbox.TUNECAMP_DIRECTORY : [];
}

/** Public-web origins only: the crawler must never be steered at internal hosts. */
function normOrigin(raw) {
    if (!raw || typeof raw !== "string") return null;
    let u;
    try { u = new URL(raw.trim()); } catch { return null; }
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return null;
    // Reject IP literals outright (public instances federate by hostname).
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return null;
    return u.origin;
}

async function fetchJson(url) {
    try {
        const u = new URL(url);
        // DNS SSRF Protection: Resolve hostname and check if it points to a private/internal IP
        const { address } = await dns.lookup(u.hostname);
        if (!address || /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|::1$|f[cd][0-9a-f]{2}:|fe80:)/i.test(address)) {
            return null;
        }

        return await new Promise((resolve, reject) => {
            const isHttps = u.protocol === 'https:';
            const mod = isHttps ? https : http;

            // Pin the resolved IP address to prevent DNS rebinding TOCTOU attacks
            const req = mod.request({
                host: address,
                port: u.port || (isHttps ? 443 : 80),
                path: u.pathname + u.search,
                method: 'GET',
                headers: {
                    'Host': u.hostname,
                    'Accept': 'application/json',
                    'User-Agent': 'TuneCamp-Website-Graph/1.0 (+https://www.tunecamp.org/network-graph.html)'
                },
                servername: isHttps ? u.hostname : undefined, // Necessary for SNI validation
                timeout: FETCH_TIMEOUT
            }, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    reject(new Error('Redirects not followed'));
                    return;
                }
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    resolve(null);
                    return;
                }
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try { resolve(JSON.parse(data)); } catch { resolve(null); }
                });
            });

            req.on('error', () => resolve(null));
            req.on('timeout', () => { req.destroy(); resolve(null); });
            req.end();
        });
    } catch {
        return null;
    }
}

function parsePeers(doc) {
    if (Array.isArray(doc)) return doc.filter((p) => typeof p === "string");
    if (doc && Array.isArray(doc.peers)) return doc.peers.filter((p) => typeof p === "string");
    return [];
}

module.exports = async (req, res) => {
    const depthParam = parseInt(String(req.query?.depth ?? "2"), 10);
    const maxDepth = Math.min(Math.max(Number.isFinite(depthParam) ? depthParam : 2, 1), MAX_DEPTH);

    let seeds;
    try {
        seeds = loadSeeds();
    } catch (e) {
        res.status(500).json({ error: "Seed directory unavailable" });
        return;
    }

    /** @type {Map<string, any>} */
    const nodes = new Map();
    const edges = [];
    const edgeKeys = new Set();
    const ensureNode = (origin, seed) => {
        let n = nodes.get(origin);
        if (!n) {
            n = { url: origin, name: null, version: null, description: null, artistName: null, communityLink: null, reachable: null, seed: !!seed };
            nodes.set(origin, n);
        } else if (seed) {
            n.seed = true;
        }
        return n;
    };
    const addEdge = (from, to) => {
        if (from === to) return;
        if (edgeKeys.has(from + " " + to) || edgeKeys.has(to + " " + from)) return;
        edgeKeys.add(from + " " + to);
        edges.push({ from, to });
    };

    const visited = new Set();
    let frontier = [...new Set(seeds.map(normOrigin).filter(Boolean))];
    for (const o of frontier) ensureNode(o, true);

    let depth = 0;
    while (frontier.length && depth < maxDepth) {
        const batch = frontier.filter((o) => !visited.has(o));
        batch.forEach((o) => visited.add(o));

        const results = await Promise.all(batch.map(async (origin) => {
            const [inst, peersDoc] = await Promise.all([
                fetchJson(origin + "/api/community/instance"),
                fetchJson(origin + "/api/community/peers"),
            ]);
            return { origin, inst, peers: parsePeers(peersDoc) };
        }));

        const next = [];
        for (const r of results) {
            const node = ensureNode(r.origin);
            const isTune = r.inst && (r.inst.software === "tunecamp" || r.inst.name || r.inst.peers);
            node.reachable = !!isTune;
            if (r.inst) {
                node.name = r.inst.name || node.name;
                node.version = r.inst.version || node.version;
                node.description = r.inst.description || node.description;
                node.artistName = r.inst.artistName || node.artistName;
                node.communityLink = r.inst.communityLink || node.communityLink;
            }
            for (const p of r.peers) {
                const po = normOrigin(p);
                if (!po || po === r.origin) continue;
                if (!nodes.has(po) && nodes.size >= MAX_NODES) continue;
                ensureNode(po);
                addEdge(r.origin, po);
                if (!visited.has(po)) next.push(po);
            }
        }
        frontier = [...new Set(next)];
        depth++;
    }

    // One shared crawl per edge region per half hour; stale copies may be served
    // for up to a day while a fresh crawl happens in the background.
    res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=86400");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json({
        crawledAt: Date.now(),
        depth,
        nodes: [...nodes.values()],
        edges,
    });
};
