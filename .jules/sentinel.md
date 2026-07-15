## 2025-02-27 - [XSS in inline event handlers]
**Vulnerability:** XSS inside the string literal of an inline event handler in index.html (onclick="...").
**Learning:** HTML entity decoding occurs before inline JavaScript executes in an attribute. Therefore `&#039;` is decoded back into `'` and can break out of a JS string literal, making `escapeHtml` insufficient for defending against XSS in this context.
**Prevention:** Avoid dynamic interpolations within inline JS attributes. Instead store data using `data-*` attributes and retrieve them safely via `this.getAttribute(...)`.
## 2024-05-18 - Prevent URI-based XSS in Federated Tunecamp Catalog
**Vulnerability:** XSS vulnerability where instances could inject malicious `javascript:` schemes into track URLs, avatars, and covers due to lack of protocol validation on parsed JSON data from external/federated API sources in `index.html` and `player.html`.
**Learning:** Even if data is escaped (`escapeHtml`), `javascript:` URIs executed via `href` or `src` attributes are evaluated by the browser.
**Prevention:** Always validate URL protocols. Specifically use `new URL(url, window.location.origin)` and filter out `javascript:`, `vbscript:`, and `file:` schemes when parsing unstrusted URLs.
