## 2025-02-27 - [XSS in inline event handlers]
**Vulnerability:** XSS inside the string literal of an inline event handler in index.html (onclick="...").
**Learning:** HTML entity decoding occurs before inline JavaScript executes in an attribute. Therefore `&#039;` is decoded back into `'` and can break out of a JS string literal, making `escapeHtml` insufficient for defending against XSS in this context.
**Prevention:** Avoid dynamic interpolations within inline JS attributes. Instead store data using `data-*` attributes and retrieve them safely via `this.getAttribute(...)`.
## 2025-02-27 - [URI-based XSS in external federated data]
**Vulnerability:** External inputs like URLs and image covers from federated instances were directly interpolated into `href` and `src` attributes without protocol sanitization, allowing `javascript:` payloads to execute JS via XSS.
**Learning:** `escapeHtml` is not sufficient to prevent URI-based XSS because it only blocks HTML attribute injection (like breaking out of the `href` via `" onerror="..."`), but does not block malicious schemes (`javascript:`). Both must be used together: `escapeHtml(sanitizeUrl(url))`.
**Prevention:** Implement and use a robust URL parsing utility using `new URL()` to validate the protocol against an allow/blocklist, being mindful to allow legit `data:` URIs when applicable for image sources.
