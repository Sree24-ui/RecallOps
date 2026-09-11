# RecallOps release verification

Verified September 11, 2026. Private repository: [Sree24-ui/RecallOps](https://github.com/Sree24-ui/RecallOps). Owner and authored commit identity: `Sree24-ui <245315421+Sree24-ui@users.noreply.github.com>`.

## Verdict

**READY_WITH_LIMITATIONS for the local hackathon demonstration.** The controlled Judge workflow and a real four-unit Search/Scraper investigation are verified. The compiled app displays live evidence, persists the affected unit's quarantine and excludes it from sale exports. Actual Wire enrichment, paused monitor creation, queued Run now and independent source reassessment are recorded. Provider monitor completion and external signed webhook delivery remain unverified. No public deployment or submission occurred.

## Implementation and changed files

The workspace contains inventory/manual/CSV import, scoped investigation, four exact assessment states, evidence tables, source versions, persisted cases/quarantine/tasks, acknowledgment, HTML action packets, CSV/JSON exports, monitoring history, integration health and local settings. D1/SQLite migrations create 19 tables with immutable audit events. The 24-unit Judge fixture runs through the actual matcher and database.

This update adds `lib/core/extraction.ts` for the finite provider schema and observed success/data envelope. `lib/core/rules.ts` validates original source spans, preserves serial/date precision, rejects blank or combined marketplace/country evidence and prevents model/serial requirements from being bypassed by alternatives. `lib/server/anakin.ts` handles Workers-compatible redirect rejection, provider retry delays, failure IDs and credit telemetry. `lib/server/workflow.ts` and `app/api/workspace/route.ts` support scoped scans, preserve evidence on partial failure and distinguish queued monitor requests from independent reassessment. `app/page.tsx` exposes these behaviors. Corresponding core, extraction, adapter, workflow and browser regressions were added under `tests/`.

`scripts/clean-build-secrets.mjs` runs after the build to remove local environment files copied by the Cloudflare preview plugin. Runtime secrets are loaded explicitly from the ignored root file.

Documentation updates cover README, architecture, security, demo, submission draft, contract/deployment notes and measured reports. New sample-only screenshots show the live case, integration health and action packet. This is a new repository; no earlier RecallGuard source was supplied.

## Commands and results

| Check | Observed result |
| --- | --- |
| `npm ci` | Clean install and lockfile verified in initial setup |
| `npm run db:migrate` | Local migration passed; repeated in a fresh isolated test database for final browser checks |
| `npm run typecheck` / `npm run lint` | Passed |
| `npm test` | **161 passed, 1 skipped, 0 failed**; skipped test requires explicit live flag |
| Gated live Search test | Passed with local server-only key on September 10 |
| `npm run evaluate` | **45/45** controlled combinations matched on September 11 |
| `npm run build` | Passed; non-failing Vinext static route-classification warning |
| `npm start -- --port 3001 --env-file <absolute-repository-path>/.dev.vars` | Compiled worker served the existing persistent workspace with key configured |
| `RECALLOPS_URL=http://localhost:3002 npm run test:e2e` | **5 passed in 5.7 seconds** against compiled worker and a fresh isolated database |
| Compiled live browser check | All four live outcomes, packet, hold/sale exports and zero browser errors verified |
| `npm audit --json` | **0 known vulnerabilities**, recorded September 10 |
| Visual inspection | Live desktop case, health and printable HTML packet inspected; controlled mobile screenshot retained |

Browser tests cover Judge cases, acknowledgment, exports, controlled A/B reassessment, CSV import, mobile navigation, malformed requests and a mocked scoped-scan submission. The mocked selector check does not count as a live provider call. Lint excludes unmodified starter UI primitives and the starter mobile hook; TypeScript checks them.

The [evaluation](EVALUATION.md) measures controlled matcher behavior: affected precision/recall 1.0, zero false positives/negatives, 17/45 needs-review cases, mean matching time about 0.0412 ms. It used no provider calls and does not establish live extraction accuracy or real-world recall coverage.

## Live Anakin evidence

The [machine-readable report](live-verification.json) contains exact timestamps, provider IDs, requests, sample outcomes and limits. These are application REST calls, separate from the [September 9 connected-tool preflight](recallops-preflight-evidence.json).

The final investigation completed at `2026-09-11T03:51:04.963Z`. Search ID `search_09505b147d8feaf184c8ee08a1f10b57` succeeded. Manufacturer job `936dddde-eade-400e-8fb8-0eddcf12a2bd` and CPSC job `be8164fa-29e4-43c2-984e-7810e1cc9e3f` both returned validated, uncached extraction. The investigation used 13 HTTP requests, including polling; Search/Scraper credit totals were not returned.

| Sample | Final live outcome | Hold |
| --- | --- | --- |
| INIU-001, serial 000G21 | affected | Persisted |
| INIU-002, serial 000J21 | excluded_by_notice | None |
| INIU-003, serial missing | needs_review | None |
| INIU-004, original seller Woot | excluded_by_notice | None |

Both official sources remain preserved. A narrow, audited comparison permits the linked manufacturer rule when it contains every identical regulator condition; the grounded subject brand already requires identical brand equality. Manufacturer conditions and exclusions remain intact. Other differences, unsupported alternatives and partial retrievals require review. No affected result is hard-coded.

Wire job `38120d23-dad5-4299-b2b3-de68e90869d5` ran `am_product_details` on a separate related INIU 20,000mAh listing for `WIRE-DEMO-001`, contributing identifier, title, brand and product URL, with one reported credit. It returned no physical model or serial. The retired BI-B41 candidate listing returned a visible 404; this distinct listing is not used as proof of BI-B41 identity.

Actual monitor `7783140c-3036-4b76-8e04-2ee488221eff` remains paused. Run now returned queued job `ce41b270-1370-45c8-b64c-2d0c04822dbe`. A separately attributed source scrape reassessed five relevant sample records. A subsequent provider state read had no last-checked timestamp and no changes; completion and external delivery are not claimed.

Live QA found and corrected schema incompatibility, combined retailer/country operands and incomplete alternative branches. Failed attempts remain in the audit/verification history; only the final outcomes above are the validated result. Extraction can vary, and exact excerpts cannot prove all source clauses were understood.

## Remaining manual steps and limits

The local key is configured in ignored `.dev.vars` with permission mode 600. It is excluded from Git, reports, screenshots and packaged build output. A final byte-level scan checks indexed files and compiled assets without displaying the key. Another clone needs its own local key using README setup.

External signed monitoring delivery needs separately authorized HTTPS hosting, `PUBLIC_BASE_URL`, `OPERATOR_TOKEN` and the provider's monitor-specific secret. Recurring schedules remain paused. Production authentication, tenant isolation and a durable queue are not implemented. Source scope is CPSC/INIU; live runs process at most eight product groups, with explicit group selection available. Packets are HTML, not PDF.

GitHub Actions remains a [template](github-checks.yml): the current CLI sign-in lacks `workflow` scope. The owner must grant that scope interactively before activating it as described in [deployment notes](DEPLOYMENT.md#github-checks). No CI run is claimed. No claim, customer message, disposal confirmation, payment or hackathon form was submitted.

## Exact Judge demonstration

1. Start the app using README setup, open its local URL and click **Run RecallOps Judge Demo**.
2. Inspect **INIU-001**: affected, seven controlled criteria resolved, quarantine persisted.
3. Open Inventory and inspect **INIU-002**, **INIU-003** and **INIU-004** for excluded serial, missing-serial review and Woot exclusion.
4. Download **Action packet** and the Quarantine **hold list**. Acknowledgment never releases the hold or admits INIU-001 to the sale export.
5. In Monitoring run **controlled change A → B**; inspect MON-001 changing from excluded to needs review with snapshots and audit history.
6. Open **Anakin health** to inspect actual calls. Judge Mode adds no provider-success rows. To repeat live verification, select the four-unit INIU/BI-B41 group in Investigation; this consumes real provider requests.

The script is designed for under three minutes; browser automation measures application execution, not an independent human presentation. Running Judge again replaces the latest sample assessments with clearly labeled controlled results. The current main local workspace retains the successful live assessments; final regression tests used a separate database. Screenshots contain sample inventory only.
