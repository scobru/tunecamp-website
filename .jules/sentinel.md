## 2025-02-27 - [XSS in inline event handlers]
**Vulnerability:** XSS inside the string literal of an inline event handler in index.html (onclick="...").
**Learning:** HTML entity decoding occurs before inline JavaScript executes in an attribute. Therefore `&#039;` is decoded back into `'` and can break out of a JS string literal, making `escapeHtml` insufficient for defending against XSS in this context.
**Prevention:** Avoid dynamic interpolations within inline JS attributes. Instead store data using `data-*` attributes and retrieve them safely via `this.getAttribute(...)`.
## 2025-02-27 - [URI-based XSS in dynamic attributes]
**Vulnerability:** XSS via URI schemes (javascript:, vbscript:) in dynamically injected href and src attributes across federated UI components.
**Learning:** Even when `escapeHtml` is used, malicious URLs with javascript: schemes can execute XSS when clicked or loaded. Sanitization must explicitly block dangerous protocols before HTML escaping.
**Prevention:** Always validate and sanitize URLs using `new URL()` with a base origin, explicitly blocking 'javascript:', 'vbscript:', and unverified 'data:' URIs, and then HTML-escape the sanitized output.
