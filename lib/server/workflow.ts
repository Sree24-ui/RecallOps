import { Store, id, now, payload, type Row } from './store';
import { z } from 'zod';
import {
  decide,
  flatten,
  groundRule,
  normalize,
  normalizeField,
  normalizeModel,
  relevant,
  type Inventory,
  type Rule,
  type Decision,
  type SourceLabel,
  type Condition,
  type Logic,
} from '../core/rules';
import { sha256, safeUrl, publicProviderData } from './security';
import { Anakin } from './anakin';
import {
  demoInventory,
  fixtureMarkdown,
  iniuRule,
  officialUrl,
  manufacturerUrl,
  monitoringRule,
  monitoringTextA,
  monitoringTextB,
} from '../../fixtures/demo';
export type Assessment = Decision & {
  itemId: string;
  versionId: string | null;
  ruleId: string | null;
  label: SourceLabel | null;
  rule: Rule | null;
  sourceUrl: string | null;
};
export const investigationItemIdsSchema = z.array(z.uuid()).min(1).max(1000);
export class Workflow {
  anakin: Anakin;
  constructor(
    public store: Store,
    key?: string,
  ) {
    this.anakin = new Anakin(key, async (run) => {
      await store
        .insert('integration_runs', {
          id: id(),
          created_at: now(),
          payload: JSON.stringify(run),
          product: run.product,
          status: run.status,
        })
        .run();
    });
  }
  async import(items: Inventory[], mode: string) {
    if (!items.length) throw Error('No inventory rows');
    items = items
      .map(
        (item) =>
          Object.fromEntries(
            Object.entries(item)
              .filter(([, v]) => v !== undefined && v !== '')
              .sort(([a], [b]) => a.localeCompare(b)),
          ) as Inventory,
      )
      .sort((a, b) => a.assetTag.localeCompare(b.assetTag));
    const hash = await sha256(JSON.stringify(items));
    const existing = await this.store.first(
      'SELECT * FROM inventory_imports WHERE content_hash=?',
      [hash],
    );
    if (existing)
      return { importId: existing.id, inserted: 0, duplicate: true };
    const statements: D1PreparedStatement[] = [];
    const importId = id();
    for (const item of items) {
      const old = await this.store.first(
        'SELECT * FROM inventory_items WHERE org_id=? AND asset_tag=?',
        ['local', item.assetTag],
      );
      if (old) {
        if (
          JSON.stringify(
            Object.fromEntries(
              Object.entries(payload(old))
                .filter(([, v]) => v !== undefined && v !== '')
                .sort(([a], [b]) => a.localeCompare(b)),
            ),
          ) !== JSON.stringify(item)
        )
          throw Error(
            `Asset ${item.assetTag} already exists with different values. Use a new asset tag or resolve the record before importing.`,
          );
        continue;
      }
      statements.push(
        this.store.insert('inventory_items', {
          id: id(),
          created_at: now(),
          payload: JSON.stringify(item),
          org_id: 'local',
          asset_tag: item.assetTag,
          quarantined: 0,
        }),
      );
    }
    const inserted = statements.length;
    statements.push(
      this.store.insert('inventory_imports', {
        id: importId,
        created_at: now(),
        payload: JSON.stringify({ count: items.length, inserted, mode }),
        org_id: 'local',
        content_hash: hash,
      }),
      this.store.audit(importId, 'inventory.imported', { inserted, mode }),
    );
    await this.store.db.batch(statements);
    return { importId, inserted, duplicate: false };
  }
  async persistRule(versionId: string, rule: Rule) {
    const existing = await this.store.first(
      'SELECT * FROM recall_rules WHERE version_id=? AND payload=? ORDER BY created_at DESC LIMIT 1',
      [versionId, JSON.stringify(rule)],
    );
    if (existing) return existing.id;
    const ruleId = id();
    await this.store.db.batch([
      this.store.insert('recall_rules', {
        id: ruleId,
        created_at: now(),
        payload: JSON.stringify(rule),
        version_id: versionId,
      }),
      ...flatten(rule.conditions)
        .concat(rule.exclusions ? flatten(rule.exclusions) : [])
        .map((c) =>
          this.store.insert('rule_conditions', {
            id: id(),
            created_at: now(),
            payload: JSON.stringify(c),
            rule_id: ruleId,
          }),
        ),
    ]);
    return ruleId;
  }
  async assess(
    row: Row,
    rule: Rule | null,
    versionId: string | null,
    label: SourceLabel,
    sourceUrl: string | null,
    options: { conflict?: boolean; discoveryComplete?: boolean } = {},
  ) {
    const item = payload<Inventory>(row),
      decision = decide(item, rule, options),
      assessmentId = id();
    if (rule && options.discoveryComplete === false) {
      decision.status = 'needs_review';
      decision.reason =
        'Investigation incomplete. One or more selected official sources could not be retrieved or validated.';
    }
    const ruleId =
      rule && versionId ? await this.persistRule(versionId, rule) : null;
    const assessment: Assessment = {
      ruleId,
      ...decision,
      itemId: row.id,
      versionId,
      label: versionId ? label : null,
      rule,
      sourceUrl,
    };
    const statements = [
      this.store.insert('assessments', {
        id: assessmentId,
        created_at: now(),
        payload: JSON.stringify(assessment),
        item_id: row.id,
        version_id: versionId,
        status: decision.status,
      }),
      this.store.audit(row.id, 'assessment.completed', {
        assessmentId,
        status: decision.status,
        label,
        versionId,
      }),
    ];
    if (versionId)
      for (const trace of decision.trace)
        statements.push(
          this.store.insert('assessment_evidence', {
            id: id(),
            created_at: now(),
            payload: JSON.stringify(trace),
            assessment_id: assessmentId,
            version_id: versionId,
          }),
        );
    let caseRow = await this.store.first(
      'SELECT * FROM cases WHERE item_id=?',
      [row.id],
    );
    if (!caseRow) {
      caseRow = { id: id(), created_at: now(), payload: '{}' };
      statements.push(
        this.store.insert('cases', {
          id: caseRow.id,
          created_at: now(),
          payload: JSON.stringify({ assetTag: item.assetTag }),
          item_id: row.id,
          acknowledged: 0,
        }),
      );
    } else
      statements.push(
        this.store.stmt('UPDATE cases SET acknowledged=0 WHERE id=?', [
          caseRow.id,
        ]),
      );
    if (decision.status === 'affected' || decision.status === 'needs_review') {
      const title =
        decision.status === 'affected'
          ? 'Confirm hold and prepare manufacturer remedy'
          : 'Resolve missing or conflicting inventory evidence';
      const taskExists = await this.store.first(
        "SELECT * FROM case_tasks WHERE case_id=? AND status!='done'",
        [caseRow.id],
      );
      if (!taskExists)
        statements.push(
          this.store.insert('case_tasks', {
            id: id(),
            created_at: now(),
            payload: JSON.stringify({
              title,
              owner: 'Local operator',
              priority: decision.status === 'affected' ? 'urgent' : 'high',
              dueDate: new Date(Date.now() + 86400000)
                .toISOString()
                .slice(0, 10),
            }),
            case_id: caseRow.id,
            status: 'open',
          }),
        );
    }
    if (decision.status === 'affected') {
      statements.push(
        this.store.stmt('UPDATE inventory_items SET quarantined=1 WHERE id=?', [
          row.id,
        ]),
        this.store.insert('quarantine_actions', {
          id: id(),
          created_at: now(),
          payload: JSON.stringify({
            action: 'internal_hold',
            reason: decision.reason,
          }),
          item_id: row.id,
          assessment_id: assessmentId,
        }),
        this.store.audit(row.id, 'inventory.quarantined', { assessmentId }),
      );
    }
    await this.store.db.batch(statements);
    return { ...assessment, id: assessmentId };
  }
  async judge() {
    await this.import(demoInventory, 'CONTROLLED_DEMO_FIXTURE');
    const { version } = await this.store.saveSource(
      officialUrl,
      fixtureMarkdown,
      {
        title: iniuRule.title,
        label: 'CONTROLLED_DEMO_FIXTURE',
        authority: 'Regulator + manufacturer; curated recording',
        supportingUrls: [manufacturerUrl],
        fixture: true,
      },
    );
    const rule = groundRule(iniuRule, fixtureMarkdown);
    await this.persistRule(version.id, rule);
    const rows = await this.store.all('SELECT * FROM inventory_items');
    const results: (Assessment & { id: string })[] = [];
    for (const row of rows) {
      if (!demoInventory.some((x) => x.assetTag === row.asset_tag)) continue;
      const item = payload<Inventory>(row);
      if (item.assetTag === 'MON-001') continue;
      results.push(
        await this.assess(
          row,
          relevant(rule, item) === false ? null : rule,
          version.id,
          'CONTROLLED_DEMO_FIXTURE',
          officialUrl,
        ),
      );
    }
    const affected = rows.find(
      (r) =>
        r.id === results.find((result) => result.status === 'affected')?.itemId,
    );
    if (affected) {
      const sale = await this.store.first(
        'SELECT * FROM sales_records WHERE item_id=?',
        [affected.id],
      );
      if (!sale)
        await this.store
          .insert('sales_records', {
            id: id(),
            created_at: now(),
            payload: JSON.stringify({
              customer: 'Sample customer',
              email: 'customer@example.invalid',
              orderId: 'SAMPLE-SALE-001',
            }),
            item_id: affected.id,
          })
          .run();
    }
    await this.controlledChange('A');
    await this.store
      .audit('judge', 'judge.completed', {
        label: 'CONTROLLED_DEMO_FIXTURE',
        units: demoInventory.length,
        scope:
          'INIU example and controlled notice only; no general recall search performed',
      })
      .run();
    return {
      assessed: demoInventory.length,
      selectedItemId: affected?.id ?? results[0]?.itemId,
      label: 'CONTROLLED_DEMO_FIXTURE',
    };
  }
  async controlledChange(version: 'A' | 'B') {
    const url = 'https://recallops.invalid/controlled-notice',
      text = version === 'A' ? monitoringTextA : monitoringTextB;
    let mon = await this.store.first(
      'SELECT * FROM monitor_subscriptions WHERE url=?',
      [url],
    );
    if (!mon) {
      const monId = id();
      await this.store
        .insert('monitor_subscriptions', {
          id: monId,
          created_at: now(),
          payload: JSON.stringify({
            label: 'CONTROLLED_DEMO_FIXTURE',
            state: 'ready',
            version: 'A',
          }),
          url,
          provider_id: null,
        })
        .run();
      mon = await this.store.first(
        'SELECT * FROM monitor_subscriptions WHERE id=?',
        [monId],
      );
    }
    const { version: source } = await this.store.saveSource(url, text, {
      title: `Controlled notice ${version}`,
      label: 'CONTROLLED_DEMO_FIXTURE',
      authority: 'Synthetic test notice',
    });
    const rule = groundRule(monitoringRule(version), text);
    await this.persistRule(source.id, rule);
    const row = await this.store.first(
      'SELECT * FROM inventory_items WHERE asset_tag=?',
      ['MON-001'],
    );
    if (!row) throw Error('Run Judge Mode to load the monitoring sample first');
    const previous = await this.store.first(
      'SELECT * FROM assessments WHERE item_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1',
      [row.id],
    );
    if (previous && payload<Assessment>(previous).versionId === source.id)
      return { unchanged: true, label: 'CONTROLLED_DEMO_FIXTURE' };
    const next = await this.assess(
      row,
      rule,
      source.id,
      'CONTROLLED_DEMO_FIXTURE',
      url,
    );
    const event = {
      previous: previous ? payload<Assessment>(previous).status : null,
      current: next.status,
      previousSnapshot: previous
        ? payload<Assessment>(previous).rule?.title.endsWith('A')
          ? monitoringTextA
          : monitoringTextB
        : null,
      currentSnapshot: text,
      difference:
        version === 'B'
          ? 'Serial inclusion changes from MON200 to MON100; new mandatory batch B is missing.'
          : 'Initial controlled snapshot',
      itemId: row.id,
      assetTag: 'MON-001',
      versionId: source.id,
      label: 'CONTROLLED_DEMO_FIXTURE',
    };
    const eventKey = await sha256(
      `${mon!.id}:${source.id}:${previous?.id ?? 'initial'}`,
    );
    await this.store.db.batch([
      this.store.insert('monitor_events', {
        id: id(),
        created_at: now(),
        payload: JSON.stringify(event),
        monitor_id: mon!.id,
        event_key: eventKey,
        status: 'processed',
      }),
      this.store.stmt('UPDATE monitor_subscriptions SET payload=? WHERE id=?', [
        JSON.stringify({
          label: 'CONTROLLED_DEMO_FIXTURE',
          state: 'ready',
          version,
          lastCheckedAt: now(),
        }),
        mon!.id,
      ]),
      this.store.audit(row.id, 'monitor.reassessed', event),
    ]);
    return event;
  }
  async liveScan(itemIds?: string[]) {
    const selectedIds =
      itemIds === undefined
        ? null
        : new Set(investigationItemIdsSchema.parse(itemIds));
    const inventory = await this.store.all('SELECT * FROM inventory_items');
    const rows = selectedIds
      ? inventory.filter((r) => selectedIds.has(r.id))
      : inventory;
    if (selectedIds && rows.length !== selectedIds.size)
      throw Error('One or more selected inventory items were not found');
    if (!rows.length) throw Error('Import inventory first');
    const groups = new Map<string, Row[]>();
    const errors: string[] = [];
    for (const r of rows) {
      const x = payload<Inventory>(r);
      if (!x.brand?.trim() || !x.model?.trim()) {
        await this.assess(r, null, null, 'DEGRADED_FALLBACK', null, {
          discoveryComplete: false,
        });
        errors.push(
          `Product identity is incomplete for ${x.assetTag}; review its brand and model.`,
        );
        continue;
      }
      const key = `${x.brand} ${x.model}`;
      (groups.get(key) ?? (groups.set(key, []), groups.get(key)!)).push(r);
    }
    let count = 0;
    for (const [identity, items] of groups) {
      if (count++ >= 8) {
        for (const r of items)
          await this.assess(r, null, null, 'LIVE_ANAKIN', null, {
            discoveryComplete: false,
          });
        errors.push(
          'Investigation limit reached: remaining groups need another scoped investigation.',
        );
        continue;
      }
      try {
        const found = await this.anakin.search(
          `${identity} official product safety recall manufacturer eligibility serial number`,
        );
        const urls = found.results
          .map((x) => x.url)
          .filter((url) => {
            try {
              safeUrl(url);
              return true;
            } catch {
              return false;
            }
          })
          .sort(
            (a, b) =>
              Number(b.includes('iniushop.com')) -
              Number(a.includes('iniushop.com')),
          );
        if (
          items.every((row) => {
            const item = payload<Inventory>(row);
            return (
              normalize(item.brand ?? '') === 'INIU' &&
              normalizeModel(item.model ?? '') === normalizeModel('BI-B41')
            );
          })
        ) {
          // The user-supplied recall notices take precedence over interactive checker pages.
          // They are still freshly retrieved and extracted through Anakin.
          urls.unshift(manufacturerUrl, officialUrl);
        }
        if (!urls.length) {
          for (const r of items)
            await this.assess(r, null, null, 'LIVE_ANAKIN', null, {
              discoveryComplete: false,
            });
          errors.push(
            `No usable approved official source was found for ${identity}; review is required.`,
          );
          continue;
        }
        const documents = [];
        let retrievalFailed = false;
        for (const url of [...new Set(urls)].slice(0, 2)) {
          try {
            const doc = await this.anakin.scrape(url);
            const { version } = await this.store.saveSource(url, doc.markdown, {
              title: doc.rule.title,
              label: doc.label,
              providerId: doc.id,
              authority: url.includes('cpsc.gov')
                ? 'US regulator'
                : 'Manufacturer',
            });
            await this.persistRule(version.id, doc.rule);
            documents.push({ ...doc, versionId: version.id });
          } catch (e) {
            retrievalFailed = true;
            errors.push(
              `${url}: ${e instanceof Error ? e.message : 'Source retrieval failed'}`,
            );
          }
        }
        for (const r of items) {
          const item = payload<Inventory>(r),
            relevantDocs = documents.filter(
              (d) => relevant(d.rule, item) !== false,
            );
          if (!relevantDocs.length) {
            await this.assess(
              r,
              null,
              documents[0]?.versionId ?? null,
              documents[0]?.label ?? 'LIVE_ANAKIN',
              documents[0]?.url ?? null,
              { discoveryComplete: !retrievalFailed },
            );
            continue;
          }
          const primary = relevantDocs[0];
          let conflict = false;
          const signature = (r: Rule) =>
            JSON.stringify({
              conditions: flatten(r.conditions).map((c) => ({
                field: c.field,
                op: c.op,
                values: c.values,
                precision: c.precision,
              })),
              exclusions: r.exclusions
                ? flatten(r.exclusions).map((c) => ({
                    field: c.field,
                    op: c.op,
                    values: c.values,
                    precision: c.precision,
                  }))
                : null,
              shape: logicShape(r.conditions),
              exclusionShape: r.exclusions ? logicShape(r.exclusions) : null,
            });
          for (const other of relevantDocs.slice(1)) {
            const differs = signature(other.rule) !== signature(primary.rule);
            if (differs && linkedIniuSubset(primary, other)) {
              await this.store
                .audit(r.id, 'source.linked_subset_reconciled', {
                  policy: 'INIU_BI_B41_LINKED_CONJUNCTION_SUBSET',
                  primarySourceUrl: primary.url,
                  primaryVersionId: primary.versionId,
                  secondarySourceUrl: other.url,
                  secondaryVersionId: other.versionId,
                  secondaryClaimUrl: other.rule.claimUrl,
                  secondaryPredicates: flatten(other.rule.conditions).length,
                  decisionSource: 'primary_manufacturer_rule',
                })
                .run();
              continue;
            }
            if (differs) conflict = true;
            for (const a of flatten(primary.rule.conditions))
              for (const b of flatten(other.rule.conditions))
                if (
                  a.field === b.field &&
                  a.op === b.op &&
                  JSON.stringify(
                    a.values.map((x) => x.toUpperCase()).sort(),
                  ) !==
                    JSON.stringify(b.values.map((x) => x.toUpperCase()).sort())
                )
                  conflict = true;
          }
          if (relevantDocs.some((d) => d.rule.unresolved.length))
            conflict = true;
          await this.assess(
            r,
            primary.rule,
            primary.versionId,
            primary.label,
            primary.url,
            { conflict, discoveryComplete: !retrievalFailed },
          );
        }
      } catch (e) {
        errors.push(e instanceof Error ? e.message : 'Investigation failed');
        for (const r of items)
          await this.assess(r, null, null, 'LIVE_ANAKIN', null, {
            discoveryComplete: false,
          });
      }
    }
    await this.store
      .audit('investigation', 'investigation.completed', {
        groups: groups.size,
        itemIds: rows.map((r) => r.id),
        errors,
      })
      .run();
    return { groups: groups.size, errors };
  }
  async refreshMonitor(mon: Row) {
    const p = payload<Record<string, unknown>>(mon);
    if (p.label === 'CONTROLLED_DEMO_FIXTURE')
      return this.controlledChange('B');
    const providerId = String(mon.provider_id);
    const submitted = await this.anakin.monitorRun(providerId);
    if (submitted.success !== true || typeof submitted.jobId !== 'string')
      throw Error('Monitor run did not return a queued job ID');
    const run = {
      jobId: submitted.jobId,
      status: 'queued',
      requestedAt: now(),
    };
    await this.store.db.batch([
      this.store.stmt('UPDATE monitor_subscriptions SET payload=? WHERE id=?', [
        JSON.stringify({ ...p, run }),
        mon.id,
      ]),
      this.store.audit(mon.id, 'monitor.run_queued', run),
    ]);
    const state = publicProviderData(await this.anakin.monitorGet(providerId));
    const changes = publicProviderData(
      await this.anakin.monitorChanges(providerId),
    );
    const providerCheckedAt =
      state &&
      typeof state === 'object' &&
      'lastCheckedAt' in state &&
      typeof state.lastCheckedAt === 'string' &&
      Number.isFinite(Date.parse(state.lastCheckedAt))
        ? state.lastCheckedAt
        : null;
    const updated = {
      ...p,
      state,
      run,
      lastCheckedAt: providerCheckedAt,
      changes,
    };
    await this.store.run(
      'UPDATE monitor_subscriptions SET payload=? WHERE id=?',
      [JSON.stringify(updated), mon.id],
    );
    const reassessment = {
      ...(await this.reassessUrl(String(mon.url))),
      method: 'independent_scrape',
      completedAt: now(),
    };
    await this.store.db.batch([
      this.store.stmt('UPDATE monitor_subscriptions SET payload=? WHERE id=?', [
        JSON.stringify({ ...updated, independentReassessment: reassessment }),
        mon.id,
      ]),
      this.store.audit(
        mon.id,
        'monitor.independent_reassessment',
        reassessment,
      ),
    ]);
    return {
      queued: true,
      jobId: run.jobId,
      independentReassessment: reassessment,
      message:
        'Monitor check queued; a separate source scrape and inventory reassessment completed. Provider monitor completion has not been confirmed.',
    };
  }
  async reassessUrl(url: string) {
    const doc = await this.anakin.scrape(url);
    const { version } = await this.store.saveSource(url, doc.markdown, {
      title: doc.rule.title,
      label: doc.label,
      providerId: doc.id,
      authority: 'Official source',
    });
    await this.persistRule(version.id, doc.rule);
    let assessed = 0;
    for (const r of await this.store.all('SELECT * FROM inventory_items'))
      if (relevant(doc.rule, payload<Inventory>(r)) !== false) {
        const history = await this.store.all(
          'SELECT * FROM assessments WHERE item_id=?',
          [r.id],
        );
        // A repeated refresh must not erase an unresolved decision from another source.
        const conflict = history.some((earlier) => {
          const prior = payload<Assessment>(earlier);
          return !!prior.rule && prior.sourceUrl !== url;
        });
        await this.assess(r, doc.rule, version.id, doc.label, url, {
          conflict,
        });
        assessed++;
      }
    return { assessed, versionId: version.id };
  }
}

