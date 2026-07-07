## 2025-02-27 - [XSS in inline event handlers]
**Vulnerability:** XSS inside the string literal of an inline event handler in index.html (onclick="...").
**Learning:** HTML entity decoding occurs before inline JavaScript executes in an attribute. Therefore `&#039;` is decoded back into `'` and can break out of a JS string literal, making `escapeHtml` insufficient for defending against XSS in this context.
**Prevention:** Avoid dynamic interpolations within inline JS attributes. Instead store data using `data-*` attributes and retrieve them safely via `this.getAttribute(...)`.
## 2025-02-27 - [URI-based XSS in href/src attributes]
**Vulnerability:** XSS possible through malicious `javascript:` or `vbscript:` URIs supplied from federated sources injected directly into dynamic `href` or `src` attributes. `escapeHtml` does not protect against this.
**Learning:** When dealing with dynamic URLs, especially from external/federated API sources, escaping HTML entities is insufficient. The URL protocol itself must be validated.
**Prevention:** Use a dedicated URL parsing and sanitization function (e.g. `sanitizeUrl`) that strictly enforces allowed protocols (like `http:`, `https:`, and conditionally `data:image/` for specific contexts) and blocks execution vectors like `javascript:`.
