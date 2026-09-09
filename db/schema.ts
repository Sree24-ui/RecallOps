import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
const base = () => ({
  id: text('id').primaryKey(),
  createdAt: text('created_at').notNull(),
  payload: text('payload').notNull(),
});
export const organizations = sqliteTable('organizations', base());
export const users = sqliteTable('users', {
  ...base(),
  orgId: text('org_id')
    .notNull()
    .references(() => organizations.id),
});
export const inventoryImports = sqliteTable('inventory_imports', {
  ...base(),
  orgId: text('org_id')
    .notNull()
    .references(() => organizations.id),
  contentHash: text('content_hash').notNull().unique(),
});
export const inventoryItems = sqliteTable(
  'inventory_items',
  {
    ...base(),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    assetTag: text('asset_tag').notNull(),
    quarantined: integer('quarantined').notNull().default(0),
  },
  (t) => [uniqueIndex('inventory_org_asset').on(t.orgId, t.assetTag)],
);
export const salesRecords = sqliteTable('sales_records', {
  ...base(),
  itemId: text('item_id')
    .notNull()
    .references(() => inventoryItems.id),
});
export const sourceDocuments = sqliteTable('source_documents', {
  ...base(),
  url: text('url').notNull().unique(),
});
export const sourceVersions = sqliteTable(
  'source_versions',
  {
    ...base(),
    documentId: text('document_id')
      .notNull()
      .references(() => sourceDocuments.id),
    contentHash: text('content_hash').notNull(),
  },
  (t) => [uniqueIndex('source_document_hash').on(t.documentId, t.contentHash)],
);
export const recallRules = sqliteTable('recall_rules', {
  ...base(),
  versionId: text('version_id')
    .notNull()
    .references(() => sourceVersions.id),
});
export const ruleConditions = sqliteTable('rule_conditions', {
  ...base(),
  ruleId: text('rule_id')
    .notNull()
    .references(() => recallRules.id),
});
export const assessments = sqliteTable('assessments', {
  ...base(),
  itemId: text('item_id')
    .notNull()
    .references(() => inventoryItems.id),
  versionId: text('version_id').references(() => sourceVersions.id),
  status: text('status').notNull(),
});
export const assessmentEvidence = sqliteTable('assessment_evidence', {
  ...base(),
  assessmentId: text('assessment_id')
    .notNull()
    .references(() => assessments.id),
  versionId: text('version_id')
    .notNull()
    .references(() => sourceVersions.id),
});
export const cases = sqliteTable('cases', {
  ...base(),
  itemId: text('item_id')
    .notNull()
    .unique()
    .references(() => inventoryItems.id),
  acknowledged: integer('acknowledged').notNull().default(0),
});
export const caseTasks = sqliteTable('case_tasks', {
  ...base(),
  caseId: text('case_id')
    .notNull()
    .references(() => cases.id),
  status: text('status').notNull(),
});
export const quarantineActions = sqliteTable('quarantine_actions', {
  ...base(),
  itemId: text('item_id')
    .notNull()
    .references(() => inventoryItems.id),
  assessmentId: text('assessment_id')
    .notNull()
    .references(() => assessments.id),
});
export const monitorSubscriptions = sqliteTable('monitor_subscriptions', {
  ...base(),
  url: text('url').notNull().unique(),
  providerId: text('provider_id'),
});
export const monitorEvents = sqliteTable('monitor_events', {
  ...base(),
  monitorId: text('monitor_id')
    .notNull()
    .references(() => monitorSubscriptions.id),
  eventKey: text('event_key').notNull().unique(),
  status: text('status').notNull(),
});
export const integrationRuns = sqliteTable('integration_runs', {
  ...base(),
  product: text('product').notNull(),
  status: text('status').notNull(),
});
export const auditEvents = sqliteTable('audit_events', {
  ...base(),
  entityId: text('entity_id').notNull(),
  eventType: text('event_type').notNull(),
});
export const rateLimits = sqliteTable('rate_limits', {
  id: text('id').primaryKey(),
  window: integer('window').notNull(),
  count: integer('count').notNull(),
});
