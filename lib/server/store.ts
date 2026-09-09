import { sha256 } from './security';
export const now = () => new Date().toISOString();
export const id = () => crypto.randomUUID();
export type Row = {
  id: string;
  created_at: string;
  payload: string;
  [k: string]: unknown;
};
export class Store {
  constructor(public db: D1Database) {}
  async all(sql: string, args: unknown[] = []): Promise<Row[]> {
    return (
      await this.db
        .prepare(sql)
        .bind(...args)
        .all<Row>()
    ).results;
  }
  async first(sql: string, args: unknown[] = []): Promise<Row | null> {
    return this.db
      .prepare(sql)
      .bind(...args)
      .first<Row>();
  }
  stmt(sql: string, args: unknown[] = []) {
    return this.db.prepare(sql).bind(...args);
  }
  async run(sql: string, args: unknown[] = []) {
    return this.stmt(sql, args).run();
  }
  insert(table: string, values: Record<string, unknown>) {
    const keys = Object.keys(values);
    return this.stmt(
      `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
      Object.values(values),
    );
  }
  audit(entityId: string, eventType: string, payload: unknown) {
    return this.insert('audit_events', {
      id: id(),
      created_at: now(),
      entity_id: entityId,
      event_type: eventType,
      payload: JSON.stringify(payload),
    });
  }
  async boot() {
    await this.run(
      'INSERT OR IGNORE INTO organizations (id,created_at,payload) VALUES (?,?,?)',
      ['local', now(), JSON.stringify({ name: 'RecallOps local workspace' })],
    );
    await this.run(
      'INSERT OR IGNORE INTO users (id,created_at,payload,org_id) VALUES (?,?,?,?)',
      ['operator', now(), JSON.stringify({ name: 'Local operator' }), 'local'],
    );
  }
  async saveSource(
    url: string,
    markdown: string,
    metadata: Record<string, unknown>,
  ) {
    let doc = await this.first('SELECT * FROM source_documents WHERE url=?', [
      url,
    ]);
    if (!doc) {
      const docId = id();
      await this.run(
        'INSERT OR IGNORE INTO source_documents (id,created_at,payload,url) VALUES (?,?,?,?)',
        [docId, now(), JSON.stringify({ title: metadata.title }), url],
      );
      doc = await this.first('SELECT * FROM source_documents WHERE url=?', [
        url,
      ]);
    }
    const hash = await sha256(markdown);
    let version = await this.first(
      'SELECT * FROM source_versions WHERE document_id=? AND content_hash=?',
      [doc!.id, hash],
    );
    const existingVersion = !!version;
    if (!version) {
      const versionId = id();
      await this.run(
        'INSERT OR IGNORE INTO source_versions (id,created_at,payload,document_id,content_hash) VALUES (?,?,?,?,?)',
        [
          versionId,
          now(),
          JSON.stringify({
            ...metadata,
            url,
            markdown,
            retrievedAt: now(),
            schemaVersion: '1',
          }),
          doc!.id,
          hash,
        ],
      );
      version = await this.first(
        'SELECT * FROM source_versions WHERE document_id=? AND content_hash=?',
        [doc!.id, hash],
      );
      await this.audit(version!.id, 'source.version_preserved', {
        url,
        contentHash: hash,
      }).run();
    }
    return {
      version: version!,
      cached: existingVersion,
    };
  }
}
export const payload = <T = Record<string, unknown>>(r: Row): T =>
  JSON.parse(r.payload) as T;
