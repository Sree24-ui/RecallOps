import { Store, id, now, payload, type Row } from './store';
import {
  decide,
  flatten,
  groundRule,
  relevant,
  type Inventory,
  type Rule,
  type Decision,
  type SourceLabel,
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
    const results = [];
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
    const affected = rows.find((r) => r.asset_tag === 'INIU-001');
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
        units: 24,
        scope:
          'INIU example and controlled notice only; no general recall search performed',
      })
      .run();
    return { assessed: 24, label: 'CONTROLLED_DEMO_FIXTURE' };
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
  async liveScan() {
    const rows = await this.store.all('SELECT * FROM inventory_items');
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
          identity.toUpperCase().includes('INIU') &&
          !urls.includes(manufacturerUrl)
        )
          urls.unshift(manufacturerUrl); // User-supplied official baseline, still fetched through Anakin.
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
        for (const url of [...new Set(urls)].slice(0, 2)) {
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
          if (
            relevantDocs.some(
              (d) => signature(d.rule) !== signature(primary.rule),
            )
          )
            conflict = true;
          for (const other of relevantDocs.slice(1))
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
          if (relevantDocs.some((d) => d.rule.unresolved.length))
            conflict = true;
          await this.assess(
            r,
            primary.rule,
            primary.versionId,
            primary.label,
            primary.url,
            { conflict },
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
    await this.anakin.monitorRun(providerId);
    const state = publicProviderData(await this.anakin.monitorGet(providerId));
    const changes = publicProviderData(
      await this.anakin.monitorChanges(providerId),
    );
    await this.store.run(
      'UPDATE monitor_subscriptions SET payload=? WHERE id=?',
      [JSON.stringify({ ...p, state, lastCheckedAt: now(), changes }), mon.id],
    );
    return this.reassessUrl(String(mon.url));
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

function logicShape(node: import('../core/rules').Logic): unknown {
  return node.kind === 'condition'
    ? { field: node.field, op: node.op }
    : { kind: node.kind, children: node.children.map(logicShape) };
}
