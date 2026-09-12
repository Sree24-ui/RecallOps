# Vercel release verification — September 12, 2026

Public website: https://recallops-nine.vercel.app

The complete React/TypeScript application runs through Vinext and Nitro on Node.js 24 on Vercel. The dedicated Turso Starter database is empty of physical inventory. The server region is configured as bom1 alongside the database. Anakin and operator credentials are Vercel runtime secrets. The public CPSC catalogue is independent of private workspace access.

Validation: 178 passing libSQL-adapter tests, one credential-gated test skipped, 17 passing browser regressions against the compiled Node build, 45/45 controlled matcher evaluations, TypeScript, lint and production builds. Hosted checks passed for catalogue search/details, mobile layout, owner token connection, rejected anonymous private APIs, rejected cross-origin writes and disabled test actions. No browser page errors were observed.

Live Turso checks passed for foreign keys, atomic failed-batch rollback and audit update/delete rejection. Verification records were rolled back; no sample inventory was added.

The updated video records the deployed application using official public data and the empty protected workspace, with captions and no paid provider calls. Historical Anakin verification remains labelled as tests using sample physical units. Scheduled monitoring, external signed webhook delivery and automatic GitHub deployments remain unverified or unconfigured. The GitHub repository is public and uses only Sree24-ui’s author/committer identity.
