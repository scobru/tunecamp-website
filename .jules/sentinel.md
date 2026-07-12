## 2025-02-27 - [XSS in inline event handlers]
**Vulnerability:** XSS inside the string literal of an inline event handler in index.html (onclick="...").
**Learning:** HTML entity decoding occurs before inline JavaScript executes in an attribute. Therefore `&#039;` is decoded back into `'` and can break out of a JS string literal, making `escapeHtml` insufficient for defending against XSS in this context.
**Prevention:** Avoid dynamic interpolations within inline JS attributes. Instead store data using `data-*` attributes and retrieve them safely via `this.getAttribute(...)`.

## 2025-02-27 - [URI-based XSS in federated content]
**Vulnerability:** External URLs (e.g., image covers, links to instances) parsed directly from the federated network without sanitization. `javascript:` or `vbscript:` schemes could trigger XSS when users interacted with or loaded these URLs.
**Learning:** Federated resources and URLs provided via external APIs must be treated as untrusted input. Escaping HTML entities (`escapeHtml`) prevents DOM XSS but does not protect against URI-based XSS in `href` or `src` attributes.
**Prevention:** Always parse and sanitize URLs before dynamically injecting them into attributes. Ensure schemes are validated and blocked if they are executable (`javascript:`, `vbscript:`). Conditionally allow `data:` URIs if explicitly expected for things like images, but default to block. Use `new URL()` with a base origin for parsing relative paths securely.
