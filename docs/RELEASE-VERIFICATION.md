# RecallOps release verification

Verified locally on September 9, 2026. Repository: [Sree24-ui/RecallOps](https://github.com/Sree24-ui/RecallOps), private. Owner and sole authored commit identity: `Sree24-ui <245315421+Sree24-ui@users.noreply.github.com>`.

## Verdict

**NOT_READY for the full live hackathon release.** The local application and controlled Judge workflow are implemented and verified. A server-side Anakin API key is still missing, so live application Search/Scraper extraction, Wire execution and signed monitoring delivery cannot yet be verified. No public deployment or submission has occurred.

## Implemented

The new workspace contains an evidence-first React/Vinext interface with inventory and CSV review, investigation progress, four exact assessment states, field-by-field case evidence, source versions, persisted quarantine, staff tasks, acknowledgment, HTML remedy packets, hold/sale/customer CSVs, monitoring history, integration health and local settings.

D1/SQLite migrations create the required records and enforce immutable audit events. The matching engine evaluates typed inclusion/exclusion trees deterministically. Server-side Anakin adapters implement Search, async Scraper extraction, Amazon Wire read enrichment, paused monitor creation/run/history and raw-body signed webhook processing. Judge Mode runs 24 clearly labeled samples through real matching and persistence; a synthetic A/B notice demonstrates reassessment.

The final review added regressions for serial truncation, fabricated dates, exclusion-tree conflicts, incomplete discovery, and repeated monitor refreshes that could otherwise erase a source conflict. These conditions now reject extraction or require review. Quarantine is never automatically released.

## Files

| Area | Main files |
| --- | --- |
| Workspace and setup | `RecallOps.code-workspace`, `package.json`, lockfile, `.env.example`, `wrangler.jsonc`, `vite.config.ts` |
| User interface | `app/page.tsx`, `app/globals.css`, `app/layout.tsx` |
| Deterministic engine | `lib/core/rules.ts`, `csv.ts`, `enrichment.ts`, `limits.ts`, `text.ts` |
| Provider and workflow | `lib/server/anakin.ts`, `workflow.ts`, `store.ts`, `security.ts`, `api.ts`, `events.ts` |
| API and exports | `app/api/workspace/route.ts`, `app/api/webhook/route.ts`, `app/api/export/route.ts` |
| Persistence | `db/schema.ts`, `drizzle/0000_condemned_gauntlet.sql`, Drizzle metadata |
| Samples and evaluation | `fixtures/`, `public/sample-inventory.csv`, `scripts/` |
| Verification | `tests/`, `playwright.config.ts`, `docs/evaluation.json`, `docs/dependency-audit.json`, `docs/screenshots/` |
| Documentation | `README.md`, `ARCHITECTURE.md`, `DEMO.md`, `SECURITY.md`, `SUBMISSION.md`, `docs/` |

This is a new repository: no existing RecallGuard source was supplied. Starter UI primitives are included as dependencies/source, not represented as separately authored contributor commits.

## Commands and results

| Command / check | Observed result |
| --- | --- |
| `npm ci` / dependency installation and lock resolution | Dependencies installed and version lock committed |
| `npm run db:generate` | Schema generation succeeded; final schema has no pending generated changes |
| `npm run db:migrate` | Local D1 migration applied successfully |
| `RECALLOPS_URL=http://localhost:3001 npm run seed` / Judge seed | Reproducible sample workflow persisted; unchanged imports are idempotent |
| `npm run lint` | Passed for app, server, scripts and tests |
| `npm run typecheck` | Passed |
| `npm test` | **82 passed, 1 skipped, 0 failed** (83 total) |
| `npm run evaluate` | **45/45** controlled labeled combinations matched |
| `npm run build` | Production build passed; Vinext emits a non-failing static route-classification warning |
| `npm start -- --port 3001` | Built worker served successfully using the migrated local persistent database |
| `npm run test:e2e` against built worker | **4 passed**; final run duration recorded below |
| `npm audit --json` | **0 known vulnerabilities** across all severity levels |
| Screenshot inspection | Actual desktop case, mobile Judge entry and HTML packet inspected |

Tests cover normalization, rule logic, date/serial evidence, missing/conflicting facts, quarantine/export filtering, CSV bounds/formulas, URL restrictions, prompt injection, redaction, source/audit persistence, event replay, adapter polling/retry/outage behavior, and body-size limits. Browser tests exercise Judge cases, acknowledgment, downloads, controlled change, integration health, CSV import, mobile navigation and invalid API/webhook requests.

Lint excludes unmodified vendored UI primitives and the generated mobile hook because of starter-specific rule errors. TypeScript checks them. Live-provider contract responses in adapter tests are synthetic fixtures following the researched API documentation.

## Measured evaluation

See [EVALUATION.md](EVALUATION.md) and [the complete measured data](evaluation.json). Forty-five controlled combinations produced affected precision 1.0, recall 1.0, zero false positives and zero false negatives. The needs-review rate was 17/45 (37.78%). Mean matcher runtime was approximately 0.0348 ms in the recorded run. One curated rule extraction passed schema/grounding checks.

These are controlled matcher results, not live extraction accuracy, real-world recall coverage, business validation or production reliability. Evaluation used zero Anakin calls; cache hit rate and credit consumption were not measured.

## Live Anakin evidence

[Recorded preflight evidence](recallops-preflight-evidence.json) captures three successful connected-tool calls: one Search and fresh CPSC and INIU URL scrapes on September 9, 2026. The source URLs, times and available provider timings are preserved. No job IDs or credit values were invented when absent.

Those calls used the connected Anakin tool, not this application's REST adapter. The UI correctly reports the missing application key; Judge Mode is labeled `CONTROLLED_DEMO_FIXTURE` and creates no provider-success rows. Wire catalog discovery identified an actual read action, but no live Wire product action or monitor was executed.

## Remaining credentials and manual steps

1. In the repository run `cp .env.example .dev.vars`. Set `ANAKIN_API_KEY` locally in `.dev.vars`, keep it private, and restart the server.
2. Run Investigation, then inspect Anakin health and source evidence for real successful Search/Scraper calls. Do not treat key configuration alone as success. Run the gated live test with `ANAKIN_API_KEY` securely set in the process environment and `RUN_LIVE_ANAKIN=1 npm run test:live`.
3. Verify one actual Wire enrichment. Live monitoring delivery also needs an authorized HTTPS deployment, `PUBLIC_BASE_URL`, `OPERATOR_TOKEN`, and the provider-generated per-monitor signing secret. Creating a real monitor and Run now may consume credits; recurring monitors start paused.
4. GitHub Actions is provided as [a template](github-checks.yml). The current sign-in has repository permission but lacks `workflow` scope; [activation](DEPLOYMENT.md#github-checks) requires the owner's interactive authorization. No CI run is claimed.

Current scope is CPSC/INIU, at most eight product groups per live investigation, a single local operator and bounded best-effort background event processing. Production authentication, tenant isolation and a durable queue remain necessary before public business use. Source semantic completeness cannot be proven by exact-excerpt checks; uncertain formats, boolean extraction and differing source logic are conservative review cases. HTML packets are provided instead of unverified PDF generation. No automatic external claim, message, disposal, payment or submission is performed.

## Exact Judge steps

1. Start the app using README setup and open `http://localhost:3001` (or the printed local URL).
2. Click **Run RecallOps Judge Demo**. Inspect **INIU-001**: affected, seven resolved fields and a persisted quarantine.
3. Open Inventory and inspect **INIU-002** (excluded serial), **INIU-003** (missing serial, needs review), and **INIU-004** (Woot exclusion).
4. Download **Action packet**. Open **Quarantine & actions** and download the hold list. Acknowledgment does not put the quarantined unit into the sale export.
5. Open **Monitoring**, run **controlled change A → B**, and inspect **MON-001** changing from excluded to needs review with its source snapshots and audit event.
6. Open **Anakin health** to see the actual integration state and the distinction between controlled evidence and live provider execution.

The automated Judge workflow completed in approximately 1.5 seconds, with all four production browser tests completing in 3.7 seconds in the recorded run. This demonstrates application execution time, not an independently measured human presentation time. The six-step script is designed for a presentation under three minutes.

Screenshots contain only sample inventory. The local test database also contains one explicitly named E2E import sample; a fresh Judge seed has 24 units. Runtime database files, keys, build outputs, test traces and dependencies are ignored by Git.