function logicShape(node: Logic): unknown {
  return node.kind === 'condition'
    ? { field: node.field, op: node.op }
    : { kind: node.kind, children: node.children.map(logicShape) };
}

function conjunctionPredicates(node: Logic): Condition[] | null {
  if (node.kind === 'condition') return [node];
  if (
    !node.children.length ||
    (node.kind === 'any' && node.children.length !== 1)
  )
    return null;
  const children = node.children.map(conjunctionPredicates);
  return children.some((child) => child === null)
    ? null
    : children.flatMap((child) => child!);
}

function predicateSignature(condition: Condition): string {
  const values = condition.values.map((value) =>
    condition.op === 'model_equals'
      ? normalizeModel(value)
      : normalizeField(condition.field, value),
  );
  return JSON.stringify({
    field: condition.field,
    op: condition.op,
    values: [...values].sort(),
    rangeOrder: ['date_range', 'serial_range'].includes(condition.op)
      ? values
      : null,
    precision: condition.precision ?? null,
  });
}

function normalizedLogic(node: Logic): unknown {
  return node.kind === 'condition'
    ? predicateSignature(node)
    : { kind: node.kind, children: node.children.map(normalizedLogic) };
}

function linkedIniuSubset(
  primary: { url: string; rule: Rule },
  secondary: { url: string; rule: Rule },
): boolean {
  // The linked manufacturer notice must contain the complete regulator conjunction.
  // This proof selects an existing rule; it never combines criteria across sources.
  try {
    if (
      safeUrl(primary.url) !== safeUrl(manufacturerUrl) ||
      safeUrl(secondary.url) !== safeUrl(officialUrl) ||
      safeUrl(secondary.rule.claimUrl) !== safeUrl(manufacturerUrl)
    )
      return false;
  } catch {
    return false;
  }
  for (const rule of [primary.rule, secondary.rule]) {
    if (
      normalize(rule.brand) !== 'INIU' ||
      rule.models.length !== 1 ||
      normalizeModel(rule.models[0]) !== normalizeModel('BI-B41') ||
      rule.unresolved.length
    )
      return false;
  }
  const primaryConditions = conjunctionPredicates(primary.rule.conditions);
  const secondaryConditions = conjunctionPredicates(secondary.rule.conditions);
  if (!primaryConditions || !secondaryConditions) return false;
  const primarySignatures = new Set(primaryConditions.map(predicateSignature));
  // Both rules already require the same grounded brand through relevant().
  // An explicit equality for that same subject does not add an eligibility fact.
  primarySignatures.add(
    predicateSignature({
      kind: 'condition',
      id: 'grounded-subject-brand',
      field: 'brand',
      op: 'equals',
      values: [primary.rule.brand],
      evidence: primary.rule.scopeEvidence,
    }),
  );
  const secondarySignatures = new Set(
    secondaryConditions.map(predicateSignature),
  );
  if (
    !secondaryConditions.every((condition) =>
      primarySignatures.has(predicateSignature(condition)),
    )
  )
    return false;
  const sharedFields = new Set(
    secondaryConditions.map((condition) => condition.field),
  );
  if (
    primaryConditions.some(
      (condition) =>
        sharedFields.has(condition.field) &&
        !secondarySignatures.has(predicateSignature(condition)),
    )
  )
    return false;
  return (
    secondary.rule.exclusions === null ||
    (primary.rule.exclusions !== null &&
      JSON.stringify(normalizedLogic(primary.rule.exclusions)) ===
        JSON.stringify(normalizedLogic(secondary.rule.exclusions)))
  );
}
