# Connect GitHub to Vercel

The local workspace already has the Git remote `https://github.com/Sree24-ui/RecallOps.git` and authenticated push access as Sree24-ui. You do not need another GitHub plugin to commit and push this project. On September 13, the owner connected the existing Vercel project to `Sree24-ui/RecallOps` with production branch `main`. The project API confirms the connection. Automatic production deployment was verified with commit `3e00b0c`: Vercel reported source `git`, branch `main`, and Ready status. The steps below are retained for reconnecting if needed.

## One-time account steps

1. Sign in to the Vercel account that owns RecallOps. Open https://vercel.com/account/authentication (profile picture → Settings → Authentication).
2. Under GitHub, choose **Connect**. Sign in as **Sree24-ui** and approve the Vercel connection. If it already shows Sree24-ui, continue.
3. Open https://vercel.com/sreepadkulkarnik-9357s-projects/recallops/settings/git.
4. Choose **Connect Git Repository**, select GitHub, then **Sree24-ui/RecallOps**. If the repository is missing, follow **Configure GitHub App** and grant the Vercel GitHub app access to this repository.
5. Connect the repository to the existing `recallops` project. Use **main** as its production branch. Keep the repository root as the root directory and Node.js **24.x**.
6. Keep the existing Production secrets and Turso connection. The committed `vercel.json` supplies the build/install/output configuration. It runs the release checks before building; it does not seed inventory or migrate the production database.
7. Tell the workspace assistant that the connection is complete. We can then push a reviewed change and confirm that Vercel automatically builds that exact commit and updates https://recallops-nine.vercel.app. Check **Deployments** for its GitHub commit and Ready status.

## How updates work afterward

Edit → run checks → commit as Sree24-ui → push to main → Vercel builds → the production URL updates after a successful deployment. Other branches can produce preview deployments. A failed build leaves the existing successful deployment available. Future schema changes still require a reviewed migration before releasing code that needs it.

GitHub Actions is separate from Vercel's Git integration. An Actions workflow is not required for automatic Vercel deployments. This CLI's GitHub login lacks the `workflow` scope; `docs/github-checks.yml` remains a template. There is no need to change scopes just to connect the Vercel GitHub app.

The fallback remains an authenticated CLI release: `npm run check`, `npm run build:vercel`, then `vercel deploy --prebuilt --prod`. An automatic deployment is only verified once a Git-triggered deployment succeeds; a manual CLI deployment does not prove it.

Sources: [Vercel account connections](https://vercel.com/docs/accounts#login-methods-and-connections), [Vercel for GitHub](https://vercel.com/docs/git/vercel-for-github), [Vercel Git CLI](https://vercel.com/docs/cli/git).
