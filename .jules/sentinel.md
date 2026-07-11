## 2025-02-27 - [XSS in inline event handlers]
**Vulnerability:** XSS inside the string literal of an inline event handler in index.html (onclick="...").
**Learning:** HTML entity decoding occurs before inline JavaScript executes in an attribute. Therefore `&#039;` is decoded back into `'` and can break out of a JS string literal, making `escapeHtml` insufficient for defending against XSS in this context.
**Prevention:** Avoid dynamic interpolations within inline JS attributes. Instead store data using `data-*` attributes and retrieve them safely via `this.getAttribute(...)`.

## 2025-02-27 - [URI-based XSS in dynamic attributes]
**Vulnerability:** XSS via malicious URI schemes (`javascript:`, `vbscript:`) injected into dynamic `href` and `src` attributes generated from federated data in `index.html` and `player.html`.
**Learning:** `escapeHtml` is insufficient for `href` and `src` attributes as it does not prevent malicious protocols. External URLs from federated APIs must be sanitized.
**Prevention:** Use a `sanitizeUrl` function that parses the URL via `new URL(url, window.location.origin)` and blocks dangerous protocols while conditionally allowing `data:` URIs for specific assets like image covers.
