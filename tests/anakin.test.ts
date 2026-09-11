import test from 'node:test';
import assert from 'node:assert/strict';
import { Anakin, type Run } from '../lib/server/anakin';
import { iniuRule, fixtureMarkdown, officialUrl } from '../fixtures/demo';
import { flatten } from '../lib/core/rules';
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
void test('Cloudflare-compatible manual redirects never follow credentials to another host', async () => {
  let calls = 0;
  const adapter = new Anakin(
    'test-key',
    async () => {},
    async (_url, init) => {
      calls++;
      assert.equal(init?.redirect, 'manual');
      return new Response(null, {
        status: 302,
        headers: { Location: 'https://untrusted.example/' },
      });
    },
  );
  await assert.rejects(() => adapter.search('INIU'), /HTTP 302/);
  assert.equal(calls, 1);
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

void test('Scraper decodes the live successful extraction envelope and flat groups', async () => {
  const { conditions, exclusions, ...base } = iniuRule;
  const flat = {
    ...base,
    inclusionGroups: [
      flatten(conditions).map(({ kind: _kind, precision, ...condition }) => ({
        ...condition,
        precision: precision ?? 'not_applicable',
      })),
    ],
    exclusionGroups: exclusions
      ? [
          flatten(exclusions).map(
            ({ kind: _kind, precision, ...condition }) => ({
              ...condition,
              precision: precision ?? 'not_applicable',
            }),
          ),
        ]
      : [],
  };
  const runs: Run[] = [];
  const a = new Anakin(
    'test-key',
    async (run) => {
      runs.push(run);
    },
    async (_url, init) => {
      if (init?.method === 'POST') {
        const body = JSON.parse(str(init.body));
        assert.deepEqual(body.formats, ['markdown', 'json']);
        assert.equal(body.generateJson, true);
        assert.ok(body.outputSchema.properties.inclusionGroups);
        return response({ jobId: 'flat-job', status: 'pending' }, 202);
      }
      return response({
        id: 'flat-job',
        status: 'completed',
        markdown: fixtureMarkdown,
        generatedJson: { status: 'success', data: flat },
        cached: false,
      });
    },
    async () => {},
  );
  const result = await a.scrape(officialUrl);
  assert.equal(result.rule.conditions.kind, 'any');
  assert.equal(result.rule.noticeId, iniuRule.noticeId);
  assert.equal(result.label, 'LIVE_ANAKIN');
  assert.equal(runs[0].providerId, 'flat-job');
  assert.equal(runs[0].status, 'success');
});

void test('failed structured extraction retains successful retrieval job ID and cache state', async () => {
  const runs: Run[] = [];
  const a = new Anakin(
    'test-key',
    async (run) => {
      runs.push(run);
    },
    async (_url, init) =>
      init?.method === 'POST'
        ? response({ jobId: 'failed-extraction-job', status: 'pending' }, 202)
        : response({
            status: 'completed',
            markdown: fixtureMarkdown,
            generatedJson: { status: 'failed', data: iniuRule },
            cached: true,
          }),
    async () => {},
  );
  await assert.rejects(
    () => a.scrape(officialUrl),
    /structured extraction failed/,
  );
  assert.equal(runs.length, 1);
  assert.equal(runs[0].status, 'failed');
  assert.equal(runs[0].providerId, 'failed-extraction-job');
  assert.equal(runs[0].cached, true);
  assert.equal(runs[0].requestCount, 2);
});

void test('a forged operand inside a success envelope is rejected and retains the provider job', async () => {
  const forged = structuredClone(iniuRule);
  const serial = flatten(forged.conditions).find(
    (condition) => condition.field === 'serial',
  );
  assert.ok(serial);
  serial.values = ['FABRICATED999'];
  const runs: Run[] = [];
  const a = new Anakin(
    'test-key',
    async (run) => {
      runs.push(run);
    },
    async (_url, init) =>
      init?.method === 'POST'
        ? response({ jobId: 'forged-job' }, 202)
        : response({
            status: 'completed',
            markdown: fixtureMarkdown,
            generatedJson: { status: 'success', data: forged },
          }),
    async () => {},
  );
  await assert.rejects(() => a.scrape(officialUrl), /operand is not grounded/);
  assert.equal(runs[0].status, 'failed');
  assert.equal(runs[0].providerId, 'forged-job');
});

void test('Retry-After delays up to 30 seconds are honored without shortening', async () => {
  for (const seconds of [8, 30]) {
    const pauses: number[] = [];
    let calls = 0;
    const a = new Anakin(
      'test-key',
      async () => {},
      async () => {
        calls++;
        if (calls > 1) return response({ id: 'm1', isActive: false });
        return new Response('{}', {
          status: 429,
          headers: { 'Retry-After': String(seconds) },
        });
      },
      async (delay) => {
        pauses.push(delay);
      },
    );
    await a.monitorGet('m1');
    assert.deepEqual(pauses, [seconds * 1000]);
    assert.equal(calls, 2);
  }
});

void test('Retry-After beyond 30 seconds defers without another request', async () => {
  let calls = 0;
  const pauses: number[] = [];
  const runs: Run[] = [];
  const a = new Anakin(
    'test-key',
    async (run) => {
      runs.push(run);
    },
    async () => {
      calls++;
      return new Response('{}', {
        status: 429,
        headers: { 'Retry-After': '31' },
      });
    },
    async (delay) => {
      pauses.push(delay);
    },
  );
  await assert.rejects(() => a.monitorGet('m1'), /longer retry delay/);
  assert.equal(calls, 1);
  assert.deepEqual(pauses, []);
  assert.equal(runs[0].status, 'failed');
});

void test('Wire honors retry_after_ms through 30 seconds and sends the discovered ASIN input', async () => {
  for (const wait of [12_000, 30_000]) {
    let polls = 0;
    const pauses: number[] = [];
    const a = new Anakin(
      'test-key',
      async () => {},
      async (url, init) => {
        if (str(url).endsWith('/catalog/amazon'))
          return response({
            actions: [{ action_id: 'am_product_details', type: 'read' }],
          });
        if (str(url).endsWith('/wire/task')) {
          assert.deepEqual(JSON.parse(str(init?.body)), {
            action_id: 'am_product_details',
            params: { asin: 'B012345678' },
          });
          return response({ job_id: 'wire-delay-job' }, 202);
        }
        polls++;
        return polls === 1
          ? response({ status: 'processing', retry_after_ms: wait })
          : response({
              status: 'completed',
              data: { title: 'Controlled listing' },
            });
      },
      async (delay) => {
        pauses.push(delay);
      },
    );
    const result = await a.wire('B012345678');
    assert.equal(result.id, 'wire-delay-job');
    assert.deepEqual(pauses, [2000, wait]);
    assert.equal(polls, 2);
  }
});

void test('Wire defers excessive polling delays and preserves its resumable job ID', async () => {
  const runs: Run[] = [];
  const pauses: number[] = [];
  let polls = 0;
  const a = new Anakin(
    'test-key',
    async (run) => {
      runs.push(run);
    },
    async (url) => {
      if (str(url).endsWith('/catalog/amazon'))
        return response({
          actions: [{ action_id: 'am_product_details', type: 'read' }],
        });
      if (str(url).endsWith('/wire/task'))
        return response({ job_id: 'deferred-wire-job' }, 202);
      polls++;
      return response({ status: 'processing', retry_after_ms: 30_001 });
    },
    async (delay) => {
      pauses.push(delay);
    },
  );
  await assert.rejects(() => a.wire('B012345678'), /longer polling delay/);
  assert.deepEqual(pauses, [2000]);
  assert.equal(polls, 1);
  assert.equal(runs[0].status, 'failed');
  assert.equal(runs[0].providerId, 'deferred-wire-job');
});
