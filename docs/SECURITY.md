# Security review

The review covered the implemented account, tenant, question-release, file and participant flows. It included code inspection and functional permission tests. External penetration testing and deployment assurance remain outstanding.

| Area | Implemented control | Verification or limitation |
| --- | --- | --- |
| Account sessions | Salted scrypt passwords, random login tokens stored as digests, expiry, HttpOnly/SameSite cookies, Secure in production, reset revokes active sessions | Password unit tests and browser registration/sign-in flow. SMTP delivery requires configured external service. |
| Tenant isolation | Organization filters, room ownership checks, role-based writes, server-only data projection | Browser/API tests use accounts in two separate organizations. |
| Answer privacy | Participant question DTO omits keys. Results gate correctness, scores and explanations. Read-only result token is independent of participation. | Browser test verifies manual release. API test checks never-release after session end and rejection of a results token for submission. |
| CSRF and XSS | Exact same-origin validation on mutations, SameSite cookies, output encoding, sanitized Markdown, restricted CSP, limited KaTeX rendering | Keep PUBLIC_ORIGIN exact. External proxy must preserve the expected host. |
| Storage | Parameterized SQL, foreign keys, immutable room snapshots, transactional answer uniqueness and capacity limits | Local PGlite tested. Production PostgreSQL, volume encryption, secret storage and restoration require operator verification. |
| Photography | Explicit consent, private reads and writes, re-encoding, pixel/byte caps, thumbnail creation and withdrawal, retention sweep | Integration test checks denial before consent, 1,280-pixel output, EXIF removal, scoped retrieval and deletion on withdrawal. |
| Imports | File-size caps, validation of image content, decompressed-size and entry-count limits for ZIP-based documents | Resource isolation for hostile PDF/document parsing and extensive malformed-document testing remain open. |
| Transport | TLS expected at Coolify, HSTS on API, no public database or Redis ports, no participant data in WebSocket events | Proxy behavior and multi-instance traffic need a deployment exercise. |
| Abuse controls | Account/IP rate limiting on login, registration, recovery, posting and selected uploads, Redis-backed limits in Compose | Outer proxy-level connection, bandwidth and DoS protections remain deployment responsibilities. |
| Privacy lifecycle | Account deletion, session/photo expiry, consent records, operator notices and printable private reports | Verification of external guardian records, verified retention of external backups and independent jurisdiction-specific policy review remain open. |

The session review used the [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html). Check the lockfile against the advisory database during each release using npm audit. The last dependency installation reported zero known advisories. This finding covers the package database at that time.

Question attachments use shareable UUID URLs and are instructional content. Participant photos use the private gallery. A result link grants read access to the named person's authorized report and photographs. Users on shared devices must protect their browser profile. A trusted administrator can inspect database data and restore backups. Protect database volumes and backups with host-level encryption and access controls.

