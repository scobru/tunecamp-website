## 2026-07-05 - Added ARIA labels to audio player controls
**Learning:** Found several icon-only buttons for critical functionality (play, pause, next track, shuffle, repeat) lacking accessible names. Without these labels, screen reader users would not know what these buttons do.
**Action:** Added descriptive `aria-label`s to these buttons. This ensures basic accessibility for the core audio player controls without altering the visual design.

## 2026-07-06 - Added keyboard accessibility to dynamic list elements
**Learning:** Found dynamically generated clickable elements (`.track-tile` and `.track-row`) which function as buttons but lacked semantic roles, tab focus, and keyboard event handlers. Without this, keyboard-only and screen reader users cannot interact with these critical elements.
**Action:** Added `role="button"`, `tabindex="0"`, descriptive `aria-label`s, `onkeydown` listeners (triggering click on Enter/Space), and `:focus-visible` styles to these dynamically injected track list items in `index.html` and `player.html`.
