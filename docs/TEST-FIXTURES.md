# Isolated regression fixtures

These are test instructions only. They are disabled in the normal and hosted workspace. Use a separate database with `ENABLE_TEST_FIXTURES=true`. Synthetic test cases do not represent real owned units.

# Judge demonstration

Create an isolated database and start an explicit local test server:

```sh
mkdir -p .data
TURSO_DATABASE_URL=file:.data/judge-isolated.sqlite npm run db:migrate
npm run build
TURSO_DATABASE_URL=file:.data/judge-isolated.sqlite ENABLE_TEST_FIXTURES=true PORT=3002 npm start
```

Open http://localhost:3002/workspace, select Judge Mode and click **Run RecallOps Judge Demo**. The normal README server does not enable this button. This is a controlled offline replay, visibly labeled on every source and assessment. It exercises the real database and deterministic engine.

| Unit | Expected outcome | Evidence-based reason |
| --- | --- | --- |
| INIU-001 | affected; quarantined | BI-B41, included serial 000G21, black, Amazon US, within period, seller not Woot |
| INIU-002 | excluded_by_notice | 000J21 is outside the exhaustive four-serial set |
| INIU-003 | needs_review | Required serial is missing |
| INIU-004 | excluded_by_notice | Woot is an explicit manufacturer exclusion |
| ELEC-001–019 | no_relevant_notice_found | Unrelated to the limited demo notice set; no global safety/search claim |
| MON-001, A | excluded_by_notice | Synthetic notice includes a different serial |
| MON-001, B | needs_review | Serial becomes included but a new batch condition is missing |

Inspect INIU-001's case: final status, immediate action, identity, seven evaluated fields, exact excerpts, authority and timestamp, source label and timeline. Download the HTML action packet. In Quarantine & actions, the CSV hold list contains INIU-001 and sale exports exclude it even after acknowledgment.

Open Monitoring and run **A → B**. Compare stored snapshots and previous/current decisions. The new event creates an inspectable assessment and review task. Repeating B without a source change is idempotent.

Open Anakin health. Judge Mode does not create provider-success rows. With a server-side key configured, use Investigation for live calls. Real monitor creation starts paused; use Run now to queue a provider check and independently scrape/reassess the source. A queued job is not evidence of completed provider monitoring. A public webhook receiver is required for external delivery.

The official recall URL uses `/2026/`, but the notice date is December 5, 2025 and its ID is 26-135. Original sale facts must not be replaced by reseller acquisition dates. Manufacturer contact hours differ from CPSC hours; the packet avoids inventing a single reconciled time.

No real customer contact, claim, disposal or payment occurs. The sample customer address uses `.invalid`. Check `docs/RELEASE-VERIFICATION.md` for measured browser-demo runtime and current live verification gaps.

## Historical live verification — September 10–11, 2026

Historical Search/Scraper, Wire and paused-monitor checks used labelled sample physical units. Those units are archived outside the normal database. Their source IDs and exact observations remain in [the historical verification report](RELEASE-VERIFICATION.md). They are not current real inventory or proof that scheduled external delivery works. The normal demo is documented in [DEMO.md](../DEMO.md).
