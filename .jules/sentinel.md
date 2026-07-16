## 2025-02-27 - [XSS in inline event handlers]
**Vulnerability:** XSS inside the string literal of an inline event handler in index.html (onclick="...").
**Learning:** HTML entity decoding occurs before inline JavaScript executes in an attribute. Therefore `&#039;` is decoded back into `'` and can break out of a JS string literal, making `escapeHtml` insufficient for defending against XSS in this context.
**Prevention:** Avoid dynamic interpolations within inline JS attributes. Instead store data using `data-*` attributes and retrieve them safely via `this.getAttribute(...)`.
## 2025-02-27 - [URI-based XSS in dynamic href and src attributes]
**Vulnerability:** XSS possible via `javascript:` or `vbscript:` protocols when rendering unvalidated external/federated API data in `href` or `src` attributes.
**Learning:** `escapeHtml` only prevents breaking out of attributes (by encoding quotes, ampersands, etc.). It does not prevent executing arbitrary JavaScript if the attribute itself takes a URI (like `href` or `src`) and the value begins with `javascript:`.
**Prevention:** Always parse and check the protocol of dynamic URIs using `new URL()`. Block `javascript:` and `vbscript:` explicitly. Conditionally allow `data:` for images but deny it elsewhere.
