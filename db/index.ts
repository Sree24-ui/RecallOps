import { env } from 'cloudflare:workers';
export function getDb(): D1Database {
  if (!env.DB)
    throw Error('Database unavailable. Run npm run db:migrate first.');
  return env.DB;
}
export function config() {
  return env as Cloudflare.Env;
}
