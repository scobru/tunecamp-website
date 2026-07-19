## 2025-02-27 - [XSS in inline event handlers]
**Vulnerability:** XSS inside the string literal of an inline event handler in index.html (onclick="...").
**Learning:** HTML entity decoding occurs before inline JavaScript executes in an attribute. Therefore `&#039;` is decoded back into `'` and can break out of a JS string literal, making `escapeHtml` insufficient for defending against XSS in this context.
**Prevention:** Avoid dynamic interpolations within inline JS attributes. Instead store data using `data-*` attributes and retrieve them safely via `this.getAttribute(...)`.

## 2025-02-27 - [URI-based XSS in federated links]
**Vulnerability:** URI-based Cross-Site Scripting (XSS) vulnerability caused by injecting unverified, external URLs directly into `href` and `src` attributes. An attacker could provide a `javascript:` URL to execute malicious code.
**Learning:** HTML escaping (`escapeHtml`) only prevents breaking out of the attribute structure (e.g. escaping quotes), but it does not sanitize malicious URI schemes. For dynamically generated attributes like `href` or `src` sourced from external federated APIs, validating the protocol is necessary.
**Prevention:** Always sanitize URLs by explicitly verifying the protocol before using them in the DOM. Allow only safe protocols like `http:`, `https:`, and conditionally `data:` where appropriate (e.g., for cover images). The output of the sanitizer should subsequently be passed to `escapeHtml` before insertion into the DOM to ensure attributes cannot be injected.
