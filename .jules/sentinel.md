## 2025-02-27 - [XSS in inline event handlers]
**Vulnerability:** XSS inside the string literal of an inline event handler in index.html (onclick="...").
**Learning:** HTML entity decoding occurs before inline JavaScript executes in an attribute. Therefore `&#039;` is decoded back into `'` and can break out of a JS string literal, making `escapeHtml` insufficient for defending against XSS in this context.
**Prevention:** Avoid dynamic interpolations within inline JS attributes. Instead store data using `data-*` attributes and retrieve them safely via `this.getAttribute(...)`.
## 2025-02-27 - [URI-based XSS in Federated Client Rendering]
**Vulnerability:** The application was vulnerable to URI-based DOM XSS because user-controlled strings (like instance URLs, profile links, or track covers fetched via federated APIs) were injected directly into `href` and `src` attributes without verifying the URL protocol.
**Learning:** `escapeHtml` does not protect against XSS when injecting strings into URI attributes (e.g. `href`, `src`), because it doesn't block dangerous schemes like `javascript:` and `vbscript:`. The URL API parser correctly extracts protocol components but requires a base URL (like `window.location.origin`) to safely handle relative paths without throwing exceptions.
**Prevention:** Always validate URL schemes before interpolating them into resource attributes. Use a `sanitizeUrl` function that parses the input and rejects `javascript:` or `vbscript:` protocols.
