import test from 'node:test';
import assert from 'node:assert/strict';
import { testStore } from './database';
import { Workflow } from '../lib/server/workflow';
import { payload, type Store } from '../lib/server/store';
import {
  processEvent,
  retryableEvents,
  EVENT_LEASE_MS,
} from '../lib/server/events';
import { limited } from '../lib/server/api';

async function addMonitor(store: Store) {
  await store
    .insert('monitor_subscriptions', {
      id: 'isolated-monitor',
      created_at: new Date().toISOString(),
      payload: '{}',
      url: 'https://iniushop.com/pages/recall-b41',
      provider_id: 'isolated-provider',
    })
    .run();
}
async function addEvent(
  store: Store,
  eventId: string,
  status: string,
  attempts = 0,
  processingStartedAt?: string,
) {
  await store
    .insert('monitor_events', {
      id: eventId,
      created_at: '2026-01-01T00:00:00.000Z',
      payload: JSON.stringify({
        url: 'https://iniushop.com/pages/recall-b41',
        attempts,
        processingStartedAt,
      }),
      monitor_id: 'isolated-monitor',
      event_key: eventId,
      status,
    })
    .run();
}

void test('a concurrent burst permits exactly the configured number of operator actions', async () => {
  const t = testStore();
  try {
    const outcomes = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        limited(t.store, 'isolated-action-limit', 6),
      ),
    );
    assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 6);
    assert.equal(outcomes.filter((r) => r.status === 'rejected').length, 6);
  } finally {
    t.close();
  }
});

void test('exhausted events do not starve pending retries and fresh processing leases are not stolen', async () => {
  const t = testStore();
  try {
    await addMonitor(t.store);
    for (let i = 0; i < 6; i++)
      await addEvent(t.store, `exhausted-${i}`, 'failed', 3);
    await addEvent(t.store, 'ready', 'pending');
    await addEvent(
      t.store,
      'still-running',
      'processing',
      1,
      new Date().toISOString(),
    );
    const queue = await retryableEvents(t.store);
    assert.deepEqual(
      queue.map((event) => event.id),
      ['ready'],
    );
    const workflow = new Workflow(t.store);
    workflow.reassessUrl = async () => {
      throw Error('An active event must not be processed again');
    };
    await processEvent(t.store, workflow, 'still-running');
    assert.equal(
      (
        await t.store.first(
          "SELECT * FROM monitor_events WHERE id='still-running'",
        )
      )?.status,
      'processing',
    );
  } finally {
    t.close();
  }
});

void test('an interrupted event can be reclaimed exactly once after its processing lease expires', async () => {
  const t = testStore();
  try {
    await addMonitor(t.store);
    await addEvent(
      t.store,
      'interrupted',
      'processing',
      1,
      new Date(Date.now() - EVENT_LEASE_MS - 1000).toISOString(),
    );
    let calls = 0;
    const workflow = new Workflow(t.store);
    workflow.reassessUrl = async () => {
      calls++;
      return { assessed: 0, versionId: 'isolated-version' };
    };
    assert.deepEqual(
      (await retryableEvents(t.store)).map((event) => event.id),
      ['interrupted'],
    );
    await Promise.all([
      processEvent(t.store, workflow, 'interrupted'),
      processEvent(t.store, workflow, 'interrupted'),
    ]);
    const event = (await t.store.first(
      "SELECT * FROM monitor_events WHERE id='interrupted'",
    ))!;
    assert.equal(calls, 1);
    assert.equal(event.status, 'processed');
    assert.equal(payload(event).attempts, 2);
    assert.equal(
      (
        await t.store.all(
          "SELECT * FROM audit_events WHERE event_type='monitor.reassessed'",
        )
      ).length,
      1,
    );
  } finally {
    t.close();
  }
});

void test('a stale worker cannot overwrite a later claim or audit its completion', async () => {
  const t = testStore();
  try {
    await addMonitor(t.store);
    await addEvent(t.store, 'reclaimed', 'pending');
    const workflow = new Workflow(t.store);
    workflow.reassessUrl = async () => {
      const current = (await t.store.first(
        "SELECT * FROM monitor_events WHERE id='reclaimed'",
      ))!;
      await t.store.run('UPDATE monitor_events SET payload=? WHERE id=?', [
        JSON.stringify({
          ...payload(current),
          processingClaimId: 'a-new-owner',
        }),
        'reclaimed',
      ]);
      return { assessed: 0, versionId: 'isolated-version' };
    };
    await processEvent(t.store, workflow, 'reclaimed');
    const event = (await t.store.first(
      "SELECT * FROM monitor_events WHERE id='reclaimed'",
    ))!;
    assert.equal(event.status, 'processing');
    assert.equal(payload(event).processingClaimId, 'a-new-owner');
    assert.equal((await t.store.all('SELECT * FROM audit_events')).length, 0);
  } finally {
    t.close();
  }
});
