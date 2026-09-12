import { createClient } from '@libsql/client';
import { libsqlDatabase } from './libsql';
import type { Database } from './contracts';
let database: Database | undefined;
export function config() {
  const hosted = process.env.VERCEL === '1' || process.env.NETLIFY === 'true';
  return {
    hosted,
    ANAKIN_API_KEY: process.env.ANAKIN_API_KEY,
    OPERATOR_TOKEN: process.env.OPERATOR_TOKEN,
    PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL,
    ENABLE_TEST_FIXTURES: hosted ? 'false' : process.env.ENABLE_TEST_FIXTURES,
  };
}
export function getDb(): Database {
  if (database) return database;
  const url =
    process.env.TURSO_DATABASE_URL ||
    (config().hosted ? '' : 'file:.data/recallops.sqlite');
  if (
    !url ||
    (config().hosted &&
      (!url.startsWith('libsql://') || !process.env.TURSO_AUTH_TOKEN))
  )
    throw Error(
      'Configure the persistent database connection before opening the operator workspace.',
    );
  database = libsqlDatabase(
    createClient({
      url,
      authToken: process.env.TURSO_AUTH_TOKEN,
      intMode: 'number',
    }),
  );
  return database;
}
