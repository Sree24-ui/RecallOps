import { Store, payload } from './store';
import { Workflow } from './workflow';
export async function processEvent(
  store: Store,
  workflow: Workflow,
  eventId: string,
) {
  const event = await store.first('SELECT * FROM monitor_events WHERE id=?', [
    eventId,
  ]);
  if (!event || event.status === 'processed' || event.status === 'processing')
    return;
  const data = payload<{ attempts?: number; url: string }>(event);
  if ((data.attempts ?? 0) >= 3)
    throw Error('Event retry limit reached; inspect source manually');
  const claimed = await store.run(
    "UPDATE monitor_events SET status='processing',payload=? WHERE id=? AND status IN ('pending','failed')",
    [JSON.stringify({ ...data, attempts: (data.attempts ?? 0) + 1 }), eventId],
  );
  if (!claimed.meta.changes) return;
  try {
    const result = await workflow.reassessUrl(data.url);
    await store.db.batch([
      store.stmt("UPDATE monitor_events SET status='processed' WHERE id=?", [
        eventId,
      ]),
      store.audit(eventId, 'monitor.reassessed', result),
    ]);
  } catch (e) {
    await store.run(
      "UPDATE monitor_events SET status='failed',payload=? WHERE id=?",
      [
        JSON.stringify({
          ...data,
          attempts: (data.attempts ?? 0) + 1,
          error: e instanceof Error ? e.message : 'Reassessment failed',
        }),
        eventId,
      ],
    );
  }
}
