# Anakin integration contract notes

Research verified September 9, 2026. These dated provider-contract research notes informed the implemented, mocked REST adapters. Three connected Search/Scraper calls are separately recorded in [preflight evidence](recallops-preflight-evidence.json); they do not validate this application's REST behavior. See [release verification](RELEASE-VERIFICATION.md) for current implementation checks.

## Transport and Search

The official REST base is `https://api.anakin.io/v1`; hold the key server-side and send `X-API-Key`. REST response envelopes differ from connected MCP results. [Getting started](https://anakin.io/docs/documentation/getting-started)

`POST /v1/search` accepts `prompt` and optional `limit` (default 5, maximum 20), returning `id` and `results` synchronously. Result entries contain URL/title/snippet and optional date metadata. Do not require the MCP wrapper's `count`, a confidence score, full-page text or a summary. [Search contract](https://anakin.io/docs/api-reference/search/search)

## URL Scraper

`POST /v1/url-scraper` accepts the URL and optional formats, country, browser mode, JSON extraction, output schema, saved-session reference and job webhook. Request markdown and schema-driven extraction explicitly. Submission returns HTTP 202 with `jobId` and pending status. [Submission](https://anakin.io/docs/api-reference/url-scraper/submit-scrape-job)

Poll `GET /v1/url-scraper/{id}` until completed or failed. Returned content depends on requested formats and availability; validate optional `markdown` and `generatedJson` rather than assuming they exist. Preserve provider ID, URL, cache state, duration and timestamps. Poll at 2–5 second intervals with a total deadline. [Results](https://anakin.io/docs/api-reference/url-scraper/get-job-status), [Polling guidance](https://anakin.io/docs/api-reference/polling-jobs)

The inline endpoint `/v1/url-scraper/scrape` may hold a request for roughly 90 seconds. HTTP 200 can still contain failed status; HTTP 202 timeout continuation supplies `id`, not `jobId`. Prefer the explicit async path for the app. [Inline scraper](https://anakin.io/docs/api-reference/url-scraper/scrape)

## Wire enrichment

Discover actions using `GET /v1/wire/resolve` (alias `/v1/wire/search`) with intent and catalog filters, then inspect `GET /v1/wire/catalog/{slug}`. Only allow catalog-confirmed read actions for enrichment. [Resolve](https://anakin.io/docs/api-reference/wire/search-actions), [Catalog](https://anakin.io/docs/api-reference/wire/get-catalog)

Read-only connected catalog discovery confirmed active Amazon actions `am_search_products` and `am_product_details`. The former requires `query`, accepts page/limit/sort, and caps limit at 48; the latter requires a 10-character alphanumeric ASIN. Both list no site authentication and 1 credit per action call. No product action was executed. These real IDs differ from illustrative `amazon.search_products` documentation examples. The catalog does not guarantee product output shape; do not assume `data.products`, currency, or locale behavior.

Submit `POST /v1/wire/task` with action ID and parameters. The async response supplies `job_id` and `poll_url`. Poll `GET /v1/wire/jobs/{id}`; honor `retry_after_ms`. Completed results include data, credits and execution time; failures contain a structured error. Validate returned data before mapping product title, brand, model, identifier, seller, variant, image, URL or specifications. Never derive a physical serial number from listing data. [Task](https://anakin.io/docs/api-reference/wire/execute-task), [Job](https://anakin.io/docs/api-reference/wire/get-job)

## Monitoring

`POST /v1/monitors` requires URL and an interval of at least 15 minutes. Page scope can compare full-page content or schema-driven fields. REST can return the monitor's generated webhook secret; connected MCP tools redact it. Keep that secret in server-only storage. Monitor metadata includes its ID, state, cost, last check and next run. [Create](https://anakin.io/docs/api-reference/monitoring/create-monitor), [Monitor schema](https://anakin.io/docs/api-reference/monitoring)

Use GET to list/get monitors; PUT to update. Control endpoints are POST `/v1/monitors/{id}/pause`, `/resume`, and **`/run`**. There is no documented REST `/run_now` route. History endpoints are `/changes` and `/snapshots`, each newest-first and limited to 200; retain application history separately. [Controls](https://anakin.io/docs/api-reference/monitoring/control-monitor), [History](https://anakin.io/docs/api-reference/monitoring/snapshots-and-changes)

No monitor was created, checked or configured in this preflight. No receiver or live reassessment was tested.

## Webhooks and replay protection

The documented signature is `sha256=` followed by hexadecimal HMAC-SHA256 of the **exact raw body**, using the applicable secret. The timestamp is not part of signed material. Verify with constant-time comparison before parsing or acting. Direct monitor notifications use the monitor secret; registered endpoints and per-job callbacks have different secret sources. [Webhook contract](https://anakin.io/docs/api-reference/webhooks)

General notifications use an event envelope. Monitor changes have a flat payload containing type, monitor ID, change ID, changed-at time and before/after diff. Do not force monitor events into the general envelope schema. [Event payloads](https://anakin.io/docs/api-reference/webhooks/events)

The delivery ID remains stable across retries, while the timestamp header changes. Delivery is at least once. Respond within 10 seconds after durable enqueueing. Retry intervals are 1 minute, 5 minutes, 30 minutes, 2 hours and 6 hours. Network errors, 5xx, 408 and 429 can trigger retries; most other 4xx stop delivery. [Delivery behavior](https://anakin.io/docs/api-reference/webhooks)

**Security inference:** unsigned timestamp/delivery headers are insufficient replay protection. Enforce a durable unique key derived from the verified body, such as monitor ID plus change ID, and retain the delivery ID for diagnostics. A freshness check alone cannot authenticate the header timestamp. No official replay-window duration was found. Confirm relevant monitor-specific documentation before coding; the canonical alerts page was unavailable to the research reader and [official staging documentation](https://staging-app.anakin.io/docs/api-reference/monitoring/alerts) was used as corroboration, not as an API base.

## Rate limits and unresolved details

Documented limits: Search/async scrape submission 60/minute per user; inline scrape 20/minute; Wire submission 20/minute; Wire polling 60/minute across the user; Wire catalog 60/minute per IP; Wire discovery 30/minute per IP. A monitor-endpoint limit and scraper-polling limit were not established. Honor Retry-After where supplied and bound retries. Do not invent rate-limit headers. [Limits](https://anakin.io/docs/documentation/rate-limits), [Errors](https://anakin.io/docs/api-reference/error-responses)

No create-monitor idempotency-key contract was found. Persist intent and reconcile an uncertain submission before retrying, since blind retry could create duplicate monitors. Documentation varies on public catalog authentication and general GET polling limits; use authenticated catalog calls and the explicit Wire polling limit.

Remaining live checks require the server-side API key and, for webhooks, a public receiver: schema compatibility with real REST responses, actual Wire field mapping, signed webhook receipt and live reassessment. Extraction grounding, bounded retries, domain restrictions, secret redaction, event idempotency, source versioning and deterministic reassessment now have local automated tests. Mocked contracts do not establish provider compatibility.
