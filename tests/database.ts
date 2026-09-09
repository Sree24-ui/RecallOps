import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { Store } from '../lib/server/store';
export function testStore() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON;');
  sqlite.exec(
    readFileSync(
      new URL('../drizzle/0000_condemned_gauntlet.sql', import.meta.url),
      'utf8',
    ),
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
  return {
    store: new Store(db as unknown as D1Database),
    close: () => sqlite.close(),
    sqlite,
  };
}
