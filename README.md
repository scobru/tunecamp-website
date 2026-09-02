# TuneCamp Website

The official landing page, global community directory, and browser-based community audio player for TuneCamp. Part of the TuneCamp ecosystem.

## Features

- **Marketing Landing Page**: Visual presentation of TuneCamp's core features, deployment guides, and companion projects.
- **Community Directory (`community.html`)**: Real-time discovery of live, public TuneCamp instances querying the public `/api/community/sites` REST endpoint of directory seeds.
- **Community Player (`player.html`)**: A client-side audio player that aggregates and plays tracks across all discovered active TuneCamp instances in the network.
- **Personal Library**: Favourites, playlists, followed artists and recently played, saved in the visitor's own browser — no account, no server, nothing leaves the device. Export and import it as JSON from the player's library menu.
- **Optional FID Sync**: With a FID identity unlocked on the Profile page, the same library follows the listener across devices through the Zen relay, encrypted to their own key. Playlists they explicitly publish get a shareable link anyone can open.
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
Profile page (`tunecamp_zen_user`). It mirrors the library into that identity's
own subtree of the Zen graph, `~<pub>/tc-library-v1/`:

| Node | Contents | Visibility |
| --- | --- | --- |
| `favorites/<id>`, `artists/<id>`, `playlists/<id>` | `{ d: ciphertext, at, del }` | encrypted to the identity's key |
| `shared/<id>` | `{ name, items, owner, at, del }` | public and in the clear |

Only the payload is encrypted — timestamps stay readable because the merge needs
them, so the relay can see how many items an identity holds and when they
changed, but not what they are. `shared/` is the deliberate exception: a
playlist the listener publishes, republished in the clear so that
`player.html?pl=<pub>.<id>` opens for anyone. Unpublishing tombstones it and the
link stops resolving. Listening history and player preferences are never synced.

No TuneCamp server is involved. The relay carries signed writes it cannot forge,
and only the holder of the private key can write under that subtree. When the
relay is unreachable the library keeps working and the player says so rather
than pretending to be synced.

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
node --experimental-default-type=module tests/instance-import.test.js

# browser tests (need Playwright, and a server for them to drive)
npx http-server -p 8123 -s .
node tests/player.e2e.cjs     # the player: library, sharing, shared links
node tests/sync.e2e.cjs       # the sync module against the real Zen crypto

# two devices syncing through a throwaway relay (also needs `npm install ws`)
node tests/relay.e2e.cjs
```

`relay.e2e.cjs` stands up a dumb websocket broadcast on localhost — all a Zen
relay has to be, since every write is signed — and drives two independent
browser profiles through it, so the sync is proven end to end without touching
the public relay.

Feel free to open issues or PRs to improve discovery, player controls, or visual styles.
