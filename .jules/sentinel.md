## 2025-02-27 - [XSS in inline event handlers]
**Vulnerability:** XSS inside the string literal of an inline event handler in index.html (onclick="...").
**Learning:** HTML entity decoding occurs before inline JavaScript executes in an attribute. Therefore `&#039;` is decoded back into `'` and can break out of a JS string literal, making `escapeHtml` insufficient for defending against XSS in this context.
**Prevention:** Avoid dynamic interpolations within inline JS attributes. Instead store data using `data-*` attributes and retrieve them safely via `this.getAttribute(...)`.

## 2024-05-27 - Sanitize Federated URLs
**Vulnerability:** The application was directly using federated URLs for `href` and `src` attributes without verifying the protocol scheme. This could allow for URI-based XSS (e.g., `javascript:`) to be injected into the DOM from malicious directory nodes.
**Learning:** Even if data comes from federated sources, it should be treated as untrusted user input. We must sanitize the URLs by verifying the protocol to block `javascript:` and `vbscript:` schemes to prevent URI-based XSS. However, be aware that `data:` URIs are legitimately supported and expected in this codebase for image covers, so they should be conditionally allowed when sanitizing image sources.
**Prevention:** Always implement a `sanitizeUrl` function to parse and validate the URL protocol against an allowlist before injecting it into `href` or `src` attributes, and ensure the sanitized output is HTML-escaped before insertion into the DOM.
