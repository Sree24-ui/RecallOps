export type DatabaseResult<T = Record<string, unknown>> = {
  success: boolean;
  results: T[];
  meta: { changes?: number };
};
export interface DatabaseStatement {
  bind(...args: unknown[]): DatabaseStatement;
  all<T = Record<string, unknown>>(): Promise<DatabaseResult<T>>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<DatabaseResult>;
}
export interface Database {
  prepare(sql: string): DatabaseStatement;
  batch(statements: DatabaseStatement[]): Promise<DatabaseResult[]>;
}
