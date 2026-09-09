import test from 'node:test';
import assert from 'node:assert/strict';
import { testStore } from './database';
import { Workflow, type Assessment } from '../lib/server/workflow';
import { payload } from '../lib/server/store';
import {
  baseItem,
  fixtureMarkdown,
  iniuRule,
  manufacturerUrl,
  officialUrl,
} from '../fixtures/demo';
import { processEvent } from '../lib/server/events';
import { maySell, type Rule } from '../lib/core/rules';
import type { Scrape } from '../lib/server/anakin';
void test('Judge workflow persists correct assessments, quarantine, sales and evidence; imports are idempotent', async () => {
  const t = testStore();
  try {
    await t.store.boot();
    const w = new Workflow(t.store);
    await w.judge();
    assert.equal(
      (await t.store.all('SELECT * FROM inventory_items')).length,
      24,
    );
    for (const [tag, status] of [
      ['INIU-001', 'affected'],
      ['INIU-002', 'excluded_by_notice'],
      ['INIU-003', 'needs_review'],
      ['INIU-004', 'excluded_by_notice'],
    ]) {
      const r = await t.store.first(
        'SELECT a.* FROM assessments a JOIN inventory_items i ON a.item_id=i.id WHERE i.asset_tag=? ORDER BY a.created_at DESC LIMIT 1',
        [tag],
      );
      assert.equal(r?.status, status);
      assert.ok(payload<Assessment>(r!).versionId);
    }
    assert.equal(
      (await t.store.all('SELECT * FROM inventory_items WHERE quarantined=1'))
        .length,
      1,
    );
    assert.ok(
      (await t.store.all('SELECT * FROM assessment_evidence')).length > 20,
    );
    await w.judge();
    assert.equal(
      (await t.store.all('SELECT * FROM inventory_items')).length,
      24,
    );
    assert.equal((await t.store.all('SELECT * FROM sales_records')).length, 1);
  } finally {
    t.close();
  }
});
void test('source A to B reassesses excluded unit to needs_review and is idempotent', async () => {
  const t = testStore();
  try {
    await t.store.boot();
    const w = new Workflow(t.store);
    await w.judge();
    const r = await w.controlledChange('B');
    assert.equal(
      'previous' in r ? r.previous : undefined,
      'excluded_by_notice',
    );
    assert.equal('current' in r ? r.current : undefined, 'needs_review');
    const repeated = await w.controlledChange('B');
    assert.equal('unchanged' in repeated ? repeated.unchanged : false, true);
    assert.equal(
      (await t.store.all('SELECT * FROM inventory_items WHERE quarantined=1'))
        .length,
      1,
    );
  } finally {
    t.close();
  }
});
void test('source URL and content hash versioning preserves two distinct versions', async () => {
  const t = testStore();
  try {
    await t.store.boot();
    const a = await t.store.saveSource('https://www.cpsc.gov/test', 'first', {
        label: 'CONTROLLED_DEMO_FIXTURE',
      }),
      b = await t.store.saveSource('https://www.cpsc.gov/test', 'first', {}),
      c = await t.store.saveSource('https://www.cpsc.gov/test', 'second', {});
    assert.equal(a.version.id, b.version.id);
    assert.notEqual(a.version.id, c.version.id);
    assert.equal(
      (await t.store.all('SELECT * FROM source_documents')).length,
      1,
    );
  } finally {
    t.close();
  }
});
void test('audit events are immutable at database level', async () => {
  const t = testStore();
  try {
    await t.store.audit('test', 'test.event', {}).run();
    await assert.rejects(
      () => t.store.run("UPDATE audit_events SET event_type='changed'"),
      /immutable/,
    );
    await assert.rejects(
      () => t.store.run('DELETE FROM audit_events'),
      /immutable/,
    );
  } finally {
    t.close();
  }
});
void test('conflicting import cannot overwrite a physical unit', async () => {
  const t = testStore();
  try {
    await t.store.boot();
    const w = new Workflow(t.store);
    await w.import([baseItem], 'test');
    await assert.rejects(
      () => w.import([{ ...baseItem, serial: 'different' }], 'test'),
      /already exists/,
    );
    assert.equal(
      payload((await t.store.first('SELECT * FROM inventory_items'))!).serial,
      baseItem.serial,
    );
  } finally {
    t.close();
  }
});
void test('webhook body event key enforces replay idempotency; failed event records bounded attempts', async () => {
  const t = testStore();
  try {
    await t.store.boot();
    await t.store.run(
      "INSERT INTO monitor_subscriptions VALUES ('m','2026-01-01','{}','https://iniushop.com/pages/recall-b41','provider')",
    );
    for (let i = 0; i < 2; i++)
      await t.store.run(
        'INSERT OR IGNORE INTO monitor_events (id,created_at,payload,monitor_id,event_key,status) VALUES (?,?,?,?,?,?)',
        [
          'e' + i,
          '2026-01-01',
          JSON.stringify({ url: 'https://iniushop.com/pages/recall-b41' }),
          'm',
          'body-derived-key',
          'pending',
        ],
      );
    assert.equal((await t.store.all('SELECT * FROM monitor_events')).length, 1);
    await processEvent(t.store, new Workflow(t.store), 'e0');
    assert.equal(
      (await t.store.first('SELECT * FROM monitor_events'))?.status,
      'failed',
    );
  } finally {
    t.close();
  }
});

function mockScrape(url: string, rule: Rule): Scrape {
  return {
    id: `mock-job-${url}`,
    url,
    markdown: fixtureMarkdown,
    rule,
    cached: false,
    label: 'LIVE_ANAKIN',
  };
}

