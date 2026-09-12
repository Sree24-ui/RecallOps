# RecallOps

RecallOps helps electronics teams turn official recall evidence into decisions about individual physical units. Public recall notices describe products; your inventory supplies the actual serial number, variant and original purchase facts. Missing or conflicting facts stay in review.

[Open RecallOps](https://recallops-sree24.sreepad-1251070506.chatgpt.site) · [GitHub](https://github.com/Sree24-ui/RecallOps)

![Official CPSC recall catalogue](docs/screenshots/catalog-desktop.png)

## What you can do

- Browse and search a dated selection of real CPSC electronics recall notices, expand their published descriptions and remedies, and open the original notice.
- Open the protected operator workspace, download a blank CSV template, and import inventory you actually hold.
- Investigate selected product groups through Anakin Search and URL Scraper. Preserve source text, retrieval times, hashes and extracted criteria.
- Compare unit facts with evidence using a deterministic TypeScript matcher. Review affected, excluded, unresolved or no-notice results with an explanation.
- Maintain internal holds and staff tasks, export action packets, and manually run paused official-source monitors.

Public catalogue requests neither read the inventory database nor call paid providers. Remote inventory, task, export and mutation APIs require an operator token. Enter it in Workspace → Settings; it stays in the tab's memory. This is a single-operator prototype, not a multi-tenant service.

## Real data and its limits

`data/official-recalls.json` contains five records fetched directly from the [CPSC public recall API](https://www.cpsc.gov/Recalls/CPSC-Recalls-Application-Program-Interface-API-Information), including each API request URL and retrieval timestamp. The [official Data.gov listing](https://catalog.data.gov/dataset/recalls-api) identifies this as public data. The selection covers BenQ, INIU, Anker, Baseus and Belkin; it is a dated snapshot, not a complete or continuously refreshed recall feed.

Refresh selected notices using documented CPSC recall numbers without hyphens:

```sh
npm run catalog:refresh -- 26647 26135 25338 25248 25061
```

The refresh rejects ambiguous records and non-notice URLs, then writes the actual returned fields. It creates no physical inventory. Update and rebuild the site to publish a newer snapshot.

The normal workspace starts empty. The prior local demonstration units have been archived with audit history preserved. Synthetic cases remain only as explicit regression-test fixtures, disabled in normal and hosted execution. The normal CSV download contains headers only. No fake serial, customer, purchase or inventory count is inferred from public data.

## Run locally

Requires Node.js 24 and npm.

```sh
git clone https://github.com/Sree24-ui/RecallOps.git
cd RecallOps
npm ci
npm run db:migrate
cp .env.example .dev.vars
npm run dev -- --port 3001
```

Open the URL printed by the server. `/` is the official catalogue; `/workspace` is the operator interface. SQLite data persists in the ignored `.wrangler/state` directory. Open `RecallOps.code-workspace` in a compatible editor to use the project workspace.

Set `ANAKIN_API_KEY` in the ignored `.dev.vars` file for live investigations, then restart. The catalogue needs no key. Keep `ENABLE_TEST_FIXTURES=false` for normal use.

| Configuration | Purpose |
| --- | --- |
| `ANAKIN_API_KEY` | Server-side Anakin REST credential |
| `OPERATOR_TOKEN` | Required bearer token for remote operator APIs |
| `PUBLIC_BASE_URL` | Actual deployed HTTPS origin for monitor callbacks |
| `ENABLE_TEST_FIXTURES` | Explicit isolated-test opt-in; false in production |

## How it runs

React 19 renders the responsive interface. TypeScript runs both UI and deterministic eligibility rules. Vinext/Vite builds the React application into a Cloudflare Worker; Cloudflare D1 stores inventory, source versions, assessments, tasks and append-only audits. Drizzle generates schema migrations. Sites supplies the hosted Worker and D1 bindings.

Anakin Search discovers candidate pages. URL Scraper retrieves source text and proposes structured criteria, which must pass schema and evidence-grounding checks. Wire can enrich a user-selected Amazon listing without inventing physical serials. Monitoring can create a paused subscription and request checks. Anakin does not make the final eligibility decision.

The live workflow permits specific CPSC recall notices and approved INIU manufacturer sources, with eight product groups and two source documents per group. These limits and approved hosts are explicit policy configuration in `lib/core/runtime-policy.ts`. Deferred groups keep their existing assessments. Candidate notice links are traceable to `data/source-links.json`; they are freshly retrieved, not used as automatic eligibility answers.

The narrowly scoped INIU linked-notice reconciliation is a documented safety rule. It requires identical shared predicates and preserves manufacturer exclusions; other conflicting logic needs review. Removing this evidence rule as if it were a fake value would weaken matching safety.

## Validation

```sh
npm run typecheck
npm run lint
npm test
npm run evaluate
npm run build
```

Browser regressions use a separate database and explicit fixture mode:

```sh
npx wrangler d1 migrations apply DB --local --persist-to work/e2e-state
npx wrangler dev --config dist/server/wrangler.json --persist-to work/e2e-state --port 3002 --inspector-port 9230 --var ENABLE_TEST_FIXTURES:true
# In another terminal:
npm run test:e2e
```

Tests include raw source validation failures, deferred scans, archived inventory, test-mode isolation, public data provenance, imports, source grounding, task conflicts, signature validation and browser interactions. Controlled matcher evaluations are not claims of live extraction accuracy. The live integration test is credential-gated and makes paid provider requests only when explicitly run.

## Deployment and submission

The hosting manifest contains logical D1 binding metadata and a Site project ID. Secrets are configured through hosting environment settings, never committed. `npm run build` removes development environment files generated by the build tool before packaging. Only schema migrations are deployed; no local database or test inventory is uploaded.

See [submission answers](SUBMISSION.md) and [demo walkthrough](DEMO.md). The separate submission ZIP includes the captioned WebM video, screenshots, copy-ready answers and a clean source archive. Video upload, social posting, the GitHub star screenshot and the final form submission are separate user actions.

## Boundaries

“No relevant notice found” does not establish safety. Holds are internal inventory actions and are never silently released by acknowledgement or reassessment. No claim, customer message, purchase or disposal confirmation is submitted automatically. Source retrieval can fail; rejected extractions preserve the fetched evidence and remain review cases. Scheduled monitor activation and end-to-end signed external webhook delivery have not been verified.

Historical Anakin verification used clearly labelled sample physical units and real provider calls; those observations remain documented in `docs/live-verification.json` and are not represented as real customer inventory or current production outcomes.

Built and committed by **Sree24-ui**, the sole repository contributor.
