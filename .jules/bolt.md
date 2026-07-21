## 2024-07-08 - Lazy Loading in Federated Lists
**Learning:** In the Tunecamp static frontend architecture, dynamically rendered grids for federated items (tracks, activities, listener avatars) can inject hundreds of `<img>` tags simultaneously. This massively bottlenecks the network and delays main thread interactivity.
**Action:** Always include `loading="lazy"` on dynamically injected `<img>` tags in this application's federated lists to prevent initial load congestion.

## 2024-03-01 - Native Lazy Loading for Federated Data Grid Images
**Learning:** The grid architecture for rendering federated lists (tracks, activities) in the frontend dynamically generates many `<img>` elements simultaneously. Without native lazy loading (`loading="lazy"`), this initiates an enormous number of concurrent network requests immediately on rendering, which can cause significant network bottlenecks, slowing down both the application itself and the user's browser, particularly when pulling content from multiple different instances simultaneously.
**Action:** Always include the `loading="lazy"` attribute on `<img>` tags, especially those that are generated dynamically inside grid views or long lists from federated data sources, to allow the browser to intelligently manage network requests as the user scrolls.

## 2024-07-21 - Debouncing Rapid Full DOM Rebuilds on Search Input
**Learning:** In the Tunecamp static frontend, dynamic grid architectures (like the tracks list) regenerate their entire DOM via `innerHTML` on every update. Calling these regeneration functions (e.g., `filterTracks`) synchronously on every keystroke (`oninput`) during a text search causes significant main thread blocking and jank, especially when rendering hundreds of items.
**Action:** Always debounce high-frequency event listeners (like text input fields) that trigger rapid full DOM rebuilds or extensive `innerHTML` replacements to maintain application responsiveness.
