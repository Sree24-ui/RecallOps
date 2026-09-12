import type { Client, InValue, ResultSet } from '@libsql/client';
import type { Database, DatabaseStatement, DatabaseResult } from './contracts';

function result<T = Record<string, unknown>>(
  value: ResultSet,
): DatabaseResult<T> {
  return {
    success: true,
    results: value.rows.map((row) =>
      Object.fromEntries(value.columns.map((column) => [column, row[column]])),
    ) as T[],
    meta: { changes: value.rowsAffected },
  };
}
class Statement implements DatabaseStatement {
  constructor(
    readonly client: Client,
    readonly sql: string,
    readonly args: InValue[] = [],
  ) {}
  bind(...args: unknown[]) {
    return new Statement(this.client, this.sql, args as InValue[]);
  }
  async all<T = Record<string, unknown>>() {
    return result<T>(
      await this.client.execute({ sql: this.sql, args: this.args }),
    );
  }
  async first<T = Record<string, unknown>>() {
    return (await this.all<T>()).results[0] ?? null;
  }
  async run() {
    return this.all();
  }
}
export function libsqlDatabase(client: Client): Database {
  return {
    prepare: (sql) => new Statement(client, sql),
    async batch(statements) {
      const batch = statements.map((statement) => {
        if (!(statement instanceof Statement) || statement.client !== client)
          throw Error(
            'Statements in a transaction must belong to the same database.',
          );
        return { sql: statement.sql, args: statement.args };
      });
      // Ordered and atomic: a failed statement rolls back the complete batch.
      return (await client.batch(batch, 'write')).map((value) => result(value));
    },
  };
}
