# Database and deployment

Vercel is the selected host. The application runs on Node.js 24 through Vinext, Vite and Nitro, with persistent Turso storage through `@libsql/client`. The public catalogue is deployed at https://recallops-nine.vercel.app. Hosted checks verified owner access, public data, private API rejection, no synthetic inventory, mobile layout and database integrity.

## Local database and server

Requires Node.js 24 and npm. From the repository root:

```sh
npm ci
cp .env.example .dev.vars
npm run db:migrate
npm run dev -- --port 3001
```

The local server loads the ignored `.dev.vars` file. Without a `TURSO_DATABASE_URL` override, the migration command creates `.data/recallops.sqlite`. The normal database starts empty. Add `ANAKIN_API_KEY` to `.dev.vars` for live investigations and restart the server. Public catalogue browsing needs no provider credential.

Migrations contain schema only. The migration runner records each applied file's content hash and rejects changes to an already applied migration. Each migration and its ledger entry run in one atomic write batch. The schema preserves foreign keys, indexes, unique constraints and immutable-audit triggers; the runner checks that foreign keys are enabled.

For future schema changes, edit `db/schema.ts`, run `npm run db:generate`, inspect the SQL and metadata, and append any trigger or index changes required. Never rewrite an applied migration. Back up the database before upgrades; backups can contain inventory and monitor secrets and must stay private. The earlier `.wrangler/state` database is historical local data and is not automatically imported into the new database or uploaded to Vercel.

To run a local production build instead of the development server:

```sh
NITRO_PRESET=node-server npm run build
PORT=3001 npm start
```

The Node server reads `.dev.vars` and uses the same local database. Stop an existing server before rebuilding or starting another process on its port.

## Isolated checks

```sh
npm run typecheck
npm run lint
npm test
npm run test:libsql
npm run evaluate
npm run build:vercel
```

The normal test suite uses isolated SQLite databases. `test:libsql` exercises the production database adapter against temporary local files, including transaction and audit behavior. Hosted Turso checks also passed for foreign keys, batch rollback, audit update/delete rejection, and complete rollback of verification records.

Browser tests require a separate database and explicit local fixture mode:

```sh
mkdir -p .data
TURSO_DATABASE_URL=file:.data/e2e.sqlite npm run db:migrate
NITRO_PRESET=node-server npm run build
TURSO_DATABASE_URL=file:.data/e2e.sqlite ENABLE_TEST_FIXTURES=true PORT=3002 npm start
# In another terminal:
npm run test:e2e
```

The tests create controlled records in this separate database. Do not use a business inventory database for browser tests. `ENABLE_TEST_FIXTURES` is forcibly disabled when running on Vercel or Netlify, even if set to `true` in hosting settings. Do not present a fixture run as real inventory or live provider execution.

## Vercel and Turso setup

1. Sign in to the Vercel account that owns the `recallops` project. The project has been created in the `sreepadkulkarnik-9357s-projects` scope. Direct CLI deployment can proceed independently of the optional GitHub connection.
2. Complete Turso's one-time marketplace terms acceptance as the account owner. Select only the free Starter plan for the new RecallOps database. Terms acceptance and database provisioning are distinct steps; verify that the database exists before proceeding.
3. Connect the new database to the RecallOps project and its Production environment. Do not reuse another application's database. Confirm that Vercel has server-only `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` variables.
4. Configure server-only `ANAKIN_API_KEY`, a strong `OPERATOR_TOKEN`, and the actual deployed HTTPS `PUBLIC_BASE_URL` in Vercel. Never use `NEXT_PUBLIC_` or `VITE_` prefixes for credentials. Keep fixture mode disabled.
5. Apply committed schema migrations to the new Turso database before activating the server. Do not run schema creation during request handling. Use an ignored environment file or a secure environment, never paste credentials into committed files or command examples.
6. Build the Vercel bundle, deploy it, and complete the hosted checks below. Record the verified URL and any remaining limits in `SUBMISSION.md` and the submission pack.

After linking the local checkout to the existing project, a production environment file can be pulled for the migration command:

```sh
vercel env pull .env.production.local --environment production
node --env-file=.env.production.local scripts/migrate.mjs
```

The generated environment file is ignored and private. Confirm that it points to the new RecallOps Turso database before applying migrations. Do not include it in source archives, screenshots, build uploads or submission packs.

Run release checks, then build and deploy from the linked checkout:

```sh
npm run check
npm run build:vercel
vercel deploy --prebuilt --prod
```

The hosted build selects the web libSQL driver, avoiding platform-specific native SQLite code. Local development retains the file-capable driver. Nitro produces the Build Output API bundle in `.vercel/output`, including the server function and static assets. Deploy the complete bundle so both the public catalogue and operator APIs run on Vercel. Runtime secrets come from Vercel's environment settings. `npm run build:vercel` runs the postbuild environment-file cleanup; `.vercelignore` excludes local databases, work files and credentials. No inventory is seeded or uploaded as part of deployment. The older `.openai/hosting.json` configuration is not used by this build.

## Hosted verification

- Load the public catalogue without authentication; verify source links, search, details and mobile layout.
- Confirm unauthenticated workspace reads, mutations and exports return an authorization error. Sign in with the owner access key, refresh to verify session persistence, and confirm the inventory is empty. Sign out and verify the private API rejects access again.
- Confirm test fixture actions remain disabled and disallowed origins are rejected.
- Verify the hosted database enforces foreign keys, immutable audit records and atomic rollback. Remove verification artifacts and do not leave synthetic inventory in the normal workspace.
- Check browser and server errors, then record the actual results rather than assuming a successful build proves the full application works.

Provider operations have a 240-second request budget, leaving time inside the 300-second function limit for persistence. Interrupted and unstarted scan groups retain their prior assessments and are reported as deferred. A stalled database or external provider can still cause a request to fail; this is not a durable job queue.

`OPERATOR_TOKEN` protects a single-operator prototype. Multi-tenant isolation, durable background investigation queues and cross-project provider-job coordination are further work before wider business use. Public catalogue traffic does not call Anakin or read private inventory. Actual investigations and manual monitor checks can consume Anakin credits. Monitors are created paused; scheduled activation and end-to-end signed external webhook delivery remain unverified.

## GitHub connection and checks

Follow the step-by-step [GitHub → Vercel connection guide](AUTO-DEPLOY.md). The repository is public at https://github.com/Sree24-ui/RecallOps. The owner has connected the existing Vercel project to this repository with production branch main. Direct CLI deployments remain available. Verify a connected commit's deployment before claiming automatic deploys are active.

`docs/github-checks.yml` is a workflow template, not an active GitHub Actions workflow. Local checks were executed separately. The current GitHub CLI sign-in lacks the `workflow` scope needed to add an active workflow. The owner can grant it with `gh auth refresh -h github.com -s workflow`, then move the template to `.github/workflows/checks.yml`, review its commands for the current Node/Turso build, commit and push. This requires the owner's interactive GitHub authorization. Verify the first Actions run before claiming CI passed.
