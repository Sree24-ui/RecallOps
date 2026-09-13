# Security and reliability

This release supports one owner workspace. Multi-user identity, tenant isolation and durable background work remain outside its scope.

## Implemented controls

- Server-side Anakin key; ignored `.dev.vars` / environment files; browser never receives it. `npm run build` removes generated local secret files from build output before packaging.
- Non-local APIs require an authenticated owner session or an explicit bearer credential. Sign-in issues a signed 12-hour HttpOnly, SameSite=Strict cookie with Secure on HTTPS; the raw key is never saved in browser storage. Refresh preserves the session; sign-out expires its cookie. Signing-key rotation invalidates all existing sessions.
- Session creation/deletion and cookie-authenticated mutations require an exact Origin match. Failed sign-in attempts are bounded using atomic database counters keyed by a hashed edge-reported client identity. The webhook retains its independent signature boundary.
- Zod input/rule validation, strict inventory fields, CSV row/byte limits, API and webhook byte limits, approved HTTPS domains, no caller-selected REST base URL, and no direct HTTP scraping fallback.
- Provider API requests reject redirects and time out. Scraped content is untrusted and escaped in React and HTML packets. It cannot choose tool authorization, domain ranking or final status.
- Nonempty original source excerpts, operand grounding, extraction-depth limits, typed predicates, explicit ambiguity, and deterministic assessment traces. Whitespace or paired-bold presentation differences are resolved back to original bytes; ambiguous spans fail. Combined marketplace/country operands fail instead of creating misleading exclusions. A prompt-injection indicator adds a review requirement.
- Recursive removal of secret-like provider fields from public monitor output; exact configured key redaction in integration errors.
- Prepared SQL statements; transactional state changes; unique physical-unit identities and event keys; audit update/delete triggers.
- CSV formula prefix neutralization. Untrusted text is never executed as HTML, code or a spreadsheet formula by the app.
- Per-workspace persisted request limits, bounded polling and GET retry backoff. Non-idempotent provider submissions are not blindly repeated.
- Monitor HMAC-SHA256 verification over exact raw bytes using the monitor secret. Idempotency uses signed-body monitor/change IDs. The timestamp and delivery ID headers are unsigned and are not treated as replay proof.
- No automatic quarantine release or irreversible external action.

## Material limits

Evidence substring checks do not prove an extractor captured every eligibility clause or understood logic correctly. Keyword detection is not a comprehensive prompt-injection defense. The structural separation of extracted data from tools/policy is the primary protection; a human should inspect unresolved evidence.

The source host allowlist delegates actual page fetching to Anakin. It does not independently validate the provider's DNS resolution or internal redirect chain. Do not broaden it to arbitrary hosts without an egress/redirect review.

Owner sessions are a single-user access boundary. They do not provide individual accounts, MFA, per-user permissions or tenant isolation. Sign-out clears the current browser cookie; individual session revocation is not stored server-side. Rotate the owner key to invalidate all sessions, and use a dedicated identity service before expanding to multiple operators.

The background webhook handler is not a durable queue. Failed events can be retried three times. Interrupted processing claims become retryable after the configured lease expires; exhausted events remain visible for manual review. This is operator-initiated recovery, not a durable scheduler. Pause schedules before removing or changing a receiver. Live webhook behavior is not verified in this build.

Local rate limiting is per workspace, not a global provider-user scheduler. Multiple deployments can share provider quotas. Initial monitor creation has an uncertain-outcome duplicate risk because no provider idempotency contract was found; inspect the Anakin account before retrying a timed-out creation.

See `docs/dependency-audit.json` for the measured dependency audit; development-tool advisories may differ from production dependencies. The Vercel GitHub connection is configured. Production builds run local type, lint and database checks before building. GitHub Actions remains a separate, inactive template.

## Reporting

Owner: Sree24-ui. Report issues privately to the repository owner; do not publish API keys, tokens, customer records or unredacted provider responses in an issue. No private security-report endpoint is claimed to be configured.
