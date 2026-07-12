## 2026-07-05 - Added ARIA labels to audio player controls
**Learning:** Found several icon-only buttons for critical functionality (play, pause, next track, shuffle, repeat) lacking accessible names. Without these labels, screen reader users would not know what these buttons do.
**Action:** Added descriptive `aria-label`s to these buttons. This ensures basic accessibility for the core audio player controls without altering the visual design.

## 2026-07-06 - Added keyboard accessibility to dynamic list elements
**Learning:** Found dynamically generated clickable elements (`.track-tile` and `.track-row`) which function as buttons but lacked semantic roles, tab focus, and keyboard event handlers. Without this, keyboard-only and screen reader users cannot interact with these critical elements.
**Action:** Added `role="button"`, `tabindex="0"`, descriptive `aria-label`s, `onkeydown` listeners (triggering click on Enter/Space), and `:focus-visible` styles to these dynamically injected track list items in `index.html` and `player.html`.

## 2024-05-18 - Global Media Shortcuts vs Accessibility
**Learning:** Adding global media shortcuts (like Spacebar for play/pause) is a great micro-UX improvement, but it can break accessibility and core browser behavior if not scoped correctly. For instance, spacebar should type a space in inputs or activate focused buttons.
**Action:** When implementing global keyboard shortcuts, always check `document.activeElement.tagName` and `role` to ensure the currently focused element isn't an input, textarea, button, anchor, or an element behaving like one (`role="button"`, etc.), before calling `e.preventDefault()`.

## 2024-05-19 - Added ARIA labels and focus rings to form inputs
**Learning:** Found that custom-styled form controls (search inputs, filters, volume sliders) in `index.html` and `player.html` frequently relied on adjacent icons or placeholders for context rather than explicitly setting `aria-label`. Additionally, the volume sliders used `focus:outline-none` which suppressed the browser's default focus ring, making them inaccessible to keyboard users navigating via Tab.
**Action:** Consistently added `aria-label` attributes to these form controls and replaced `focus:outline-none` on interactive custom components with `focus-visible:ring-2 focus-visible:ring-primary/50 focus:outline-none` to restore a clear and matching focus indicator.
