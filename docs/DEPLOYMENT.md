# Database and deployment

## Local database

`npm run db:migrate` applies committed Drizzle migrations to the local D1 emulator. The first migration creates 19 tables, foreign keys, unique constraints, query indexes and immutable-audit triggers. Migrations contain schema only. Seed through the running application's Judge endpoint with `RECALLOPS_URL=http://localhost:3001 npm run seed`.

For future schema changes: edit `db/schema.ts`, run `npm run db:generate`, inspect the new SQL and matching metadata, and append any new bounded trigger/index migration required. Never rewrite an applied migration. Back up local `.wrangler/state/` before upgrades or destructive experiments; backups can contain inventory and monitor secrets and must stay private.

The first migration's extra trigger/index statements are intentional and tested against SQLite. Future generated migrations should preserve those triggers and indexes. Run typecheck, unit/integration tests, build and E2E after migration changes.

## Build

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

The build emits a Cloudflare-compatible server under `dist/server/` and static client assets. `npm start -- --port 3001` uses Wrangler's local runtime against the built server configuration. Apply local migrations before exercising it. Stop an existing compiled server before rebuilding or reinstalling dependencies, then restart it; the old process can retain obsolete asset filenames. Production deployment has not been executed or verified.

## Future public deployment — requires separate authorization/configuration

1. Select a supported host with persistent D1 storage and assign the DB binding. `.openai/hosting.json` declares the logical DB capability only; its existence does not mean a Site was registered or deployed.
2. Configure server-only `ANAKIN_API_KEY`, `OPERATOR_TOKEN` and the real HTTPS `PUBLIC_BASE_URL`. Never use `NEXT_PUBLIC_` or `VITE_` prefixes for secrets.
3. Apply committed database migrations through the host's migration process before the server version is activated. Do not create schema during request handling.
4. Add production authentication, tenant isolation, security headers and a durable investigation/event queue before handling business records publicly. Review SECRET storage/encryption and rate-limit coordination.
5. Verify a real Search/Scraper investigation, actual Wire output shape and credit reporting. Create a paused live monitor, verify its ID/state and signed webhook receipt, then test idempotency and extraction-driven reassessment.
6. Review recurring cost before activating monitor schedules. Anakin monitors are created paused by this application; Run now is explicit and can consume provider credits.
7. Run browser and security checks against the deployed instance, then record the verified URL and known limits in SUBMISSION.md.

Do not publish a fixture run as live execution. GitHub repository publication is separate from hosting the application.

## GitHub checks

`docs/github-checks.yml` contains a checks workflow pinned to official action release references. It is a template, not an active GitHub Actions workflow. Local checks were executed separately.

The current GitHub CLI sign-in can publish repository content but does not have the `workflow` scope needed to add an active workflow. To enable CI, the repository owner can grant that scope with `gh auth refresh -h github.com -s workflow`, then move the template to `.github/workflows/checks.yml`, commit and push. This requires the owner's interactive GitHub authorization. Verify the first run in Actions before claiming CI passed.
