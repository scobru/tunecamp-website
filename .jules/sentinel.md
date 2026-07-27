## 2025-02-27 - [XSS in inline event handlers]
**Vulnerability:** XSS inside the string literal of an inline event handler in index.html (onclick="...").
**Learning:** HTML entity decoding occurs before inline JavaScript executes in an attribute. Therefore `&#039;` is decoded back into `'` and can break out of a JS string literal, making `escapeHtml` insufficient for defending against XSS in this context.
**Prevention:** Avoid dynamic interpolations within inline JS attributes. Instead store data using `data-*` attributes and retrieve them safely via `this.getAttribute(...)`.

## 2025-02-27 - [URI-based XSS Prevention]
**Vulnerability:** Dynamic properties like avatar URLs, image covers, and external links rendered into `src` and `href` attributes could contain `javascript:` URIs. Using `escapeHtml` does not prevent this as it only escapes HTML entities, not the protocol.
**Learning:** Using `escapeHtml` alone on a URL input to an `href` or `src` attribute is insufficient. If the URL schema is `javascript:`, it is still a valid value and will execute JS when clicked.
**Prevention:** Added a `sanitizeUrl` function to parse incoming URLs, explicitly blocking `javascript:` and `vbscript:` protocols. Also conditionally checking `data:` URI paths for images. The sanitized URL should *then* be HTML-escaped.
