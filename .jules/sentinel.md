## 2025-02-27 - [XSS in inline event handlers]
**Vulnerability:** XSS inside the string literal of an inline event handler in index.html (onclick="...").
**Learning:** HTML entity decoding occurs before inline JavaScript executes in an attribute. Therefore `&#039;` is decoded back into `'` and can break out of a JS string literal, making `escapeHtml` insufficient for defending against XSS in this context.
**Prevention:** Avoid dynamic interpolations within inline JS attributes. Instead store data using `data-*` attributes and retrieve them safely via `this.getAttribute(...)`.

## 2025-02-27 - [URI-based XSS in federated media links]
**Vulnerability:** URI-based XSS through federated data returned by the API (like avatar URLs, image covers, and instance URLs). These are assigned to `href` or `src` attributes. A malicious API payload could provide a `javascript:` or `vbscript:` URL which, when clicked, triggers code execution.
**Learning:** `escapeHtml` only escapes HTML characters (e.g. `<`, `>`, `"`, `'`) but does not neutralize malicious URI schemes. Furthermore, when dealing with federated networks, `data:` URIs might be legitimately used for cover images and should be conditionally allowed while blocking `javascript:`/`vbscript:`. The use of `new URL()` with a base domain correctly normalizes and validates the protocol.
**Prevention:** Always implement a strict URL sanitization function (e.g. `sanitizeUrl(urlStr, allowData = false)`) that blocks potentially dangerous protocols (`javascript:`, `vbscript:`) before passing values to `escapeHtml` or rendering them in the DOM.
