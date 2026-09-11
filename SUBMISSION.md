# RecallOps — Anakin Forge Hackathon submission draft

**One line:** An autonomous product-safety agent that prevents recalled products from being resold.

**Problem:** Electronics resellers manage physical units with differing serials, variants and purchase history. A recall's model name or a static regulator feed is insufficient to establish individual eligibility and remedy steps.

**Solution:** RecallOps investigates official source pages, preserves evidence, evaluates every mandatory condition with deterministic code, and converts affected results into internal quarantine, cases, staff tasks and a remedy packet.

**How it works:** Import inventory → Anakin Search discovers sources → URL Scraper extracts a versioned schema with exact excerpts → deterministic all/any/exclusion matching → persisted hold/review actions → source monitoring and reassessment. Wire enriches inventory context from returned marketplace listing fields without inferring a physical serial.

**Anakin products:** Search, URL Scraper, Wire and Website Monitoring adapters are implemented and tested. Actual application REST calls retrieved and extracted both official notices, enriched a separate marketplace sample through Amazon Wire, and created a paused monitor with a queued manual run. Signed external monitoring delivery and provider check completion are unverified. See docs/live-verification.json for observed evidence and limits.

**Technical architecture:** React/Vinext, TypeScript, Zod, Cloudflare-compatible route handlers, local D1/SQLite, prepared statements, immutable audit triggers, raw-body HMAC verification and signed-body event deduplication. The engine's explanations come directly from evaluation traces.

**Innovation:** Unit-level eligibility and evidence-preserving actions close the gap between discovering a notice and holding the correct physical inventory. The INIU example demonstrates why exact serials and manufacturer channel exclusions matter.

**Scalability:** Group investigations by product identity, cache versioned source content, maintain per-notice evidence and reassess only relevant units. Production queueing, distributed quota coordination and tenant isolation remain future work.

**Business viability:** Potential per-organization subscription for small resale and refurbishment teams. Pricing, willingness to pay and customer validation have not been tested; no market or revenue claims are made.

**Social impact:** Intended to reduce recalled electronics returning to circulation and make recall response traceable. No measured injury-prevention or customer outcomes are claimed.

**Demo:** Follow DEMO.md. The 24-unit Judge Mode is clearly controlled; the A/B synthetic notice demonstrates persisted reassessment. Review docs/EVALUATION.md for the measured controlled dataset results and their limits.

**Repository:** https://github.com/Sree24-ui/RecallOps

**Deployment:** [Add only after deployment is verified]

**Video:** [Add recorded demonstration URL]

**Team:** Sree24-ui. [Add name, role details and approved contact information]

**Honest limitations:** Current evidence domains are CPSC/INIU. No production multi-tenancy or durable background queue. No real external claim submission. Live monitoring receipt and provider check completion, deployment and user validation remain unverified. This is decision support, not legal advice, safety certification or a safe-product guarantee.
