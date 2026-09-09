import { waitUntil } from 'cloudflare:workers';
import { z } from 'zod';
import { getDb, config } from '../../../db';
import { Store, id, now, payload } from '../../../lib/server/store';
import { Workflow } from '../../../lib/server/workflow';
import { verifyWebhook, sha256 } from '../../../lib/server/security';
import { readBody, errorResponse } from '../../../lib/server/api';
import { processEvent } from '../../../lib/server/events';
const eventSchema = z.object({
  type: z.literal('monitor.change'),
  monitorId: z.string().min(1).max(200),
  changeId: z.string().min(1).max(200),
  changedAt: z.string().optional(),
});
export async function POST(req: Request) {
  try {
    const body = await readBody(req, 100000);
    const parsed = eventSchema.parse(JSON.parse(body));
    const store = new Store(getDb());
    const monitor = await store.first(
      'SELECT * FROM monitor_subscriptions WHERE provider_id=?',
      [parsed.monitorId],
    );
    if (!monitor)
      return Response.json({ error: 'Unknown monitor' }, { status: 401 });
    const secretValue = payload(monitor).webhookSecret;
    const secret = typeof secretValue === 'string' ? secretValue : '';
    if (
      !(await verifyWebhook(
        body,
        req.headers.get('X-Anakin-Signature'),
        secret,
      ))
    )
      return Response.json({ error: 'Invalid signature' }, { status: 401 });
    const key = await sha256(`${parsed.monitorId}:${parsed.changeId}`);
    const old = await store.first(
      'SELECT * FROM monitor_events WHERE event_key=?',
      [key],
    );
    if (old) return Response.json({ accepted: true, duplicate: true });
    const eventId = id();
    await store.run(
      'INSERT OR IGNORE INTO monitor_events (id,created_at,payload,monitor_id,event_key,status) VALUES (?,?,?,?,?,?)',
      [
        eventId,
        now(),
        JSON.stringify({
          type: parsed.type,
          changeId: parsed.changeId,
          url: monitor.url,
          providerMonitorId: parsed.monitorId,
          deliveryId: req.headers.get('X-Anakin-Delivery-Id'),
          attempts: 0,
        }),
        monitor.id,
        key,
        'pending',
      ],
    );
    waitUntil(
      processEvent(
        store,
        new Workflow(store, config().ANAKIN_API_KEY),
        eventId,
      ),
    );
    return Response.json({ accepted: true }, { status: 202 });
  } catch (e) {
    return errorResponse(e);
  }
}
