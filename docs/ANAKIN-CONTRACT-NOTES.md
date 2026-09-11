# Anakin integration contract notes

Official documentation research was verified September 9, 2026. The REST observations below were added September 10, 2026 from local validation reports. Three earlier connected Search/Scraper calls remain separately recorded in [preflight evidence](recallops-preflight-evidence.json); those MCP calls do not validate this application's REST behavior. See [release verification](RELEASE-VERIFICATION.md) and the [live verification report](live-verification.json) for the final verification scope and results.

## Transport and Search

The official REST base is `https://api.anakin.io/v1`; hold the key server-side and send `X-API-Key`. REST response envelopes differ from connected MCP results. [Getting started](https://anakin.io/docs/documentation/getting-started)

`POST /v1/search` accepts `prompt` and optional `limit` (default 5, maximum 20), returning `id` and `results` synchronously. Result entries contain URL/title/snippet and optional date metadata. Do not require the MCP wrapper's `count`, a confidence score, full-page text or a summary. [Search contract](https://anakin.io/docs/api-reference/search/search)

The application REST Search call succeeded on September 10 with provider ID `search_1115c4bfe83816202462e3dedc521769` (781 ms, one request). The observed Search envelope matched the direct `id`/`results` contract. This success establishes discovery transport and parsing, not the correctness of subsequent inventory decisions.

## URL Scraper

`POST /v1/url-scraper` accepts the URL and optional formats, country, browser mode, JSON extraction, output schema, saved-session reference and job webhook. Request markdown and schema-driven extraction explicitly. Submission returns HTTP 202 with `jobId` and pending status. [Submission](https://anakin.io/docs/api-reference/url-scraper/submit-scrape-job)

Poll `GET /v1/url-scraper/{id}` until completed or failed. Returned content depends on requested formats and availability; validate optional `markdown` and `generatedJson` rather than assuming they exist. Preserve provider ID, URL, cache state, duration and timestamps. Poll at 2–5 second intervals with a total deadline. [Results](https://anakin.io/docs/api-reference/url-scraper/get-job-status), [Polling guidance](https://anakin.io/docs/api-reference/polling-jobs)

The inline endpoint `/v1/url-scraper/scrape` may hold a request for roughly 90 seconds. HTTP 200 can still contain failed status; HTTP 202 timeout continuation supplies `id`, not `jobId`. Prefer the explicit async path for the app. [Inline scraper](https://anakin.io/docs/api-reference/url-scraper/scrape)

### Observed extraction compatibility, September 10

Live CPSC and manufacturer scrape jobs returned `generatedJson: { "status": "success", "data": { ... } }`. This wrapper is inside the completed scrape job; it is not the Search response envelope. An incompatible extraction schema also produced `generatedJson: { "status": "failed" }` even though page retrieval completed. The adapter checks extraction status before parsing data, and retains the provider job ID when extraction or evidence validation fails. It also accepts a direct structured rule for documented/recorded responses.

The live extractor rejected the initial recursive schema. `lib/core/extraction.ts` now sends finite `inclusionGroups` and `exclusionGroups`: alternatives between groups, all conditions required inside each group. Shared mandatory conditions must be duplicated across alternatives. The submitted schema omits `$schema`, string/array size keywords and recursive references, and represents literals with `enum` rather than `const`. These are compatibility observations from the tested provider, not a promise that all JSON Schema features are supported. Local Zod validation still enforces version, field names, sizes and group limits; compilation preserves OR-of-ANDs and explicit exclusions before deterministic grounding.

Initial extracts sometimes collapsed source whitespace or omitted paired Markdown bold delimiters. The local grounding step resolves only those presentation differences when the matching original spans agree, then stores an exact contiguous substring of the original markdown. It does not repair changed wording, case, punctuation or identifiers. Operands must still be supported by their own excerpts. Ambiguous or ungrounded output fails rather than acquiring a live assessment by assumption.

Recorded jobs include CPSC extraction `d834e1cb-4bc5-4407-9ff3-eb3e827c7d66` and manufacturer extraction `4f281ab7-9b31-4ebd-a9a8-712fc1e4775e`, both with successful provider extraction envelopes. Their initial local grounding attempts failed visibly. A later application CPSC scrape succeeded as `3f0fc665-c668-49fa-a948-5a9fb72fb65d` (6,180 ms, four requests, uncached); another successful application scrape during independent monitor reassessment was `3138e014-9ccd-4a18-9a12-5912d32c0564`. These observations do not establish the final four-case live investigation outcome; consult the live verification report.

A subsequent application investigation successfully retrieved both official sources: Search `search_361d0ee0af23e513a79238d0a3a30891`, manufacturer `b164b52e-c737-47f3-9220-89bf1ce573ea`, and CPSC `36fc68e4-3ae3-4f61-a8fe-27240eea1fdf`. That run exposed a combined retailer/country operand (`Amazon USA`) being compared with the atomic retailer `Amazon`. Retrieval success therefore did not establish correct exclusions. The compound-field guard, complete-branch guard and clarified extraction schema were then verified. The September 11 final investigation returned all four expected live outcomes: affected, excluded serial, missing-serial review, and Woot exclusion. Exact run IDs and limits are in the live verification report.

## Wire enrichment

Discover actions using `GET /v1/wire/resolve` (alias `/v1/wire/search`) with intent and catalog filters, then inspect `GET /v1/wire/catalog/{slug}`. Only allow catalog-confirmed read actions for enrichment. [Resolve](https://anakin.io/docs/api-reference/wire/search-actions), [Catalog](https://anakin.io/docs/api-reference/wire/get-catalog)

Read-only connected catalog discovery on September 9 confirmed active Amazon actions `am_search_products` and `am_product_details`. The former requires `query`, accepts page/limit/sort, and caps limit at 48; the latter requires a 10-character alphanumeric ASIN. Both list no site authentication and 1 credit per action call. No product action was executed during that preflight. These real IDs differ from illustrative `amazon.search_products` documentation examples. The catalog does not guarantee product output shape; do not assume `data.products`, currency, or locale behavior.

Submit `POST /v1/wire/task` with action ID and parameters. The async response supplies `job_id` and `poll_url`. Poll `GET /v1/wire/jobs/{id}`; honor `retry_after_ms`. Completed results include data, credits and execution time; failures contain a structured error. Validate returned data before mapping product title, brand, model, identifier, seller, variant, image, URL or specifications. Never derive a physical serial number from listing data. [Task](https://anakin.io/docs/api-reference/wire/execute-task), [Job](https://anakin.io/docs/api-reference/wire/get-job)

On September 10, the BI-B41 candidate listing lookup failed with `EXECUTION_FAILED` and an Amazon product-page HTTP 404; job `d8bd999c-a12b-4a84-bf74-5a1842873338` reported zero credits. A separate related INIU 20,000mAh listing, ASIN `B08LBV1SQS`, succeeded. It is not evidence that the recalled BI-B41 listing remains available, nor proof that the related product is recalled. The application persisted enrichment for sample asset `WIRE-DEMO-001`; job `38120d23-dad5-4299-b2b3-de68e90869d5` completed with one reported credit and 6,549 ms provider execution time.

The observed result contained a nested data object. `normalizeEnrichment(result.data)` contributed four fields, retaining these paths relative to its `data` root:

| Inventory enrichment field | Observed source path |
| --- | --- |
| Marketplace identifier | `data.data.asin` |
| Product title | `data.data.title` |
| Brand | `data.data.brand` |
| Product URL | `data.data.url` |

Model, seller, variant, image, specifications and physical serial were not demonstrated contributions in that successful call. The mapping remains defensive rather than asserting a universal Wire output schema.

## Monitoring

`POST /v1/monitors` requires URL and an interval of at least 15 minutes. Page scope can compare full-page content or schema-driven fields. REST can return the monitor's generated webhook secret; connected MCP tools redact it. Keep that secret in server-only storage. Monitor metadata includes its ID, state, cost, last check and next run. [Create](https://anakin.io/docs/api-reference/monitoring/create-monitor), [Monitor schema](https://anakin.io/docs/api-reference/monitoring)

Use GET to list/get monitors; PUT to update. Control endpoints are POST `/v1/monitors/{id}/pause`, `/resume`, and **`/run`**. There is no documented REST `/run_now` route. History endpoints are `/changes` and `/snapshots`, each newest-first and limited to 200; retain application history separately. [Controls](https://anakin.io/docs/api-reference/monitoring/control-monitor), [History](https://anakin.io/docs/api-reference/monitoring/snapshots-and-changes)

No monitor was created during the September 9 preflight. On September 10 the application created a real CPSC page monitor, provider ID `7783140c-3036-4b76-8e04-2ee488221eff`, with `isActive:false` and a 1,440-minute interval. Paused creation is intentional: it proves creation without enabling recurring checks.

The application subsequently invoked `/run` successfully and recorded queued job `ce41b270-1370-45c8-b64c-2d0c04822dbe`. The captured provider state still had `lastCheckedAt:null`, including a later state check at `2026-09-10T17:30:37.711Z`; monitor completion was not established by those records. `Run now` stores the queued job separately, preserves only the provider's reported last-checked time, and then runs an independently attributed scraper reassessment. The recorded independent reassessment processed five inventory records; that count does not prove the monitor completed or that its final decisions were correct. External signed webhook delivery remains unverified.

## Webhooks and replay protection

The documented signature is `sha256=` followed by hexadecimal HMAC-SHA256 of the **exact raw body**, using the applicable secret. The timestamp is not part of signed material. Verify with constant-time comparison before parsing or acting. Direct monitor notifications use the monitor secret; registered endpoints and per-job callbacks have different secret sources. [Webhook contract](https://anakin.io/docs/api-reference/webhooks)

General notifications use an event envelope. Monitor changes have a flat payload containing type, monitor ID, change ID, changed-at time and before/after diff. Do not force monitor events into the general envelope schema. [Event payloads](https://anakin.io/docs/api-reference/webhooks/events)

The delivery ID remains stable across retries, while the timestamp header changes. Delivery is at least once. Respond within 10 seconds after durable enqueueing. Retry intervals are 1 minute, 5 minutes, 30 minutes, 2 hours and 6 hours. Network errors, 5xx, 408 and 429 can trigger retries; most other 4xx stop delivery. [Delivery behavior](https://anakin.io/docs/api-reference/webhooks)

**Security inference:** unsigned timestamp/delivery headers are insufficient replay protection. Enforce a durable unique key derived from the verified body, such as monitor ID plus change ID, and retain the delivery ID for diagnostics. A freshness check alone cannot authenticate the header timestamp. No official replay-window duration was found. Confirm relevant monitor-specific documentation before coding; the canonical alerts page was unavailable to the research reader and [official staging documentation](https://staging-app.anakin.io/docs/api-reference/monitoring/alerts) was used as corroboration, not as an API base.

## Rate limits and unresolved details

Documented limits: Search/async scrape submission 60/minute per user; inline scrape 20/minute; Wire submission 20/minute; Wire polling 60/minute across the user; Wire catalog 60/minute per IP; Wire discovery 30/minute per IP. The rate-limit table lists URL Scraper GET polling as unlimited; no monitor-endpoint limit was established. Honor Retry-After where supplied and bound retries. Do not invent rate-limit headers. [Limits](https://anakin.io/docs/documentation/rate-limits), [Errors](https://anakin.io/docs/api-reference/error-responses)

The adapter honors provider retry/poll delays through 30 seconds without shortening them. A longer delay produces a deferred failure, retaining the known job ID for diagnosis instead of retrying early. Automatically retried requests are GETs; submissions are not blindly repeated after uncertain outcomes.

No create-monitor idempotency-key contract was found. Persist intent and reconcile an uncertain submission before retrying, since blind retry could create duplicate monitors. Documentation varies on public catalog authentication and general GET polling limits; use authenticated catalog calls and the explicit Wire polling limit.

Recorded REST calls now establish Search parsing, successful page/structured retrieval, the related-listing Wire mapping, paused monitor creation and run submission. The complete four-case live investigation was verified September 11. Remaining claims require separate evidence: provider monitor completion, real source-change delivery, and receipt of an externally signed webhook at a public receiver. Extraction grounding, bounded retries, domain restrictions, secret redaction, event idempotency, source versioning and deterministic reassessment also have local automated tests; those tests do not replace external delivery verification. Final measured outcomes belong in [live verification](live-verification.json).
