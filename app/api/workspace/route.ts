import { z } from 'zod';
import {
  context,
  errorResponse,
  limited,
  readBody,
} from '../../../lib/server/api';
import { id, now, payload } from '../../../lib/server/store';
import {
  investigationItemIdsSchema,
  type Assessment,
} from '../../../lib/server/workflow';
import { inventorySchema, type Inventory } from '../../../lib/core/rules';
import { normalizeEnrichment } from '../../../lib/core/enrichment';
import { MAX_CSV_BYTES, parseCsv } from '../../../lib/core/csv';
import {
  safeUrl,
  publicProviderData,
  sha256,
} from '../../../lib/server/security';
import { processEvent } from '../../../lib/server/events';
import { demoInventory, iniuRule } from '../../../fixtures/demo';
const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('judge') }),
  z.object({
    action: z.literal('scan'),
    itemIds: investigationItemIdsSchema.optional(),
  }),
  z.object({ action: z.literal('controlled_change') }),
  z.object({
    action: z.literal('import'),
    csv: z.string().max(MAX_CSV_BYTES),
    reviewOnly: z.boolean().optional(),
  }),
  z.object({ action: z.literal('manual'), item: inventorySchema }),
  z.object({ action: z.literal('acknowledge'), itemId: z.uuid() }),
  z.object({
    action: z.literal('task'),
    taskId: z.uuid(),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    status: z.enum(['open', 'in_progress', 'done']),
    owner: z.string().trim().min(1).max(100),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    priority: z.enum(['urgent', 'high', 'normal']),
  }),
  z.object({
    action: z.literal('wire'),
    itemId: z.uuid(),
    asin: z.string().regex(/^[A-Za-z0-9]{10}$/),
  }),
  z.object({ action: z.literal('monitor_create'), url: z.string().max(1000) }),
  z.object({ action: z.literal('monitor_run'), monitorId: z.uuid() }),
  z.object({ action: z.literal('retry_events') }),
]);
export async function GET(req: Request) {
  try {
    const { store, env } = context(req);
    await store.boot();
    const [
      items,
      assessments,
      cases,
      tasks,
      sources,
      monitors,
      events,
      runs,
      audit,
      imports,
    ] = await Promise.all([
      store.all('SELECT * FROM inventory_items ORDER BY asset_tag'),
      store.all(
        'SELECT * FROM assessments ORDER BY created_at DESC,rowid DESC',
      ),
      store.all('SELECT * FROM cases'),
      store.all('SELECT * FROM case_tasks ORDER BY created_at DESC'),
      store.all('SELECT * FROM source_versions ORDER BY created_at DESC'),
      store.all('SELECT * FROM monitor_subscriptions'),
      store.all(
        'SELECT * FROM monitor_events ORDER BY created_at DESC LIMIT 100',
      ),
      store.all(
        'SELECT * FROM integration_runs ORDER BY created_at DESC LIMIT 100',
      ),
      store.all(
        'SELECT * FROM audit_events ORDER BY created_at DESC LIMIT 150',
      ),
      store.all(
        'SELECT * FROM inventory_imports ORDER BY created_at DESC LIMIT 30',
      ),
    ]);
    return Response.json(
      {
        demo: {
          sampleCount: demoInventory.length,
          subject: [iniuRule.brand, ...iniuRule.models].join(' '),
          monitoringReady: monitors.some(
            (r) => payload(r).label === 'CONTROLLED_DEMO_FIXTURE',
          ),
        },
        inventory: items.map((r) => {
          const c = cases.find((x) => x.item_id === r.id),
            a = assessments.find((x) => x.item_id === r.id);
          return {
            id: r.id,
            ...payload<Inventory>(r),
            quarantined: !!r.quarantined,
            acknowledged: !!c?.acknowledged,
            caseId: c?.id,
            assessment: a
              ? { id: a.id, createdAt: a.created_at, ...payload<Assessment>(a) }
              : null,
          };
        }),
        tasks: await Promise.all(
          tasks.map(async (r) => ({
            id: r.id,
            caseId: r.case_id,
            status: r.status,
            ...payload(r),
            revision: await sha256(String(r.payload) + String(r.status)),
          })),
        ),
        sources: sources.map((r) => ({
          id: r.id,
          contentHash: r.content_hash,
          createdAt: r.created_at,
          ...payload(r),
        })),
        monitors: monitors.map((r) => {
          const p = payload(r);
          delete p.webhookSecret;
          return {
            id: r.id,
            url: r.url,
            providerId: r.provider_id,
            ...(publicProviderData(p) as Record<string, unknown>),
          };
        }),
        events: events.map((r) => ({
          id: r.id,
          status: r.status,
          createdAt: r.created_at,
          ...payload(r),
        })),
        runs: runs.map((r) => ({ id: r.id, ...payload(r) })),
        audit: audit.map((r) => ({
          id: r.id,
          entityId: r.entity_id,
          type: r.event_type,
          createdAt: r.created_at,
          ...payload(r),
        })),
        imports: imports.map((r) => ({
          id: r.id,
          createdAt: r.created_at,
          ...payload(r),
        })),
        health: {
          keyConfigured: !!env.ANAKIN_API_KEY,
          webhookConfigured: !!env.PUBLIC_BASE_URL,
          mode: 'local_single_operator',
          coverage:
            'Approved official domains: CPSC and INIU. Judge Mode uses controlled recordings.',
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request) {
  try {
    const { store, workflow, env } = context(req);
    await store.boot();
    const body = actionSchema.parse(JSON.parse(await readBody(req)));
    await limited(store, 'operator-actions', 30);
    if (
      ['judge', 'scan', 'wire', 'monitor_create', 'monitor_run'].includes(
        body.action,
      )
    )
      await limited(store, 'expensive-actions', 6);
    switch (body.action) {
      case 'judge':
        return Response.json(await workflow.judge());
      case 'scan':
        return Response.json(await workflow.liveScan(body.itemIds));
      case 'controlled_change':
        return Response.json(await workflow.controlledChange('B'));
      case 'import': {
        const rows = parseCsv(body.csv);
        return Response.json(
          body.reviewOnly
            ? { rows, count: rows.length }
            : await workflow.import(rows, 'CSV'),
        );
      }
      case 'manual':
        return Response.json(
          await workflow.import([body.item as Inventory], 'manual'),
        );
      case 'acknowledge': {
        const item = await store.first(
          'SELECT * FROM inventory_items WHERE id=?',
          [body.itemId],
        );
        if (!item) throw Error('Inventory item not found');
        await store.db.batch([
          store.stmt('UPDATE cases SET acknowledged=1 WHERE item_id=?', [
            body.itemId,
          ]),
          store.audit(body.itemId, 'case.acknowledged', {
            operator: 'Local operator',
            note: 'Acknowledgment does not release quarantine or certify safety.',
          }),
        ]);
        return Response.json({ acknowledged: true });
      }
      case 'task': {
        const task = await store.first('SELECT * FROM case_tasks WHERE id=?', [
          body.taskId,
        ]);
        if (!task) throw Error('Task not found');
        if (
          body.revision !==
          (await sha256(String(task.payload) + String(task.status)))
        )
          return Response.json(
            {
              error:
                'This task changed after you opened it. Refresh and review the latest values.',
            },
            { status: 409 },
          );
        const nextPayload = JSON.stringify({
          ...payload(task),
          owner: body.owner,
          dueDate: body.dueDate,
          priority: body.priority,
          updateId: id(),
        });
        const results = await store.db.batch([
          store.stmt(
            'UPDATE case_tasks SET status=?,payload=? WHERE id=? AND payload=? AND status=?',
            [body.status, nextPayload, body.taskId, task.payload, task.status],
          ),
          store.stmt(
            'INSERT INTO audit_events(id,created_at,payload,entity_id,event_type) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM case_tasks WHERE id=? AND payload=?)',
            [
              id(),
              now(),
              JSON.stringify(body),
              String(task.case_id),
              'task.updated',
              body.taskId,
              nextPayload,
            ],
          ),
        ]);
        if (!results[0].meta.changes)
          return Response.json(
            {
              error:
                'This task changed while saving. Refresh and review the latest values.',
            },
            { status: 409 },
          );
        return Response.json({
          updated: true,
          task: {
            ...payload({ ...task, payload: nextPayload }),
            id: task.id,
            caseId: task.case_id,
            status: body.status,
            revision: await sha256(nextPayload + body.status),
          },
        });
      }
      case 'wire': {
        const item = await store.first(
          'SELECT * FROM inventory_items WHERE id=?',
          [body.itemId],
        );
        if (!item) throw Error('Inventory not found');
        const result = await workflow.anakin.wire(body.asin);
        const fields = normalizeEnrichment(result.data);
        await store
          .audit(item.id, 'wire.enrichment', {
            action: 'am_product_details',
            asin: body.asin,
            ranAt: now(),
            providerJobId: result.id,
            contributedFields: Object.keys(fields),
            contributions: fields,
            rawData: publicProviderData(result.data),
          })
          .run();
        return Response.json({
          result: publicProviderData(result),
          contributedFields: Object.keys(fields),
          note: 'Listing data is retained as enrichment evidence; physical-unit eligibility facts are not inferred.',
        });
      }
      case 'monitor_create': {
        safeUrl(body.url);
        if (
          await store.first('SELECT * FROM monitor_subscriptions WHERE url=?', [
            body.url,
          ])
        )
          throw Error('A monitor already exists for this URL');
        const webhook = env.PUBLIC_BASE_URL
          ? new URL('/api/webhook', env.PUBLIC_BASE_URL).toString()
          : undefined;
        if (webhook && !webhook.startsWith('https:'))
          throw Error('PUBLIC_BASE_URL must be HTTPS');
        const m = await workflow.anakin.monitorCreate(body.url, webhook);
        if (typeof m.id !== 'string')
          throw Error('Monitor creation response missing ID');
        const secret =
          typeof m.alertWebhookSecret === 'string'
            ? m.alertWebhookSecret
            : undefined;
        const safe = { ...m };
        delete safe.alertWebhookSecret;
        const monitorId = id();
        await store
          .insert('monitor_subscriptions', {
            id: monitorId,
            created_at: now(),
            payload: JSON.stringify({
              label: 'LIVE_ANAKIN',
              state: publicProviderData(safe),
              webhookSecret: secret,
            }),
            url: body.url,
            provider_id: m.id,
          })
          .run();
        await store
          .audit(monitorId, 'monitor.created', {
            providerId: m.id,
            isActive: false,
          })
          .run();
        return Response.json({
          monitorId,
          providerId: m.id,
          state: publicProviderData(safe),
        });
      }
      case 'monitor_run': {
        const mon = await store.first(
          'SELECT * FROM monitor_subscriptions WHERE id=?',
          [body.monitorId],
        );
        if (!mon) throw Error('Monitor not found');
        return Response.json(await workflow.refreshMonitor(mon));
      }
      case 'retry_events': {
        const pending = await store.all(
          "SELECT * FROM monitor_events WHERE status IN ('pending','failed') LIMIT 5",
        );
        for (const event of pending) {
          try {
            await processEvent(store, workflow, event.id);
          } catch {
            // One exhausted event must not prevent the remaining events from retrying.
          }
        }
        const after = await Promise.all(
          pending.map((event) =>
            store.first('SELECT * FROM monitor_events WHERE id=?', [event.id]),
          ),
        );
        const succeeded = after.filter(
          (event) => event?.status === 'processed',
        ).length;
        return Response.json({
          attempted: pending.length,
          succeeded,
          remaining: pending.length - succeeded,
          message: pending.length
            ? `${succeeded} of ${pending.length} events processed; ${pending.length - succeeded} remain unresolved.`
            : 'No pending or failed events to retry.',
        });
      }
    }
  } catch (e) {
    return errorResponse(e);
  }
}
