## 2026-07-05 - Added ARIA labels to audio player controls
**Learning:** Found several icon-only buttons for critical functionality (play, pause, next track, shuffle, repeat) lacking accessible names. Without these labels, screen reader users would not know what these buttons do.
**Action:** Added descriptive `aria-label`s to these buttons. This ensures basic accessibility for the core audio player controls without altering the visual design.

## 2026-07-06 - Added keyboard accessibility to dynamic list elements
**Learning:** Found dynamically generated clickable elements (`.track-tile` and `.track-row`) which function as buttons but lacked semantic roles, tab focus, and keyboard event handlers. Without this, keyboard-only and screen reader users cannot interact with these critical elements.
**Action:** Added `role="button"`, `tabindex="0"`, descriptive `aria-label`s, `onkeydown` listeners (triggering click on Enter/Space), and `:focus-visible` styles to these dynamically injected track list items in `index.html` and `player.html`.

## 2024-05-18 - Global Media Shortcuts vs Accessibility
**Learning:** Adding global media shortcuts (like Spacebar for play/pause) is a great micro-UX improvement, but it can break accessibility and core browser behavior if not scoped correctly. For instance, spacebar should type a space in inputs or activate focused buttons.
**Action:** When implementing global keyboard shortcuts, always check `document.activeElement.tagName` and `role` to ensure the currently focused element isn't an input, textarea, button, anchor, or an element behaving like one (`role="button"`, etc.), before calling `e.preventDefault()`.
## 2024-07-11 - Missing ARIA Labels on Implicitly Unlabeled Forms
**Learning:** Found several input elements (e.g. search bars, volume sliders, filtering select dropdowns) throughout the site that lacked explicit `<label>` associations and also lacked an `aria-label`. Without either, these controls are announced poorly by screen readers, creating an accessibility barrier. Specifically, custom range inputs used for volume sliders also lacked clear focus indicators.
**Action:** When adding inputs like custom search fields or range sliders without visible labels, always include an `aria-label` explaining the input's purpose, and ensure `focus-visible` utility classes (like `focus-visible:ring-2`) are applied for keyboard accessibility.

## 2026-07-16 - Actionable Empty States for Filters
**Learning:** Found that when users search or filter for tracks and get zero results, the app only displayed a static message ("No tracks match your search."). This is a dead-end UI pattern. Without a clear path forward, users have to manually delete their input or hunt for the correct UI elements to reset the state, which increases friction.
**Action:** When implementing or refining empty states for searches or filters, always include an actionable button (e.g., "Clear Filters") that programmatically resets all relevant input values and re-triggers the list render, providing a one-click recovery path.
