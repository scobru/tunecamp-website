## 2025-02-27 - [XSS in inline event handlers]
**Vulnerability:** XSS inside the string literal of an inline event handler in index.html (onclick="...").
**Learning:** HTML entity decoding occurs before inline JavaScript executes in an attribute. Therefore `&#039;` is decoded back into `'` and can break out of a JS string literal, making `escapeHtml` insufficient for defending against XSS in this context.
**Prevention:** Avoid dynamic interpolations within inline JS attributes. Instead store data using `data-*` attributes and retrieve them safely via `this.getAttribute(...)`.

## 2025-07-18 - URI-based XSS via federated image covers and object URLs
**Vulnerability:** External data sourced from the federated network wasn't properly checked for malicious URL protocols (like `javascript:` and `vbscript:` schemes) before injecting them into `href` and `src` attributes. Only HTML character escaping was done. This allowed a potential attacker to create an instance and inject JavaScript through cover URLs or object URLs.
**Learning:** Even if data is escaped for HTML contexts (`&lt;`, `&gt;`), it can still result in an XSS vulnerability when injected into URL attributes because the browser executes URI schemes without checking for escaped characters. The federated nature of the network makes all instances untrusted data sources.
**Prevention:** Always parse untrusted URLs explicitly using `new URL()` and explicitly allow or deny list the protocol (e.g., blocking `javascript:`, `vbscript:`, and conditionally filtering `data:`) before passing them to the HTML escaping function.
