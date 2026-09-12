import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { libsqlDatabase } from '../db/libsql';
import type { Database } from '../db/contracts';
import { Store } from '../lib/server/store';
export function testStore() {
  const useLibsql = process.env.TEST_DATABASE_DRIVER === 'libsql';
  const directory = useLibsql
    ? mkdtempSync(join(tmpdir(), 'recallops-db-'))
    : null;
  const file = directory ? join(directory, 'test.sqlite') : ':memory:';
  const sqlite = new DatabaseSync(file);
  sqlite.exec('PRAGMA foreign_keys=ON;');
  for (const file of readdirSync(new URL('../drizzle/', import.meta.url))
    .filter((f) => f.endsWith('.sql'))
    .sort())
    sqlite.exec(
      readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8'),
    );
  class Statement {
    args: unknown[] = [];
    constructor(public sql: string) {}
    bind(...args: unknown[]) {
      this.args = args;
      return this;
    }
    async all() {
      return {
        success: true,
        results: sqlite
          .prepare(this.sql)
          .all(...(this.args as (string | number | null)[])),
        meta: {},
      };
    }
    async first() {
      return (
        sqlite
          .prepare(this.sql)
          .get(...(this.args as (string | number | null)[])) ?? null
      );
    }
    async run() {
      const r = sqlite
        .prepare(this.sql)
        .run(...(this.args as (string | number | null)[]));
      return {
        success: true,
        results: [],
        meta: { changes: Number(r.changes) },
      };
    }
  }
  const db = {
    prepare: (sql: string) => new Statement(sql),
    async batch(statements: Statement[]) {
      sqlite.exec('BEGIN');
      try {
        const result = [];
        for (const s of statements) result.push(await s.run());
        sqlite.exec('COMMIT');
        return result;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  };
  const client = useLibsql
    ? createClient({ url: 'file:' + file, intMode: 'number' })
    : null;
  return {
    store: new Store(
      client ? libsqlDatabase(client) : (db as unknown as Database),
    ),
    close: () => {
      client?.close();
      sqlite.close();
      if (directory) rmSync(directory, { recursive: true });
    },
    sqlite,
  };
}
