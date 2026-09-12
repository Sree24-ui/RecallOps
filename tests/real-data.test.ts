import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../data/official-recalls.json';
import { readFileSync } from 'node:fs';
import { testStore } from './database';
import { Workflow } from '../lib/server/workflow';
import { recallNoticeUrl } from '../lib/server/security';
import { investigationLimits } from '../lib/core/runtime-policy';
import { Anakin } from '../lib/server/anakin';

void test('public catalogue contains official notices and no invented owned-unit fields', () => {
  assert.ok(catalog.records.length > 0);
  for (const r of catalog.records) {
    assert.ok(Number.isInteger(r.id));
    assert.equal(new URL(r.url).hostname, 'www.cpsc.gov');
    assert.equal(new URL(r.apiUrl).searchParams.get('RecallNumber'), r.number);
    assert.equal(recallNoticeUrl(r.url), r.url);
    assert.ok(!Number.isNaN(Date.parse(r.retrievedAt)));
    for (const field of [
      'assetTag',
      'serial',
      'customer',
      'email',
      'quarantined',
      'assessment',
    ])
      assert.equal(Object.hasOwn(r, field), false);
  }
  assert.equal(
    readFileSync(
      new URL('../public/inventory-template.csv', import.meta.url),
      'utf8',
    )
      .trim()
      .split('\n').length,
    1,
  );
});
void test('specific-notice filter rejects CPSC category and search pages', () => {
  for (const url of [
    'https://www.cpsc.gov/Recall-Products/Electronics',
    'https://www.cpsc.gov/Recalls',
    'https://www.cpsc.gov/Recalls/search-by-company',
  ])
    assert.throws(() => recallNoticeUrl(url), /specific recall notice/);
});
void test('normal workflow cannot create test inventory or controlled changes', async () => {
  const t = testStore();
  try {
    const workflow = new Workflow(t.store);
    await assert.rejects(() => workflow.judge(), /disabled/);
    await assert.rejects(() => workflow.controlledChange('A'), /disabled/);
    assert.equal(
      (await t.store.all('SELECT * FROM inventory_items')).length,
      0,
    );
  } finally {
    t.close();
  }
});
void test('scan limit preserves deferred assessments and ignores archived units', async () => {
  const t = testStore();
  try {
    await t.store.boot();
    const w = new Workflow(t.store);
    const items = Array.from(
      { length: investigationLimits.groups + 2 },
      (_, i) => ({
        assetTag: `LIMIT-${i}`,
        title: 'Test unit',
        brand: 'Test brand',
        model: `TEST-${i}`,
      }),
    );
    await w.import(items, 'isolated_test');
    const rows = await t.store.all(
      'SELECT * FROM inventory_items ORDER BY rowid',
    );
    const deferred = rows.at(-2)!;
    await w.assess(deferred, null, null, 'DEGRADED_FALLBACK', null, {
      discoveryComplete: false,
    });
    const before = await t.store.all(
      'SELECT * FROM assessments WHERE item_id=?',
      [deferred.id],
    );
    await t.store.run('UPDATE inventory_items SET archived=1 WHERE id=?', [
      rows.at(-1)!.id,
    ]);
    let searches = 0;
    w.anakin.search = async () => {
      searches++;
      return { results: [] };
    };
    const result = await w.liveScan();
    assert.equal(searches, investigationLimits.groups);
    assert.equal(result.deferredGroups, 1);
    assert.equal(result.errors.filter((e) => e.includes('deferred')).length, 1);
    assert.deepEqual(
      await t.store.all('SELECT * FROM assessments WHERE item_id=?', [
        deferred.id,
      ]),
      before,
    );
    assert.equal(
      (
        await t.store.all('SELECT * FROM assessments WHERE item_id=?', [
          rows.at(-1)!.id,
        ])
      ).length,
      0,
    );
  } finally {
    t.close();
  }
});
void test('normalized model variants share one scan without altering search spelling', async () => {
  const t = testStore();
  try {
    await t.store.boot();
    const w = new Workflow(t.store);
    await w.import(
      [
        { assetTag: 'N-1', title: 'Test', brand: 'Anker', model: 'A-1263' },
        { assetTag: 'N-2', title: 'Test', brand: 'ANKER', model: 'A1263' },
      ],
      'isolated_test',
    );
    let calls = 0;
    w.anakin.search = async (query) => {
      calls++;
      assert.match(query, /Anker A-1263/);
      return { results: [] };
    };
    assert.equal((await w.liveScan()).groups, 1);
    assert.equal(calls, 1);
  } finally {
    t.close();
  }
});
void test('fetched evidence survives rejected extraction and errors stay readable', async () => {
  const text =
    'Official source text retrieved successfully, without usable eligibility criteria.';
  let saved = '';
  let count = 0;
  const a = new Anakin(
    'test-key',
    async () => {},
    async () =>
      Response.json(
        ++count === 1
          ? { jobId: 'isolated-job' }
          : {
              status: 'completed',
              markdown: text,
              generatedJson: { models: [], inclusionGroups: [] },
            },
      ),
    async () => {},
  );
  await assert.rejects(
    () =>
      a.scrape(catalog.records[0].url, async (source) => {
        saved = source.markdown;
      }),
    /complete, valid recall criteria/,
  );
  assert.equal(saved, text);
});
