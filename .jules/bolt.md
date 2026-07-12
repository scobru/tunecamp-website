## 2024-07-08 - Lazy Loading in Federated Lists
**Learning:** In the Tunecamp static frontend architecture, dynamically rendered grids for federated items (tracks, activities, listener avatars) can inject hundreds of `<img>` tags simultaneously. This massively bottlenecks the network and delays main thread interactivity.
**Action:** Always include `loading="lazy"` on dynamically injected `<img>` tags in this application's federated lists to prevent initial load congestion.

## 2024-07-09 - Debouncing Search Inputs
**Learning:** In the Tunecamp static frontend, rapid DOM updates via `innerHTML` replacement (such as regenerating the entire track grid during search filtering) cause significant main thread blocking. Always debounce high-frequency event listeners (like text inputs) that trigger these full DOM rebuilds.
**Action:** Always implement debouncing on text input event handlers (like `oninput`) when they trigger heavy DOM manipulation functions.