void test('incomplete product identity needs review without querying Anakin or permitting sale', async () => {
  const t = testStore();
  try {
    await t.store.boot();
    const w = new Workflow(t.store);
    await w.import(
      [
        { ...baseItem, assetTag: 'MISSING-BRAND', brand: undefined },
        { ...baseItem, assetTag: 'MISSING-MODEL', model: undefined },
      ],
      'test',
    );
    let searches = 0;
    w.anakin.search = async () => {
      searches++;
      return { results: [] };
    };
    const result = await w.liveScan();
    assert.equal(searches, 0);
    assert.equal(result.errors.length, 2);
    const assessments = await t.store.all('SELECT * FROM assessments');
    assert.equal(assessments.length, 2);
    for (const row of assessments) {
      const decision = payload<Assessment>(row);
      assert.equal(decision.status, 'needs_review');
      assert.equal(maySell(decision.status, false, true), false);
    }
  } finally {
    t.close();
  }
});

for (const [name, results] of [
  ['empty search', []],
  ['unsupported source', [{ url: 'https://manufacturer.example/recall' }]],
] as const) {
  void test(`${name} needs review instead of completing a no-notice investigation`, async () => {
    const t = testStore();
    try {
      await t.store.boot();
      const w = new Workflow(t.store);
      await w.import(
        [{ ...baseItem, brand: 'Example', model: 'EX-1' }],
        'test',
      );
      let searches = 0;
      w.anakin.search = async () => {
        searches++;
        return { results: [...results] };
      };
      w.anakin.scrape = async () => {
        assert.fail('No approved source should be scraped');
      };
      const result = await w.liveScan();
      assert.equal(searches, 1);
      assert.equal(result.errors.length, 1);
      const row = await t.store.first('SELECT * FROM assessments');
      assert.equal(row?.status, 'needs_review');
      assert.equal(
        maySell(payload<Assessment>(row!).status, false, true),
        false,
      );
    } finally {
      t.close();
    }
  });
}

for (const difference of ['logic', 'precision'] as const) {
  void test(`different exclusion ${difference} across sources requires review`, async () => {
    const t = testStore();
    try {
      await t.store.boot();
      const w = new Workflow(t.store);
      const item = { ...baseItem, retailer: 'Woot' };
      await w.import([item], 'test');
      const first = structuredClone(iniuRule);
      const second = structuredClone(iniuRule);
      if (difference === 'logic') {
        first.exclusions = {
          kind: 'all',
          children: [
            {
              kind: 'condition',
              id: 'seller',
              field: 'retailer',
              op: 'equals',
              values: ['Woot'],
              evidence: 'Woot',
            },
            {
              kind: 'condition',
              id: 'country',
              field: 'purchaseCountry',
              op: 'equals',
              values: ['CA'],
              evidence: 'CA',
            },
          ],
        };
        second.exclusions = {
          ...structuredClone(first.exclusions),
          kind: 'any',
        };
      } else {
        first.exclusions = {
          kind: 'condition',
          id: 'purchase',
          field: 'originalPurchaseDate',
          op: 'date_range',
          values: ['2021-11-01', '2021-11-01'],
          precision: 'day',
          evidence: '2021-11-01',
        };
        second.exclusions = {
          ...structuredClone(first.exclusions),
          precision: 'month',
        };
      }
      w.anakin.search = async () => ({
        results: [{ url: manufacturerUrl }, { url: officialUrl }],
      });
      w.anakin.scrape = async (url) =>
        mockScrape(url, url === manufacturerUrl ? first : second);
      const result = await w.liveScan();
      assert.deepEqual(result.errors, []);
      const row = await t.store.first('SELECT * FROM assessments');
      assert.equal(row?.status, 'needs_review');
      assert.match(
        payload<Assessment>(row!).reason,
        /Conflicting source evidence/,
      );
      assert.equal(
        (await t.store.first('SELECT * FROM inventory_items'))?.quarantined,
        0,
      );
    } finally {
      t.close();
    }
  });
}

void test('repeated monitor refresh preserves unresolved assessments from another source', async () => {
  const t = testStore();
  try {
    await t.store.boot();
    const w = new Workflow(t.store);
    await w.import([baseItem], 'test');
    const first = structuredClone(iniuRule);
    first.exclusions = {
      kind: 'condition',
      id: 'seller',
      field: 'retailer',
      op: 'equals',
      values: ['Amazon'],
      evidence: 'Amazon',
    };
    w.anakin.scrape = async (url) =>
      mockScrape(url, url === officialUrl ? first : structuredClone(iniuRule));
    await w.reassessUrl(officialUrl);
    assert.equal(
      (await t.store.first('SELECT * FROM assessments'))?.status,
      'excluded_by_notice',
    );
    for (let refresh = 0; refresh < 2; refresh++) {
      await w.reassessUrl(manufacturerUrl);
      const latest = await t.store.first(
        'SELECT * FROM assessments ORDER BY created_at DESC,rowid DESC LIMIT 1',
      );
      assert.equal(latest?.status, 'needs_review');
      assert.match(
        payload<Assessment>(latest!).reason,
        /Conflicting source evidence/,
      );
    }
    assert.equal((await t.store.all('SELECT * FROM assessments')).length, 3);
    assert.equal(
      (await t.store.first('SELECT * FROM inventory_items'))?.quarantined,
      0,
    );
  } finally {
    t.close();
  }
});
