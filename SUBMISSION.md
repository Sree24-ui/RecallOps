# Submission answers

Prepared for the Anakin Forge form. No form fields have been submitted.

## Project Title

RecallOps — Evidence before resale

## Project Description

RecallOps is an evidence-backed recall workspace for electronics resellers, repair teams and equipment owners. Its catalogue contains actual CPSC recall records with source links and retrieval dates. Operators import their own physical inventory and use Anakin to find and extract official notices. A deterministic TypeScript matcher compares each unit’s model, serial, variant and original purchase facts against grounded criteria. Missing or conflicting evidence requires review. Affected units receive an internal hold and staff tasks, with exportable action packets and an audit trail. React and TypeScript run through Vinext and Nitro on Node.js 24, on Vercel and Turso for persistent SQLite-compatible storage. Public notices are separate from protected inventory. The normal application contains no synthetic inventory; controlled cases are restricted to isolated local tests. Built by sole contributor Sree24-ui.

## Project Github link

https://github.com/Sree24-ui/RecallOps

## Explain where Anakin is used

Anakin provides the server-side discovery, retrieval and enrichment layer. Search submits product-identity queries and returns candidate official pages. URL Scraper uses asynchronous jobs to retrieve markdown and structured recall criteria. RecallOps validates the schema and checks the criteria against the retrieved text; the deterministic TypeScript matcher, rather than the LLM, determines each unit’s outcome. Fetched source text is preserved even when eligibility extraction fails. Source versions retain hashes, timestamps, labels and provider identifiers.

Wire discovers an Amazon product-details read action and can enrich a selected inventory record using supported listing fields. It never supplies an invented physical serial number or purchase history. Website Monitoring creates paused subscriptions, accepts manual checks, and supports independent source re-extraction and reassessment. The webhook receiver implements signature verification and event deduplication.

Historical September 10–11 application verification recorded actual Search, Scraper, Wire and paused-monitor calls. Those checks used explicitly labelled sample physical records; the sample inventory is now archived and is not presented as real customer inventory. The normal and deployed workspaces start without synthetic units. The public catalogue is sourced directly from the official CPSC API and does not claim to be an Anakin call. No provider work is simulated in the updated video. Scheduled monitoring and end-to-end external signed-webhook delivery remain unverified. Provider errors and incomplete criteria remain visible as review issues.

## Deployed Link

https://recallops-nine.vercel.app

Check DEPLOYMENT-STATUS.md in the submission pack for the verified URL and access level before submitting.

## Fields that require your action

- GitHub star screenshot: the form requests a screenshot after starring https://github.com/Anakin-Inc/anakin. No star or screenshot has been fabricated. Maximum upload size shown in the form: 10 MB.
- Demo Video link: upload `video/RecallOps-demo.webm` to Drive, YouTube or Loom, enable viewer access, test the link, then paste that hosted link. A local file path is not a submission URL.
- Social Media Post: review SOCIAL-DRAFTS.md, publish your chosen draft on LinkedIn or X with the required Anakin tag, then paste its URL. No post has been sent.
- Review your personal/team information and submit the Google Form yourself.
