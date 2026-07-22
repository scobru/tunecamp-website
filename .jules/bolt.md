## 2024-07-08 - Lazy Loading in Federated Lists
**Learning:** In the Tunecamp static frontend architecture, dynamically rendered grids for federated items (tracks, activities, listener avatars) can inject hundreds of `<img>` tags simultaneously. This massively bottlenecks the network and delays main thread interactivity.
**Action:** Always include `loading="lazy"` on dynamically injected `<img>` tags in this application's federated lists to prevent initial load congestion.

## 2024-03-01 - Native Lazy Loading for Federated Data Grid Images
**Learning:** The grid architecture for rendering federated lists (tracks, activities) in the frontend dynamically generates many `<img>` elements simultaneously. Without native lazy loading (`loading="lazy"`), this initiates an enormous number of concurrent network requests immediately on rendering, which can cause significant network bottlenecks, slowing down both the application itself and the user's browser, particularly when pulling content from multiple different instances simultaneously.
**Action:** Always include the `loading="lazy"` attribute on `<img>` tags, especially those that are generated dynamically inside grid views or long lists from federated data sources, to allow the browser to intelligently manage network requests as the user scrolls.

## 2024-05-15 - Debouncing Search Inputs to Prevent Main Thread Blocking
**Learning:** In the Tunecamp static frontend, rapid DOM updates via `innerHTML` replacement (such as regenerating the entire track grid during search filtering) cause significant main thread blocking when triggered on every keystroke.
**Action:** Always debounce high-frequency event listeners (like text inputs) that trigger full DOM rebuilds to ensure smooth typing and UI responsiveness.
