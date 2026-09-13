# Public judge portal

URL: https://recallops-nine.vercel.app/judge

The public portal gives each reviewer access to Overview, Inventory, Investigations, Exports and Settings without an owner key. It is a separate client application, not a bypass around owner authentication.

## Working features

- Manual inventory entry and CSV review/import, using the existing strict inventory schema and CSV parser. It starts empty and accepts visitor-supplied facts.
- One preserved INIU manufacturer recall rule, with its linked CPSC notice, original retrieval date, original source hash and archived Anakin retrieval identifier.
- Inclusion/exclusion inspection and new local unit comparisons through the same `decide` function as the protected workspace.
- Criterion traces, explicit unknowns and local hold flags. Reassessment never silently releases a prior hold.
- JSON evidence reports even when inventory is empty; inventory and hold CSV downloads with scope labels and spreadsheet formula protection.
- Validated tab session restoration and explicit clear confirmation. Storage is written during the user action, so an immediate reload cannot restore cleared records.

## Boundaries

The portal has no owner API, database, session-key or provider-client dependency. It does not perform fresh Anakin discovery, source retrieval, Wire enrichment, monitoring, persistent owner tasks or actions. Browser data is not uploaded as owner inventory. Unit outcomes apply only to the saved notice and visitor-supplied facts; they do not establish current complete recall coverage or safety.

`data/judge-evidence.json` was derived from the archived validated rule record and corresponding real source version. Only public notice criteria and provenance were published; no archived test inventory or private credentials were copied. The published excerpts were verified against the original source text. Source retrieval and later rule extraction timestamps are kept separate. Published serial criteria are notice data, not assigned to invented physical units.

## Verification

The public portal is covered by unit tests for input bounds, duplicate tags, evidence grounding, missing facts, monotonic holds, untrusted storage restoration and JSON/CSV exports. Browser tests exercise no-key navigation, absence of private API requests, manual assessment, reload persistence, separate visitor contexts, immediate reload after clearing, invalid CSV replacement and mobile layouts.

Owner API access must still return 401 when unauthenticated. Public portal access must never require distributing the owner key. The deployment verification and recording are kept in the separate release pack.
