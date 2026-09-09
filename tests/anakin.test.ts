import test from 'node:test';
import assert from 'node:assert/strict';
import { Anakin, type Run } from '../lib/server/anakin';
import { iniuRule, fixtureMarkdown, officialUrl } from '../fixtures/demo';
const str = (v: unknown): string =>
  typeof v === 'string'
    ? v
    : v instanceof URL
      ? v.href
      : v instanceof Request
        ? v.url
        : JSON.stringify(v);
const response = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
void test('Search adapter uses verified REST auth and parses synchronous response', async () => {
  const runs: Run[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    assert.equal(str(input), 'https://api.anakin.io/v1/search');
    assert.equal(
      (init!.headers as Record<string, string>)['X-API-Key'],
      'test-key',
    );
    assert.equal(JSON.parse(str(init?.body)).limit, 5);
    return response({
      id: 's1',
      results: [{ url: officialUrl, title: 'Official recall' }],
    });
  };
  const a = new Anakin(
    'test-key',
    async (r) => {
      runs.push(r);
    },
    fetcher,
  );
  assert.equal((await a.search('INIU')).results.length, 1);
  assert.equal(runs[0].providerId, 's1');
  assert.equal(runs[0].requestCount, 1);
});
void test('Scraper submit and polling preserve exact job ID and grounded data', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (input, init) => {
    calls++;
    if (init?.method === 'POST') {
      const b = JSON.parse(str(init.body));
      assert.ok(b.outputSchema);
      assert.equal(b.url, officialUrl);
      return response({ jobId: 'job-1', status: 'pending' }, 202);
    }
    assert.ok(str(input).endsWith('/url-scraper/job-1'));
    return response({
      id: 'job-1',
      status: 'completed',
      markdown: fixtureMarkdown,
      generatedJson: iniuRule,
      cached: false,
      url: officialUrl,
    });
  };
  const a = new Anakin(
    'test-key',
    async () => {},
    fetcher,
    async () => {},
  );
  const result = await a.scrape(officialUrl);
  assert.equal(result.label, 'LIVE_ANAKIN');
  assert.equal(result.id, 'job-1');
  assert.equal(calls, 2);
});
void test('Cached provider response is labeled cached', async () => {
  const a = new Anakin(
    'test-key',
    async () => {},
    async (_u, i) =>
      i?.method === 'POST'
        ? response({ jobId: '1' }, 202)
        : response({
            status: 'completed',
            markdown: fixtureMarkdown,
            generatedJson: iniuRule,
            cached: true,
          }),
    async () => {},
  );
  assert.equal((await a.scrape(officialUrl)).label, 'CACHED_ANAKIN');
});
void test('missing key and outage record failures without fake results', async () => {
  const runs: Run[] = [];
  const record = async (r: Run) => {
    runs.push(r);
  };
  const missing = new Anakin(undefined, record, async () => {
    throw Error('must not call');
  });
  await assert.rejects(() => missing.search('x'), /missing/);
  assert.equal(runs[0].requestCount, 0);
  const outage = new Anakin('secret-key', record, async () =>
    response({}, 503),
  );
  await assert.rejects(() => outage.search('x'), /HTTP 503/);
  assert.equal(runs[1].status, 'failed');
  assert.ok(!JSON.stringify(runs).includes('secret-key'));
});
void test('GET 429 polling backs off with bounded retry; POST is not duplicated', async () => {
  let submits = 0,
    polls = 0;
  const pauses: number[] = [];
  const a = new Anakin(
    'test',
    async () => {},
    async (_u, i) => {
      if (i?.method === 'POST') {
        submits++;
        return response({ jobId: 'j' }, 202);
      }
      polls++;
      return polls < 3
        ? response({}, 429)
        : response({
            status: 'completed',
            markdown: fixtureMarkdown,
            generatedJson: iniuRule,
            cached: false,
          });
    },
    async (n) => {
      pauses.push(n);
    },
  );
  await a.scrape(officialUrl);
  assert.equal(submits, 1);
  assert.equal(polls, 3);
  assert.ok(pauses.length >= 3);
});
void test('polling deadline and network timeout become observable errors', async () => {
  const records: Run[] = [];
  const a = new Anakin(
    'test',
    async (r) => {
      records.push(r);
    },
    async (_u, i) =>
      i?.method === 'POST'
        ? response({ jobId: 'j' }, 202)
        : response({ status: 'pending' }),
    async () => {},
    2,
  );
  await assert.rejects(() => a.scrape(officialUrl), /deadline/);
  assert.equal(records[0].status, 'failed');
  const b = new Anakin(
    'test',
    async () => {},
    async () => {
      throw new DOMException('Timed out', 'TimeoutError');
    },
  );
  await assert.rejects(() => b.search('x'), /Timed out/);
});
void test('Wire discovers a READ action before invoking it; serial not inferred', async () => {
  const urls: string[] = [];
  const a = new Anakin(
    'test',
    async () => {},
    async (u) => {
      urls.push(str(u));
      if (str(u).endsWith('/catalog/amazon'))
        return response({
          actions: [{ action_id: 'am_product_details', type: 'read' }],
        });
      if (str(u).endsWith('/wire/task'))
        return response({ job_id: 'w1', status: 'processing' }, 202);
      return response({
        status: 'completed',
        data: { title: 'Marketplace listing' },
        credits_used: 1,
        execution_ms: 30,
      });
    },
    async () => {},
  );
  const result = await a.wire('B012345678');
  assert.equal(result.id, 'w1');
  assert.equal(urls.length, 3);
  assert.equal(result.serial, undefined);
});
void test('monitor run uses /run and create defaults paused', async () => {
  const a = new Anakin(
    'test',
    async () => {},
    async (u, i) => {
      if (str(u).endsWith('/monitors'))
        assert.equal(JSON.parse(str(i?.body)).isActive, false);
      else assert.ok(str(u).endsWith('/monitors/m1/run'));
      return response({ id: 'm1' });
    },
  );
  await a.monitorCreate(officialUrl);
  await a.monitorRun('m1');
});
