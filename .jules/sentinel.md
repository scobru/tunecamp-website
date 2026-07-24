## 2025-02-27 - [XSS in inline event handlers]
**Vulnerability:** XSS inside the string literal of an inline event handler in index.html (onclick="...").
**Learning:** HTML entity decoding occurs before inline JavaScript executes in an attribute. Therefore `&#039;` is decoded back into `'` and can break out of a JS string literal, making `escapeHtml` insufficient for defending against XSS in this context.
**Prevention:** Avoid dynamic interpolations within inline JS attributes. Instead store data using `data-*` attributes and retrieve them safely via `this.getAttribute(...)`.
## 2025-02-27 - [DNS-based SSRF in network crawler]
**Vulnerability:** The `/api/network` crawler relied solely on string matching (`normOrigin`) to block internal hosts (e.g., "localhost", "127.0.0.1"), allowing attackers to supply external domains (like `localtest.me`) that resolve to private IPs, leading to SSRF.
**Learning:** String-based hostname filtering is insufficient because DNS resolution can map seemingly public domains to internal networks. The validation must occur post-resolution.
**Prevention:** Always perform DNS resolution (`dns.lookup`) and check the resolved IP against a blocklist of private/reserved ranges before initiating the HTTP request.
## 2025-02-27 - [DNS Rebinding TOCTOU in SSRF mitigation]
**Vulnerability:** A basic `dns.lookup` pre-check followed by a `fetch(url)` is vulnerable to Time-of-Check to Time-of-Use (TOCTOU) DNS Rebinding. `fetch` resolves the domain again, allowing an attacker to flip the IP from safe to internal between checks.
**Learning:** Checking the IP before fetching is insufficient if the HTTP client performs its own secondary lookup. The requested IP address must be explicitly pinned.
**Prevention:** Use lower-level modules like `http.request` / `https.request` and pass the validated `address` directly to the `host` parameter, while manually setting the `Host` header and `servername` (for SNI).
