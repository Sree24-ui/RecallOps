import test from 'node:test';
import assert from 'node:assert/strict';
import { Anakin, ProviderDeadlineError, type Run } from '../lib/server/anakin';
import { Workflow } from '../lib/server/workflow';
import { providerLimits } from '../lib/core/runtime-policy';
import { testStore } from './database';
import { officialUrl } from '../fixtures/demo';

void test('expired operation records a failure without issuing a provider request', async () => {
  const runs: Run[] = [];
  let requests = 0;
  const client = new Anakin(
    'test-key',
    async (run) => {
      runs.push(run);
    },
    async () => {
      requests++;
      return Response.json({ results: [] });
    },
    undefined,
    undefined,
    Date.now() - 1,
  );
  await assert.rejects(() => client.search('test'), ProviderDeadlineError);
  assert.equal(requests, 0);
  assert.equal(runs[0].requestCount, 0);
  assert.equal(runs[0].status, 'failed');
});

void test('successive provider products share the same operation budget', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  let requests = 0;
  const client = new Anakin(
    'test-key',
    async () => {},
    async () => {
      requests++;
      return Response.json({ results: [] });
    },
  );
  await client.search('test');
  t.mock.timers.tick(providerLimits.workflowDurationMs);
  await assert.rejects(
    () => client.monitorGet('existing-monitor'),
    ProviderDeadlineError,
  );
  assert.equal(requests, 1);
});

void test('polling stops before a delay exceeds the remaining budget and retains its job ID', async () => {
  const runs: Run[] = [];
  let requests = 0;
  let pauses = 0;
  const client = new Anakin(
    'test-key',
    async (run) => {
      runs.push(run);
    },
    async () => {
      requests++;
      return Response.json({ jobId: 'submitted-job', status: 'pending' });
    },
    async () => {
      pauses++;
    },
    undefined,
    Date.now() + 1_000,
  );
  await assert.rejects(() => client.scrape(officialUrl), ProviderDeadlineError);
  assert.equal(requests, 1);
  assert.equal(pauses, 0);
  assert.equal(runs[0].providerId, 'submitted-job');
  assert.equal(runs[0].status, 'failed');
});

void test('GET backoff never retries beyond the remaining operation budget', async () => {
  let requests = 0;
  let pauses = 0;
  const client = new Anakin(
    'test-key',
    async () => {},
    async () => {
      requests++;
      return new Response(null, {
        status: 429,
        headers: { 'Retry-After': '2' },
      });
    },
    async () => {
      pauses++;
    },
    undefined,
    Date.now() + 1_000,
  );
  await assert.rejects(
    () => client.monitorGet('existing-monitor'),
    ProviderDeadlineError,
  );
  assert.equal(requests, 1);
  assert.equal(pauses, 0);
});

void test('an in-flight request receives the shorter operation deadline as its abort signal', async () => {
  let requests = 0;
  const client = new Anakin(
    'test-key',
    async () => {},
    async (_url, init) => {
      requests++;
      await new Promise((resolve) => setTimeout(resolve, 40));
      assert.equal(init?.signal?.aborted, true);
      throw init!.signal!.reason;
    },
    undefined,
    undefined,
    Date.now() + 20,
  );
  await assert.rejects(() => client.search('test'), ProviderDeadlineError);
  assert.equal(requests, 1);
});

void test('scan budget exhaustion preserves interrupted and remaining group assessments', async () => {
  const t = testStore();
  try {
    await t.store.boot();
    const workflow = new Workflow(t.store);
    await workflow.import(
      [
        {
          assetTag: 'DEADLINE-1',
          title: 'Isolated test',
          brand: 'Test',
          model: 'ONE',
        },
        {
          assetTag: 'DEADLINE-2',
          title: 'Isolated test',
          brand: 'Test',
          model: 'TWO',
        },
      ],
      'isolated_test',
    );
    const rows = await t.store.all(
      'SELECT * FROM inventory_items ORDER BY rowid',
    );
    for (const row of rows)
      await workflow.assess(row, null, null, 'DEGRADED_FALLBACK', null, {
        discoveryComplete: false,
      });
    const before = await t.store.all('SELECT * FROM assessments ORDER BY id');
    let searches = 0;
    let scrapes = 0;
    workflow.anakin.search = async () => {
      searches++;
      return { results: [{ url: officialUrl }] };
    };
    workflow.anakin.scrape = async (_url, onRetrieved) => {
      scrapes++;
      await onRetrieved?.({
        id: 'submitted-job',
        url: officialUrl,
        markdown:
          'Previously retrieved official source text remains available for review.',
        label: 'LIVE_ANAKIN',
        cached: false,
      });
      throw new ProviderDeadlineError();
    };
    const result = await workflow.liveScan();
    assert.equal(searches, 1);
    assert.equal(scrapes, 1);
    assert.equal(result.processedGroups, 0);
    assert.equal(result.deferredGroups, 2);
    assert.equal(result.errors.length, 1);
    assert.match(
      result.errors[0],
      /time limit.*existing assessments were preserved/,
    );
    assert.deepEqual(
      await t.store.all('SELECT * FROM assessments ORDER BY id'),
      before,
    );
    assert.equal(
      (await t.store.all('SELECT * FROM source_documents')).length,
      1,
    );
  } finally {
    t.close();
  }
});
