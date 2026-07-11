## 2024-07-08 - Lazy Loading in Federated Lists
**Learning:** In the Tunecamp static frontend architecture, dynamically rendered grids for federated items (tracks, activities, listener avatars) can inject hundreds of `<img>` tags simultaneously. This massively bottlenecks the network and delays main thread interactivity.
**Action:** Always include `loading="lazy"` on dynamically injected `<img>` tags in this application's federated lists to prevent initial load congestion.

## 2024-07-11 - Search Filtering Over-Rendering
**Learning:** In the Tunecamp static frontend, replacing the innerHTML of large grid elements (like `#tracksGrid` or `#tracksContainer`) synchronously on every keypress event (`oninput`) causes severe main thread blocking and jank because it repeatedly forces the browser to recalculate layouts and parse complex DOM structures.
**Action:** Always implement a debounce pattern (e.g., waiting 150ms) for high-frequency input handlers that result in large DOM updates or full re-renders to ensure the UI remains responsive while the user is typing.
