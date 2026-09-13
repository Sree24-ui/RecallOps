# Anakin Forge — copy-ready answers

No form fields have been submitted. Use the public judge URL below for reviewer access.

## Project Title

RecallOps — Evidence before resale

## Project Description

RecallOps helps electronics resellers, repair teams and equipment owners turn official recall evidence into decisions about physical units. The public judge portal opens without an account or owner key. Reviewers can inspect a dated official INIU notice and its preserved Anakin extraction, add their own real unit facts manually or by CSV, compare those facts with the same deterministic TypeScript matcher used by the owner workspace, and download evidence JSON, inventory results and local hold CSVs. Missing facts remain in review. Judge inventory stays in the visitor’s browser tab; the portal does not make fresh provider calls or access owner data. A separate public catalogue contains five dated CPSC API records. The protected owner workspace supports fresh Anakin investigations, persistent inventory, internal holds and tasks, action packets and audit history. React and TypeScript run through Vinext, Vite and Nitro on Node.js 24, deployed on Vercel with Turso storage. No physical inventory is prefilled or invented. Built by sole contributor Sree24-ui.

## Project Github link

https://github.com/Sree24-ui/RecallOps

## Explain in detail where you used Anakin

Anakin powers the protected owner workspace’s discovery and extraction layer. Search submits product-identity queries to find candidate official pages. URL Scraper retrieves source text and structured recall criteria through asynchronous jobs. RecallOps validates the schema and grounds the criteria against the retrieved text before its deterministic TypeScript matcher determines unit outcomes. Source versions retain retrieval timestamps, content hashes and provider identifiers; rejected or conflicting extractions remain review issues.

Wire can enrich a selected unit with supported fields from a user-selected Amazon product listing. It does not invent a physical serial number or purchase history. Website Monitoring supports creating paused subscriptions, requesting manual checks and independent source re-extraction. The webhook receiver validates signatures and deduplicates events. Scheduled monitoring and end-to-end signed external webhook delivery remain unverified.

The public /judge portal makes this evidence workflow accessible without sharing the owner credential. It publishes one preserved INIU manufacturer rule and a linked CPSC notice from the earlier actual Anakin integration checks. Judges can inspect the source retrieval date, provider identifier, original source hash, inclusion and exclusion criteria, then run the same matcher on their own unit facts and download scoped reports. These are new local comparisons against saved evidence, not fresh Anakin calls. The public CPSC catalogue is fetched directly from the CPSC API and is not presented as Anakin output.

Historical September 10–11 verification used real Search, Scraper, Wire and paused-monitor calls with explicitly labelled test units. Those units remain archived and are not loaded in production or in the public judge portal. The submission walkthrough shows the current public portal without fabricated inventory or simulated provider activity.

## Deployed Link

https://recallops-nine.vercel.app/judge

Judges can open Overview, Inventory, Investigations, Exports and Settings without a key. The owner-only fresh-provider workspace remains at /workspace; do not put the owner key in this form.

## GitHub star screenshot

Upload your genuine screenshot showing https://github.com/Anakin-Inc/anakin starred by your account. The form allows one file up to 10 MB. No screenshot or star has been fabricated.

## Demo Video link

Upload video/RecallOps-demo.webm from this pack, or your own narrated recording of the current portal, to Drive, YouTube or Loom. Enable viewer access, verify it in a signed-out browser, and paste the resulting sharing URL here. A local path or ZIP link is not the required hosted video link.

## Social Media Post

Publish your reviewed post on LinkedIn or X, tag Anakin as required, and paste the actual post URL. See SOCIAL-DRAFTS.md. This field remains pending until you publish; no post was sent automatically.

Review any personal/team details on earlier form pages and submit the form yourself.
