import { createClient } from '@libsql/client';
import { readdir, readFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const hosted = process.env.VERCEL === '1' || process.env.NETLIFY === 'true';
const url =
  process.env.TURSO_DATABASE_URL ||
  (hosted ? '' : 'file:.data/recallops.sqlite');
if (!url) throw Error('TURSO_DATABASE_URL is required for hosted migrations.');
if (url === 'file:.data/recallops.sqlite')
  await mkdir('.data', { recursive: true });
const client = createClient({
  url,
  authToken: process.env.TURSO_AUTH_TOKEN,
  intMode: 'number',
});
try {
  await client.execute(
    'CREATE TABLE IF NOT EXISTS recallops_migrations (name TEXT PRIMARY KEY, content_hash TEXT NOT NULL, applied_at TEXT NOT NULL)',
  );
  const files = (await readdir(new URL('../drizzle/', import.meta.url)))
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const source = await readFile(
      new URL('../drizzle/' + file, import.meta.url),
      'utf8',
    );
    const hash = createHash('sha256').update(source).digest('hex');
    const prior = await client.execute({
      sql: 'SELECT content_hash FROM recallops_migrations WHERE name=?',
      args: [file],
    });
    if (prior.rows.length) {
      if (prior.rows[0].content_hash !== hash)
        throw Error(`Applied migration changed: ${file}`);
      continue;
    }
    const statements = source
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);
    await client.batch(
      [
        ...statements.map((sql) => ({ sql, args: [] })),
        {
          sql: 'INSERT INTO recallops_migrations (name,content_hash,applied_at) VALUES (?,?,?)',
          args: [file, hash, new Date().toISOString()],
        },
      ],
      'write',
    );
    console.log(`Applied ${file}`);
  }
  const fk = await client.execute('PRAGMA foreign_keys');
  if (Number(fk.rows[0]?.foreign_keys) !== 1)
    throw Error('Database must enforce foreign keys.');
  console.log('Schema ready; no inventory seeded.');
} finally {
  client.close();
}
