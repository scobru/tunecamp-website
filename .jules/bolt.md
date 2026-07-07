## 2024-07-07 - Image Lazy Loading Optimization
**Learning:** In the Tunecamp static frontend, dynamically rendered grid architectures for federated lists (tracks, activities) can cause massive network bottlenecks if images are loaded eagerly.
**Action:** Always use `loading="lazy"` on dynamically injected `<img>` tags when rendering lists from federated or external sources.
