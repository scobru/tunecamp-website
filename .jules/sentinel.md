## 2025-02-27 - [XSS in inline event handlers]
**Vulnerability:** XSS inside the string literal of an inline event handler in index.html (onclick="...").
**Learning:** HTML entity decoding occurs before inline JavaScript executes in an attribute. Therefore `&#039;` is decoded back into `'` and can break out of a JS string literal, making `escapeHtml` insufficient for defending against XSS in this context.
**Prevention:** Avoid dynamic interpolations within inline JS attributes. Instead store data using `data-*` attributes and retrieve them safely via `this.getAttribute(...)`.

## 2024-07-23 - DNS-based SSRF in network crawler
**Vulnerability:** The Vercel serverless function `api/network.js` filtered IPs using regex on the URL hostname but did not perform DNS resolution prior to global `fetch()`, leaving the crawler vulnerable to DNS-based SSRF (e.g., using custom domains like `169.254.169.254.nip.io` that resolve to internal IPs).
**Learning:** URL string validation is insufficient for preventing SSRF when fetching external resources because attackers can use DNS records to point seemingly valid domain names to internal network addresses.
**Prevention:** Always perform a DNS lookup (`dns.lookup`) on the parsed hostname and explicitly check if the resolved IP address is private or reserved before initiating the HTTP request.
