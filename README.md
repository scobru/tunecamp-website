# TuneCamp Website

The official landing page, global community directory, and browser-based community audio player for TuneCamp. Part of the TuneCamp ecosystem.

## Features

- **Marketing Landing Page**: Visual presentation of TuneCamp's core features, deployment guides, and companion projects.
- **Community Directory (`community.html`)**: Real-time discovery of live, public TuneCamp instances querying the public `/api/community/sites` REST endpoint of directory seeds.
- **Community Player (`player.html`)**: A client-side audio player that aggregates and plays tracks across all discovered active TuneCamp instances in the network.
- **Personal Library**: Favourites, playlists, followed artists and recently played, saved in the visitor's own browser — no account, no server, nothing leaves the device. Export and import it as JSON from the player's library menu.
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

Storage goes through a backend interface (`setBackend`); today the only one is
localStorage.

### Tests

```bash
# library + queue units
node --experimental-default-type=module tests/library.test.js

# optional browser smoke test (needs Playwright)
npx http-server -p 8123 -s .
node tests/player.e2e.cjs
```

Feel free to open issues or PRs to improve discovery, player controls, or visual styles.
