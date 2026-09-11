# RecallOps — Anakin Forge submission draft

Prepared from the Project Details fields in the supplied form screenshots. The form has not been filled or submitted.

## Project Title

RecallOps

## Project Description

RecallOps helps small electronics resellers, refurbishers, repair shops, and equipment teams decide which physical inventory units need recall action. Matching a product name is not enough: serial numbers, purchase dates, original sellers, and explicit exclusions can change eligibility.

Users import a CSV or add units manually. Anakin Search discovers official sources, and URL Scraper retrieves notices and extracts structured conditions. RecallOps preserves source versions and supporting excerpts, then uses deterministic TypeScript rules to classify each unit as affected, excluded by notice, needing review, or having no relevant notice within the investigated scope.

Affected units receive persistent internal quarantine, a case, staff tasks, and an HTML action packet. Missing facts and conflicting evidence remain review cases; acknowledgment never automatically releases a hold.

The local application includes a responsive dashboard, searchable inventory, evidence history, exports, and integration telemetry. A real four-unit investigation against CPSC and INIU notices verified the expected outcomes. Separate live checks verified Amazon Wire enrichment, paused monitor creation, and a queued manual monitoring request. Provider monitor completion and public webhook delivery remain unverified.

A clearly labeled 24-unit Judge Mode demonstrates the workflow without provider calls. RecallOps is decision support, not a product-safety guarantee. Built by sole contributor Sree24-ui.

## Project Github link

https://github.com/Sree24-ui/RecallOps

## Explain in detail where you had used Anakin in your project

Anakin supplies the live source retrieval and enrichment for RecallOps. The application makes authenticated REST calls from its server; keys stay out of browser code. Connected-tool research and controlled fixtures are recorded separately from application integration results.

Search starts with the inventory product identity and discovers candidate official recall pages. The current allowlist covers CPSC and INIU. Investigation can target a product group, with up to eight groups processed per run. Search success, timing, request counts, and returned provider identifiers appear in Anakin health.

URL Scraper retrieves official markdown through asynchronous jobs and generates structured recall data using a finite extraction schema. Inclusion and exclusion groups preserve alternatives and mandatory conditions. The adapter validates successful extraction envelopes; page retrieval alone does not count as extraction success. Local checks preserve exact original source excerpts and validate operands and limits. Invalid extraction is rejected; unresolved eligibility requires review. Deterministic code, rather than the extractor, evaluates physical-unit facts and determines assessments.

On September 11, a live investigation successfully searched and extracted both the official INIU manufacturer and CPSC notices. Four labeled sample units produced one affected result with a persisted hold, two exclusions, and one missing-serial review. Both uncached source extractions and the actual provider IDs were recorded. These observations demonstrate this specific workflow, not general extraction accuracy.

Wire discovers Amazon's am_product_details read action and retrieves marketplace context. A separate, clearly identified INIU 20,000mAh listing successfully contributed marketplace identifier, product title, brand, and product URL, with one reported credit. It was not identified as the recalled BI-B41, and no physical serial was inferred. The failed BI-B41 listing request remains visible.

Website Monitoring created a real paused monitor and accepted a manual Run now request with a queued job ID. A separate URL Scraper retrieval completed and reassessed five relevant sample records. Completion of the provider monitoring job and external signed-webhook delivery remain unverified. The implemented webhook receiver checks raw-body signatures and deduplicates signed event identities, but this is not a claim of verified public delivery.

The 24-unit Judge Mode and synthetic A-to-B notice change exercise the actual matcher, persistence, and reassessment without Anakin calls. Provider failures remain visible; the app does not silently substitute fixtures or direct scraping.

## Required external items

- GitHub star screenshot: not available yet. Capture a genuine screenshot after starring the requested repository. The form accepts one file, maximum 10 MB.
- Deployed Link: pending deployment and access verification. localhost is not a deployed link.
- Demo Video link: upload the prepared local demo video to Drive, YouTube or Loom and paste its viewable link.
- Social Media Post: publish one reviewed draft in [social drafts](docs/SOCIAL-DRAFTS.md) with the required Anakin tag, then paste that post URL.

The GitHub repository is currently private. Confirm judges can access it before submission. Personal/account details and any earlier form pages require your review.

## Prepared assets and final checklist

See [submission readiness](docs/SUBMISSION-CHECKLIST.md), [demo narration](docs/DEMO-VIDEO-SCRIPT.md) and [UI verification](docs/UI-VERIFICATION.md). The local submission pack contains the captioned video, screenshots and plain-text answer files.
