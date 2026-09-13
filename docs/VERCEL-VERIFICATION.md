# Vercel release verification — September 13, 2026

Public website: https://recallops-nine.vercel.app

The app runs on Node.js 24 through Vinext/Nitro with persistent Turso storage in bom1. The public catalogue is independent of private inventory and paid provider calls. Owner sessions use signed, 12-hour Secure/HttpOnly cookies. Session refresh, sign-out, private API rejection, source policy display and mobile settings are verified.

The September 13 audit passed 191 tests in each database mode, 26 browser checks, TypeScript, lint and Node/Vercel builds. The release check suite also passed with the hosted environment flag. The controlled matcher evaluation remains 45/45; it does not measure real-world accuracy. npm audit reported no known advisories at the time checked.

The owner connected GitHub Sree24-ui/RecallOps to the existing Vercel project on main. The push of commit `3e00b0c` produced deployment `dpl_4Pvayw9Zy8JEAKbsyLMKvxJxMYZS` with source `git` and Ready status, verifying automatic deployment. The committed Vercel configuration runs type/lint/isolated database tests before its build. GitHub Actions remains an optional inactive template.

The catalogue now links to original CPSC notices for remedy instructions because the upstream API returned a mismatched remedy for INIU. Formatted recall-number search and additional CSV/session/case regressions are covered. Source refresh rejects incomplete records. See [the audit report](AUDIT-2026-09-13.md) for exact fixes and limits.

Earlier live Turso checks verified foreign keys, atomic rollback and immutable audit triggers; probes were rolled back. No synthetic production inventory was introduced and no new paid Anakin requests were made during this audit. Scheduled monitoring and external signed webhook delivery remain unverified. The latest submission manifest and hosted verification artifacts identify the final source/deployment and observed live checks.
