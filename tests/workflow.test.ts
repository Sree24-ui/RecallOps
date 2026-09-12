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
import { flatten, maySell, type Rule } from '../lib/core/rules';
import type { Scrape } from '../lib/server/anakin';
void test('Judge workflow persists correct assessments, quarantine, sales and evidence; imports are idempotent', async () => {
  const t = testStore();
  try {
    await t.store.boot();
    const w = new Workflow(t.store, undefined, true);
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
    const w = new Workflow(t.store, undefined, true);
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
    const w = new Workflow(t.store, undefined, true);
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
    await processEvent(t.store, new Workflow(t.store, undefined, true), 'e0');
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

function manufacturerAndRegulatorSubset() {
  const primary = structuredClone(iniuRule);
  const secondary: Rule = {
    ...structuredClone(iniuRule),
    conditions: {
      kind: 'all',
      children: flatten(primary.conditions)
        .filter((condition) =>
          ['model', 'serial', 'color'].includes(condition.field),
        )
        .map((condition) => structuredClone(condition)),
    },
    exclusions: null,
    claimUrl: manufacturerUrl,
  };
  return { primary, secondary };
}

void test('linked regulator subset preserves manufacturer criteria and all four INIU outcomes', async () => {
  const t = testStore();
  try {
    await t.store.boot();
    const w = new Workflow(t.store, undefined, true);
    await w.import(
      [
        baseItem,
        { ...baseItem, assetTag: 'INIU-002', serial: '000J21' },
        { ...baseItem, assetTag: 'INIU-003', serial: '' },
        { ...baseItem, assetTag: 'INIU-004', retailer: 'Woot' },
      ],
      'test',
    );
    const { primary, secondary } = manufacturerAndRegulatorSubset();
    w.anakin.search = async () => ({ results: [] });
    w.anakin.scrape = async (url) =>
      mockScrape(url, url === manufacturerUrl ? primary : secondary);

    const result = await w.liveScan();

    assert.deepEqual(result.errors, []);
    const rows = await t.store.all(
      'SELECT a.*, i.asset_tag FROM assessments a JOIN inventory_items i ON a.item_id=i.id ORDER BY i.asset_tag',
    );
    assert.deepEqual(
      rows.map((row) => [row.asset_tag, row.status]),
      [
        ['INIU-001', 'affected'],
        ['INIU-002', 'excluded_by_notice'],
        ['INIU-003', 'needs_review'],
        ['INIU-004', 'excluded_by_notice'],
      ],
    );
    for (const row of rows) {
      const assessment = payload<Assessment>(row);
      assert.equal(assessment.sourceUrl, manufacturerUrl);
      assert.deepEqual(assessment.rule, primary);
      assert.equal(assessment.trace.length, 7);
    }
    assert.deepEqual(
      (
        await t.store.all(
          'SELECT asset_tag FROM inventory_items WHERE quarantined=1',
        )
      ).map((row) => row.asset_tag),
      ['INIU-001'],
    );
  } finally {
    t.close();
  }
});

for (const [op, brand, expected] of [
  ['equals', 'INIU', 'affected'],
  ['equals', 'Another brand', 'needs_review'],
  ['not_in', 'INIU', 'needs_review'],
] as const) {
  void test(`linked source subject covers only identical brand equality: ${op} ${brand}`, async () => {
    const t = testStore();
    try {
      await t.store.boot();
      const w = new Workflow(t.store, undefined, true);
      await w.import([baseItem], 'test');
      const { primary, secondary } = manufacturerAndRegulatorSubset();
      secondary.conditions = {
        kind: 'all',
        children: [
          secondary.conditions,
          {
            kind: 'condition',
            id: 'regulator-brand',
            field: 'brand',
            op,
            values: [brand],
            evidence: secondary.scopeEvidence,
          },
        ],
      };
      w.anakin.search = async () => ({ results: [] });
      w.anakin.scrape = async (url) =>
        mockScrape(url, url === manufacturerUrl ? primary : secondary);
      await w.liveScan();
      const row = await t.store.first('SELECT * FROM assessments');
      assert.equal(row?.status, expected);
      assert.deepEqual(payload<Assessment>(row!).rule, primary);
    } finally {
      t.close();
    }
  });
}

void test('linked INIU subset compares normalized predicates and accepts nested conjunctions', async () => {
  const t = testStore();
  try {
    await t.store.boot();
    const w = new Workflow(t.store, undefined, true);
    await w.import([baseItem], 'test');
    const { primary, secondary } = manufacturerAndRegulatorSubset();
    secondary.brand = ' iniu ';
    secondary.models = ['bi_b41'];
    secondary.conditions = {
      kind: 'all',
      children: flatten(primary.conditions).map(
        (condition): Rule['conditions'] => {
          const normalized = structuredClone(condition);
          normalized.values =
            condition.field === 'model'
              ? ['bi_b41']
              : condition.field === 'channel'
                ? ['Amazon.com']
                : condition.field === 'purchaseCountry'
                  ? ['United States']
                  : condition.op === 'date_range' ||
                      condition.op === 'serial_range'
                    ? [...condition.values]
                    : [...condition.values]
                        .reverse()
                        .map((value) => value.toLowerCase());
          return {
            kind: 'any',
            children: [{ kind: 'all', children: [normalized] }],
          };
        },
      ),
    };
    w.anakin.search = async () => ({ results: [] });
    w.anakin.scrape = async (url) =>
      mockScrape(url, url === manufacturerUrl ? primary : secondary);

    const result = await w.liveScan();

    assert.deepEqual(result.errors, []);
    const assessment = await t.store.first('SELECT * FROM assessments');
    assert.equal(assessment?.status, 'affected');
    assert.deepEqual(payload<Assessment>(assessment!).rule, primary);
  } finally {
    t.close();
  }
});

const unreconciledSubsets: Array<
  [string, (primary: Rule, secondary: Rule) => void]
> = [
  [
    'different serial values',
    (_primary, secondary) => {
      flatten(secondary.conditions).find(
        (condition) => condition.field === 'serial',
      )!.values = ['000J21'];
    },
  ],
  [
    'different color values',
    (_primary, secondary) => {
      flatten(secondary.conditions).find(
        (condition) => condition.field === 'color',
      )!.values = ['red'];
    },
  ],
  [
    'different shared operator',
    (_primary, secondary) => {
      flatten(secondary.conditions).find(
        (condition) => condition.field === 'serial',
      )!.op = 'not_in';
    },
  ],
  [
    'different date precision',
    (primary, secondary) => {
      const date = structuredClone(
        flatten(primary.conditions).find(
          (condition) => condition.field === 'originalPurchaseDate',
        )!,
      );
      date.precision = 'day';
      secondary.conditions = {
        kind: 'all',
        children: [...flatten(secondary.conditions), date],
      };
    },
  ],
  [
    'different serial range',
    (primary, secondary) => {
      const first = flatten(primary.conditions).find(
        (condition) => condition.field === 'serial',
      )!;
      const second = flatten(secondary.conditions).find(
        (condition) => condition.field === 'serial',
      )!;
      first.op = second.op = 'serial_range';
      first.values = ['000G21', '000L21'];
      second.values = ['000H21', '000L21'];
    },
  ],
  [
    'reversed date bounds',
    (primary, secondary) => {
      const date = structuredClone(
        flatten(primary.conditions).find(
          (condition) => condition.field === 'originalPurchaseDate',
        )!,
      );
      date.values.reverse();
      secondary.conditions = {
        kind: 'all',
        children: [...flatten(secondary.conditions), date],
      };
    },
  ],
  [
    'reversed serial bounds',
    (primary, secondary) => {
      const first = flatten(primary.conditions).find(
        (condition) => condition.field === 'serial',
      )!;
      const second = flatten(secondary.conditions).find(
        (condition) => condition.field === 'serial',
      )!;
      first.op = second.op = 'serial_range';
      first.values = ['000G21', '000L21'];
      second.values = ['000L21', '000G21'];
    },
  ],
  [
    'extra conflicting manufacturer predicate on a shared field',
    (primary) => {
      const extra = structuredClone(
        flatten(primary.conditions).find(
          (condition) => condition.field === 'serial',
        )!,
      );
      extra.id = 'additional-serial-restriction';
      extra.values = ['000H21'];
      primary.conditions = {
        kind: 'all',
        children: [...flatten(primary.conditions), extra],
      };
    },
  ],
  [
    'manufacturer missing a regulator condition',
    (primary) => {
      primary.conditions = {
        kind: 'all',
        children: flatten(primary.conditions).filter(
          (condition) => condition.field !== 'color',
        ),
      };
    },
  ],
  [
    'different regulator exclusion',
    (_primary, secondary) => {
      secondary.exclusions = {
        kind: 'condition',
        id: 'other-retailer',
        field: 'retailer',
        op: 'equals',
        values: ['Amazon'],
        evidence: 'Amazon',
      };
    },
  ],
  [
    'regulator alternative branches',
    (_primary, secondary) => {
      secondary.conditions = {
        kind: 'any',
        children: flatten(secondary.conditions),
      };
    },
  ],
  [
    'manufacturer alternative branches',
    (primary) => {
      primary.conditions = {
        kind: 'any',
        children: flatten(primary.conditions),
      };
    },
  ],
  [
    'unrelated approved claim link',
    (_primary, secondary) => {
      secondary.claimUrl = 'https://iniushop.com/pages/another-recall';
    },
  ],
  [
    'unsafe claim link',
    (_primary, secondary) => {
      secondary.claimUrl = 'https://unrelated.example/recall-b41';
    },
  ],
  [
    'additional regulator model',
    (_primary, secondary) => {
      secondary.models.push('BI-B42');
    },
  ],
  [
    'additional manufacturer model',
    (primary) => {
      primary.models.push('BI-B42');
    },
  ],
  [
    'unresolved regulator criteria',
    (_primary, secondary) => {
      secondary.unresolved.push('Purchase period is unclear');
    },
  ],
  [
    'unresolved manufacturer criteria',
    (primary) => {
      primary.unresolved.push('Purchase period is unclear');
    },
  ],
];

for (const [difference, mutate] of unreconciledSubsets) {
  void test(`linked INIU subset with ${difference} still requires review`, async () => {
    const t = testStore();
    try {
      await t.store.boot();
      const w = new Workflow(t.store, undefined, true);
      await w.import([baseItem], 'test');
      const { primary, secondary } = manufacturerAndRegulatorSubset();
      mutate(primary, secondary);
      w.anakin.search = async () => ({ results: [] });
      w.anakin.scrape = async (url) =>
        mockScrape(url, url === manufacturerUrl ? primary : secondary);

      const result = await w.liveScan();

      assert.deepEqual(result.errors, []);
      const assessment = await t.store.first('SELECT * FROM assessments');
      assert.equal(assessment?.status, 'needs_review');
      assert.match(
        payload<Assessment>(assessment!).reason,
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

for (const substitutedSource of ['manufacturer', 'regulator'] as const) {
  void test(`INIU subset from an arbitrary ${substitutedSource} source URL still requires review`, async () => {
    const t = testStore();
    try {
      await t.store.boot();
      const w = new Workflow(t.store, undefined, true);
      await w.import([baseItem], 'test');
      const { primary, secondary } = manufacturerAndRegulatorSubset();
      w.anakin.search = async () => ({ results: [] });
      w.anakin.scrape = async (url) => {
        const doc = mockScrape(
          url,
          url === manufacturerUrl ? primary : secondary,
        );
        if (substitutedSource === 'manufacturer' && url === manufacturerUrl)
          doc.url = 'https://iniushop.com/pages/unrelated-recall';
        if (substitutedSource === 'regulator' && url === officialUrl)
          doc.url = 'https://www.cpsc.gov/Recalls/2026/Unrelated-Recall';
        return doc;
      };

      const result = await w.liveScan();

      assert.deepEqual(result.errors, []);
      const assessment = await t.store.first('SELECT * FROM assessments');
      assert.equal(assessment?.status, 'needs_review');
      assert.match(
        payload<Assessment>(assessment!).reason,
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

void test('scoped investigation queries and assesses only selected physical units', async () => {
  const t = testStore();
  try {
    await t.store.boot();
    const w = new Workflow(t.store, undefined, true);
    await w.import(
      [
        { ...baseItem, assetTag: 'SELECTED-AFFECTED' },
        { ...baseItem, assetTag: 'SELECTED-EXCLUDED', retailer: 'Woot' },
        { ...baseItem, assetTag: 'UNSELECTED-SAME-PRODUCT' },
        {
          ...baseItem,
          assetTag: 'UNSELECTED-OTHER-PRODUCT',
          brand: 'Unrelated',
          model: 'OTHER-1',
        },
        { ...baseItem, assetTag: 'UNSELECTED-INCOMPLETE', brand: undefined },
      ],
      'test',
    );
    const selected = await t.store.all(
      "SELECT * FROM inventory_items WHERE asset_tag LIKE 'SELECTED-%'",
    );
    const itemIds = selected.map((row) => String(row.id));
    const queries: string[] = [];
    const scraped: string[] = [];
    w.anakin.search = async (query) => {
      queries.push(query);
      return { results: [{ url: manufacturerUrl }] };
    };
    w.anakin.scrape = async (url) => {
      scraped.push(url);
      return mockScrape(url, iniuRule);
    };

    const result = await w.liveScan(itemIds);

    assert.equal(result.groups, 1);
    assert.deepEqual(result.errors, []);
    assert.equal(queries.length, 1);
    assert.match(queries[0], /INIU BI-B41/);
    assert.doesNotMatch(queries[0], /Unrelated|OTHER-1/);
    assert.deepEqual(scraped, [manufacturerUrl, officialUrl]);
    const assessments = await t.store.all('SELECT * FROM assessments');
    assert.deepEqual(
      assessments.map((row) => String(row.item_id)).sort(),
      itemIds.sort(),
    );
    for (const row of selected) {
      const assessment = assessments.find((entry) => entry.item_id === row.id);
      assert.equal(
        assessment?.status,
        row.asset_tag === 'SELECTED-AFFECTED'
          ? 'affected'
          : 'excluded_by_notice',
      );
    }
    const quarantined = await t.store.all(
      'SELECT asset_tag FROM inventory_items WHERE quarantined=1',
    );
    assert.deepEqual(
      quarantined.map((row) => row.asset_tag),
      ['SELECTED-AFFECTED'],
    );
  } finally {
    t.close();
  }
});

for (const [brand, model] of [
  ['INIU', 'BI-B41'],
  [' iniu ', ' bi_b41 '],
] as const) {
  void test(`${brand}/${model} prioritizes both official baseline notices before discovered checker links`, async () => {
    const t = testStore();
    try {
      await t.store.boot();
      const w = new Workflow(t.store, undefined, true);
      await w.import([{ ...baseItem, brand, model }], 'test');
      w.anakin.search = async () => ({
        results: [
          { url: 'https://iniushop.com/pages/recall-checker' },
          { url: officialUrl },
          { url: manufacturerUrl },
        ],
      });
      const scraped: string[] = [];
      w.anakin.scrape = async (url) => {
        scraped.push(url);
        return mockScrape(url, iniuRule);
      };

      const result = await w.liveScan();

      assert.deepEqual(result.errors, []);
      assert.deepEqual(scraped, [manufacturerUrl, officialUrl]);
      assert.equal(
        (await t.store.all('SELECT * FROM source_versions')).length,
        2,
      );
      assert.equal(
        (await t.store.first('SELECT * FROM assessments'))?.status,
        'affected',
      );
    } finally {
      t.close();
    }
  });
}

for (const [brand, model] of [
  ['NOTINIU', 'BI-B41'],
  ['INIU', 'BI-B410'],
] as const) {
  void test(`${brand}/${model} does not inject unrelated INIU baseline notices`, async () => {
    const t = testStore();
    try {
      await t.store.boot();
      const w = new Workflow(t.store, undefined, true);
      await w.import([{ ...baseItem, brand, model }], 'test');
      const discovered = [
        'https://www.cpsc.gov/Recalls/2026/test-notice-first',
        'https://www.cpsc.gov/Recalls/2026/test-notice-second',
      ];
      w.anakin.search = async () => ({
        results: discovered.map((url) => ({ url })),
      });
      const scraped: string[] = [];
      w.anakin.scrape = async (url) => {
        scraped.push(url);
        return mockScrape(url, iniuRule);
      };

      const result = await w.liveScan();

      assert.deepEqual(result.errors, []);
      assert.deepEqual(scraped, discovered);
    } finally {
      t.close();
    }
  });
}

for (const failedUrl of [manufacturerUrl, officialUrl]) {
  void test(`failed baseline retrieval ${failedUrl} preserves successful evidence and requires review`, async () => {
    const t = testStore();
    try {
      await t.store.boot();
      const w = new Workflow(t.store, undefined, true);
      await w.import([baseItem], 'test');
      w.anakin.search = async () => ({
        results: [{ url: 'https://iniushop.com/pages/recall-checker' }],
      });
      const scraped: string[] = [];
      w.anakin.scrape = async (url) => {
        scraped.push(url);
        if (url === failedUrl) throw Error('Mock baseline retrieval failed');
        return mockScrape(url, iniuRule);
      };

      const result = await w.liveScan();

      assert.deepEqual(scraped, [manufacturerUrl, officialUrl]);
      assert.equal(result.errors.length, 1);
      assert.match(result.errors[0], /Mock baseline retrieval failed/);
      const versions = await t.store.all('SELECT * FROM source_versions');
      assert.equal(versions.length, 1);
      const assessment = await t.store.first('SELECT * FROM assessments');
      assert.ok(assessment);
      const decision = payload<Assessment>(assessment);
      assert.equal(decision.status, 'needs_review');
      assert.equal(decision.versionId, versions[0].id);
      assert.equal(
        decision.sourceUrl,
        failedUrl === manufacturerUrl ? officialUrl : manufacturerUrl,
      );
      assert.ok(decision.ruleId);
      assert.equal(decision.rule?.noticeId, iniuRule.noticeId);
      const evidence = await t.store.all(
        'SELECT * FROM assessment_evidence WHERE assessment_id=?',
        [assessment.id],
      );
      assert.ok(evidence.length > 0);
      assert.ok(evidence.every((row) => row.version_id === versions[0].id));
      assert.equal(
        (await t.store.first('SELECT * FROM inventory_items'))?.quarantined,
        0,
      );
      assert.deepEqual(
        await t.store.all('SELECT * FROM quarantine_actions'),
        [],
      );
    } finally {
      t.close();
    }
  });
}

for (const scope of ['unknown', 'empty', 'invalid', 'too-many'] as const) {
  void test(`${scope} investigation scope is rejected before provider calls or state changes`, async () => {
    const t = testStore();
    try {
      await t.store.boot();
      const w = new Workflow(t.store, undefined, true);
      await w.import([baseItem], 'test');
      const item = await t.store.first('SELECT * FROM inventory_items');
      const validId = String(item!.id);
      const itemIds =
        scope === 'unknown'
          ? [validId, '00000000-0000-4000-8000-000000000001']
          : scope === 'empty'
            ? []
            : scope === 'invalid'
              ? [validId, 'not-an-inventory-uuid']
              : Array.from(
                  { length: 1001 },
                  (_, index) =>
                    `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
                );
      const providerCalls: string[] = [];
      w.anakin.search = async () => {
        providerCalls.push('search');
        return { results: [{ url: manufacturerUrl }] };
      };
      w.anakin.scrape = async (url) => {
        providerCalls.push('scrape');
        return mockScrape(url, iniuRule);
      };
      const changesBefore = t.sqlite
        .prepare('SELECT total_changes() AS count')
        .get()!.count;

      await assert.rejects(
        () => w.liveScan(itemIds),
        scope === 'unknown'
          ? /not found/
          : scope === 'empty'
            ? /Too small/
            : scope === 'invalid'
              ? /UUID/i
              : /1000/,
      );

      assert.deepEqual(providerCalls, []);
      assert.equal(
        t.sqlite.prepare('SELECT total_changes() AS count').get()!.count,
        changesBefore,
      );
      assert.deepEqual(await t.store.all('SELECT * FROM assessments'), []);
      assert.equal(
        (await t.store.first('SELECT * FROM inventory_items'))?.quarantined,
        0,
      );
    } finally {
      t.close();
    }
  });
}

void test('incomplete product identity needs review without querying Anakin or permitting sale', async () => {
  const t = testStore();
  try {
    await t.store.boot();
    const w = new Workflow(t.store, undefined, true);
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
      const w = new Workflow(t.store, undefined, true);
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
      const w = new Workflow(t.store, undefined, true);
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
    const w = new Workflow(t.store, undefined, true);
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

for (const providerCheckedAt of [null, '2026-09-01T09:00:00.000Z']) {
  void test(`monitor run remains queued and uses ${providerCheckedAt ? 'provider check time' : 'no check time without provider evidence'}`, async () => {
    const t = testStore();
    try {
      await t.store.boot();
      const w = new Workflow(t.store, undefined, true);
      await w.import([baseItem], 'test');
      const monitorId = crypto.randomUUID();
      await t.store
        .insert('monitor_subscriptions', {
          id: monitorId,
          created_at: '2026-09-01T00:00:00.000Z',
          payload: JSON.stringify({ label: 'LIVE_ANAKIN' }),
          url: manufacturerUrl,
          provider_id: 'provider-monitor',
        })
        .run();
      const calls: string[] = [];
      w.anakin.monitorRun = async () => {
        calls.push('run');
        return { success: true, jobId: 'queued-monitor-job' };
      };
      w.anakin.monitorGet = async () => {
        calls.push('get');
        const stored = payload(
          (await t.store.first(
            'SELECT * FROM monitor_subscriptions WHERE id=?',
            [monitorId],
          ))!,
        );
        assert.equal((stored.run as { status: string }).status, 'queued');
        return providerCheckedAt ? { lastCheckedAt: providerCheckedAt } : {};
      };
      w.anakin.monitorChanges = async () => {
        calls.push('changes');
        return { changes: [] };
      };
      w.anakin.scrape = async (url) => {
        calls.push('scrape');
        return mockScrape(url, structuredClone(iniuRule));
      };
      const mon = await t.store.first(
        'SELECT * FROM monitor_subscriptions WHERE id=?',
        [monitorId],
      );
      const result = await w.refreshMonitor(mon!);
      assert.equal('queued' in result && result.queued, true);
      assert.match(
        'message' in result ? result.message : '',
        /completion has not been confirmed/,
      );
      const stored = payload(
        (await t.store.first('SELECT * FROM monitor_subscriptions WHERE id=?', [
          monitorId,
        ]))!,
      );
      assert.equal(stored.lastCheckedAt, providerCheckedAt);
      assert.deepEqual(Object.keys(stored.run as object).sort(), [
        'jobId',
        'requestedAt',
        'status',
      ]);
      assert.equal(
        (stored.run as { jobId: string }).jobId,
        'queued-monitor-job',
      );
      assert.equal((stored.run as { status: string }).status, 'queued');
      const independent = stored.independentReassessment as {
        method: string;
        assessed: number;
        completedAt: string;
      };
      assert.equal(independent.method, 'independent_scrape');
      assert.equal(independent.assessed, 1);
      assert.ok(Number.isFinite(Date.parse(independent.completedAt)));
      assert.deepEqual(calls, ['run', 'get', 'changes', 'scrape']);
      const audit = await t.store.all(
        'SELECT * FROM audit_events WHERE entity_id=?',
        [monitorId],
      );
      assert.deepEqual(
        audit.map((row) => row.event_type),
        ['monitor.run_queued', 'monitor.independent_reassessment'],
      );
    } finally {
      t.close();
    }
  });
}
