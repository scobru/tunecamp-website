## 2025-02-27 - [XSS in inline event handlers]
**Vulnerability:** XSS inside the string literal of an inline event handler in index.html (onclick="...").
**Learning:** HTML entity decoding occurs before inline JavaScript executes in an attribute. Therefore `&#039;` is decoded back into `'` and can break out of a JS string literal, making `escapeHtml` insufficient for defending against XSS in this context.
**Prevention:** Avoid dynamic interpolations within inline JS attributes. Instead store data using `data-*` attributes and retrieve them safely via `this.getAttribute(...)`.

## 2025-02-27 - [URI-based XSS in federated media links]
**Vulnerability:** URI-based XSS through federated data returned by the API (like avatar URLs, image covers, and instance URLs). These are assigned to `href` or `src` attributes. A malicious API payload could provide a `javascript:` or `vbscript:` URL which, when clicked, triggers code execution.
**Learning:** `escapeHtml` only escapes HTML characters (e.g. `<`, `>`, `"`, `'`) but does not neutralize malicious URI schemes. Furthermore, when dealing with federated networks, `data:` URIs might be legitimately used for cover images and should be conditionally allowed while blocking `javascript:`/`vbscript:`. The use of `new URL()` with a base domain correctly normalizes and validates the protocol.
**Prevention:** Always implement a strict URL sanitization function (e.g. `sanitizeUrl(urlStr, allowData = false)`) that blocks potentially dangerous protocols (`javascript:`, `vbscript:`) before passing values to `escapeHtml` or rendering them in the DOM.

## 2024-07-31 - Fix XSS in Profile Release Rendering
**Vulnerability:** Cross-Site Scripting (XSS) via unescaped release properties in innerHTML inside `profile.html`. Data fetched from federated networks was directly interpolated into HTML strings.
**Learning:** `escapeHtml` and `sanitizeUrl` were not consistently applied across all files rendering federated data. `profile.html` lacked the escaping logic for lists of releases, likes, playlists, and aggregated items.
**Prevention:** Always use a helper function to escape dynamic attributes when constructing DOM elements with `innerHTML`, especially for data sourced across networks. Make sure `escapeHtml` and `sanitizeUrl` are available and applied globally or inside every file doing DOM manipulation.
