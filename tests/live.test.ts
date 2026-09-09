import test from 'node:test';
import assert from 'node:assert/strict';
import { Anakin } from '../lib/server/anakin';
void test(
  'live server-side Search integration',
  { skip: process.env.RUN_LIVE_ANAKIN !== '1' },
  async () => {
    assert.ok(process.env.ANAKIN_API_KEY, 'ANAKIN_API_KEY is required');
    const a = new Anakin(process.env.ANAKIN_API_KEY, async (r) => {
      assert.equal(r.status, 'success');
      console.log(
        JSON.stringify({
          product: r.product,
          providerId: r.providerId,
          durationMs: r.durationMs,
        }),
      );
    });
    const result = await a.search('site:cpsc.gov INIU BI-B41 recall');
    assert.ok(result.results.some((r) => r.url.includes('cpsc.gov')));
  },
);
