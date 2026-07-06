## 2026-07-05 - Added ARIA labels to audio player controls
**Learning:** Found several icon-only buttons for critical functionality (play, pause, next track, shuffle, repeat) lacking accessible names. Without these labels, screen reader users would not know what these buttons do.
**Action:** Added descriptive `aria-label`s to these buttons. This ensures basic accessibility for the core audio player controls without altering the visual design.

## 2026-07-06 - Added Global Media Keyboard Shortcuts
**Learning:** Found that the audio players lacked global keyboard shortcuts (like Space for Play/Pause), forcing users to navigate with a mouse or tab extensively. Global keyboard shortcuts significantly improve media player accessibility and UX. It is crucial to exclude interactive fields (input, textarea) from intercepting global keys so users can still type.
**Action:** Implemented global keydown listeners for media controls on index.html and player.html, and added visible tooltips (title) to the buttons indicating these shortcuts exist. This helps discoverability and accessibility.
