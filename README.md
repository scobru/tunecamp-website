# TuneCamp Website

The official landing page, global community directory, and browser-based community audio player for TuneCamp. Part of the TuneCamp ecosystem.

## Features

- **Marketing Landing Page**: Visual presentation of TuneCamp's core features, deployment guides, and companion projects.
- **Community Directory (`community.html`)**: Real-time discovery of live, public TuneCamp instances querying the public `/api/community/sites` REST endpoint of directory seeds.
- **Community Player (`player.html`)**: A client-side audio player that aggregates and plays tracks across all discovered active TuneCamp instances in the network.
- **Personal Library**: Favourites, playlists, followed artists and recently played, saved in the visitor's own browser — no account, no server, nothing leaves the device. Export and import it as JSON from the player's library menu.
- **Optional FID Sync**: With a FID identity unlocked on the Profile page, the same library follows the listener across devices through the TuneCamp instance their identity is linked to, encrypted to their own key. Playlists they explicitly publish get a shareable link anyone can open.
- **Import from your own instances**: the stars and public playlists on the TuneCamp instances linked to a FID identity can be copied into the player's library in one click.
- **Responsive & Premium UI**: Designed with customized glassmorphism, responsive Tailwind CSS grid, and smooth interactive elements.

## Getting Started

Since this is a client-side static site, no build steps are required.

1. **Configure Directory Seed Nodes**: Edit `config.js` to add your TuneCamp server origins to the `window.TUNECAMP_DIRECTORY` array:
   ```javascript
   window.TUNECAMP_DIRECTORY = [
       "https://your-tunecamp-instance.com",
   ];
   ```

2. **Run Locally**: Serve the directory using any static web server. For example:
   ```bash
   # Using Python
   python -m http.server 8000
   
   # Using Node.js (serve npm package)
   npx serve .
   ```

## Development

The project uses Tailwind CSS (v4) loaded via CDN:
```html
<script src="https://unpkg.com/@tailwindcss/browser@4"></script>
```

### Personal library

`components/library.js` stores what a listener saves; `components/queue.js` owns
what is playing, which is deliberately not the same list as what is on screen.

Saved items are snapshots (title, artist, cover, audio URL), not references, so a
favourite still renders and plays when the instance that served it is offline.
They are keyed by a `title::artist` fingerprint — the same de-duplication the
player applies to the network catalog — so a saved track re-binds itself to
whichever copy of the song is reachable now. Deletions leave tombstones rather
than dropping the record, so a later sync backend can merge two devices without
resurrecting removed entries.

Storage goes through a backend interface (`setBackend`); the only one is
localStorage. Cross-device sync is a layer on top, not a replacement: local
stays the source of truth for rendering, and the sync only merges.

### FID sync (`components/library-sync.js`)

Entirely optional, and inert until a FID identity has been unlocked on the
Profile page (`tunecamp_zen_user`) and an instance is known: the first one the
identity is linked to (`tunecamp_linked_instances`), or, on a new device, the one
that answers `GET /api/auth/zen/library/<pub>/account` among the directory
instances in `config.js`. It mirrors the library to that instance over plain
HTTP, through the TuneCamp server's `/api/auth/zen/library/<pub>` routes:

| Bucket | Contents | Visibility |
| --- | --- | --- |
| `favorites`, `artists`, `playlists` | `{ d: ciphertext, at, del }` | encrypted in the browser (AES-GCM, key derived from the identity key) |
| `shared` | `{ d: { name, items, owner }, at, del }` | public and in the clear |

Requests are signed with the identity key (`X-Fid-Auth: <ts>.<sig>` over the
method, path, timestamp and body hash), and the instance only accepts a key that
belongs to one of its own active accounts. Only the payload is encrypted —
timestamps stay readable because the merge needs them, so the instance can see
how many items an identity holds and when they changed, but not what they are.
`shared` is the deliberate exception: a playlist the listener publishes,
republished in the clear so that `player.html?pl=<pub>.<id>@<host>` opens for
anyone. Unpublishing tombstones it and the link stops resolving. Listening
history and player preferences are never synced.

The player reads when it opens, when the tab becomes visible again and once a
minute; writes are debounced. Last write wins by each record's own timestamp.
When the instance is unreachable the library keeps working and the player says
so rather than pretending to be synced. The profile card (name, bio, avatar) is
kept in the browser only.

### Importing from linked instances (`components/instance-import.js`)

The Profile page links instances to a FID identity; each instance then exposes
that account's public activity at `/api/auth/zen/user/<username>/public` — no
session, wildcard CORS — so the player reads it directly and copies what it
finds into the local library.

It is a copy, not a link: starring something on an instance later needs another
run. Runs are idempotent — favourites are keyed by what a track *is*, and an
imported playlist is stamped with `importedFrom: "<host>/<id>"` so a second run
tops it up instead of duplicating it, never rewriting tracks the listener added
themselves.

Where a track exists both on the origin instance and in the aggregated network
catalog, the network copy wins: it is the one already known to be reachable, and
it carries the duration and cover the public payload leaves out.

Two limits come from the instance side:

- the public payload returns the 20 most recent starred items;
- a public playlist's tracks come from `GET /api/playlists/:id/public`, which
  older instances do not have (`GET /api/playlists/:id` is members-only). On
  those the playlist is reported as found but not readable, rather than being
  skipped in silence.

Album likes are reported and skipped: this is a library of tracks, and exploding
an album into a dozen separate hearts would misrepresent what was starred.

### Tests

```bash
# units — no dependencies
node --experimental-default-type=module tests/library.test.js
node --experimental-default-type=module tests/library-sync.test.js   # sync, crypto, share links, against an in-process instance
node --experimental-default-type=module tests/instance-import.test.js
node --experimental-default-type=module tests/url-safety.test.js

# browser test (needs Playwright, and a server for it to drive)
npx http-server -p 8123 -s .
node tests/player.e2e.cjs     # the player: library, sharing, shared links
```

`library-sync.test.js` stands in for the TuneCamp server with the same contract
(signed requests, last write wins, tombstones, public shared playlists) and
drives two devices through it, so the sync is proven end to end without any
network.

Feel free to open issues or PRs to improve discovery, player controls, or visual styles.

## Linking a new FID key from an instance

`profile.html#linkCode=<code>&instance=<host>` is opened by the instance's Profile page ("Link my FID identity"). After signing in with alias and passphrase, the page signs the instance challenge with the new key and binds it to the account; the code is read from the URL fragment, removed from the address bar, and only challenges with a plain username and a 32-hex nonce are ever signed.
