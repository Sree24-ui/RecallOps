# Vercel release verification — September 13, 2026

Public website: https://recallops-nine.vercel.app

The complete React/TypeScript application runs through Vinext and Nitro on Node.js 24 on Vercel. The dedicated Turso Starter database is empty of physical inventory. The server region is configured as bom1 alongside the database. Anakin and operator credentials are Vercel runtime secrets. The public CPSC catalogue is independent of private workspace access.

The owner-access release replaces the misleading “Workspace unavailable” banner with a dedicated sign-in screen. A valid owner key creates a signed, 12-hour session in a Secure, HttpOnly, SameSite=Strict cookie on the deployed HTTPS site. The session survives page refresh; Settings displays its expiry and provides Sign out. The owner key is not saved in browser storage. Signed-out visitors can continue to browse the public catalogue.

Settings now shows the actual workspace connection, counts, Anakin configuration, approved source domains and investigation limits reported by the server. Configured credentials are not presented as proof of a successful provider call. Comfortable and Compact table spacing apply immediately and persist as a nonsecret browser preference. Amazon Wire enrichment is available inside the selected unit’s case, where its inputs and audit history belong. Developer setup instructions and stale deployment claims have been removed from the product flow.

Validation: 184 passing libSQL-adapter tests, one credential-gated test skipped and 21 passing browser regressions. The earlier matcher evaluation passed 45/45 controlled cases; that result is not a real-world accuracy estimate. TypeScript, lint and production builds were also checked for the release.

Hosted verification recorded at 2026-09-12T19:54:21.329Z (September 13 in Asia/Kolkata) passed catalogue search/details, the signed-out access screen, owner sign-in, secure HttpOnly session cookies, reload persistence, sign-out, display-preference persistence and mobile settings/sign-in layouts. The owner key was absent from browser storage. Anonymous private reads, cross-origin writes, cookie-authenticated mutations without an Origin header and test fixture actions were rejected. No browser page errors were observed. The hosted inventory and task counts were both zero; no synthetic production data was introduced.

Live Turso checks passed for foreign keys, atomic failed-batch rollback and audit update/delete rejection. Verification records were rolled back; no sample inventory was added.

Submission screenshots and video document the deployed application using official public data and the empty protected workspace, with captions and no paid provider calls. The pack’s media verification and manifest identify the included recording and source version. Historical Anakin verification remains labelled as tests using sample physical units. Scheduled monitoring, external signed webhook delivery and automatic GitHub deployments remain unverified or unconfigured. The GitHub repository is public and uses only Sree24-ui’s author/committer identity.
