import { providerLimits } from '../core/runtime-policy';
import { Store, id, now, payload, type Row } from './store';
import { Workflow } from './workflow';
export const EVENT_ATTEMPT_LIMIT = 3;
// A crashed function must not strand a claimed event forever. Give an active
// provider workflow its full time budget plus the persistence allowance.
export const EVENT_LEASE_MS = providerLimits.workflowDurationMs + 60_000;
type EventData = {
  attempts?: number;
  url: string;
  processingStartedAt?: string;
  processingClaimId?: string;
};
function activeLease(event: Row, data: EventData, time: number) {
  return (
    event.status === 'processing' &&
    Date.parse(data.processingStartedAt ?? event.created_at) >
      time - EVENT_LEASE_MS
  );
}
export async function retryableEvents(store: Store, limit = 5) {
  return store.all(
    `SELECT * FROM monitor_events
     WHERE status IN ('pending','failed','processing')
       AND COALESCE(json_extract(payload,'$.attempts'),0) < ?
       AND (status!='processing' OR
         COALESCE(json_extract(payload,'$.processingStartedAt'),created_at) <= ?)
     ORDER BY created_at,id LIMIT ?`,
    [
      EVENT_ATTEMPT_LIMIT,
      new Date(Date.now() - EVENT_LEASE_MS).toISOString(),
      limit,
    ],
  );
}
export async function processEvent(
  store: Store,
  workflow: Workflow,
  eventId: string,
) {
  const event = await store.first('SELECT * FROM monitor_events WHERE id=?', [
    eventId,
  ]);
  if (
    !event ||
    !['pending', 'failed', 'processing'].includes(String(event.status))
  )
    return;
  const data = payload<EventData>(event);
  if (activeLease(event, data, Date.now())) return;
  if ((data.attempts ?? 0) >= EVENT_ATTEMPT_LIMIT)
    throw Error('Event retry limit reached; inspect source manually');
  const claim = {
    ...data,
    attempts: (data.attempts ?? 0) + 1,
    processingStartedAt: now(),
    processingClaimId: id(),
  };
  const claimPayload = JSON.stringify(claim);
  const claimed = await store.run(
    "UPDATE monitor_events SET status='processing',payload=? WHERE id=? AND status=? AND payload=?",
    [claimPayload, eventId, event.status, event.payload],
  );
  if (!claimed.meta.changes) return;
  try {
    const result = await workflow.reassessUrl(data.url);
    await store.db.batch([
      store.stmt(
        "UPDATE monitor_events SET status='processed' WHERE id=? AND status='processing' AND payload=?",
        [eventId, claimPayload],
      ),
      store.stmt(
        "INSERT INTO audit_events(id,created_at,payload,entity_id,event_type) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM monitor_events WHERE id=? AND status='processed' AND payload=?)",
        [
          id(),
          now(),
          JSON.stringify(result),
          eventId,
          'monitor.reassessed',
          eventId,
          claimPayload,
        ],
      ),
    ]);
  } catch (e) {
    await store.run(
      "UPDATE monitor_events SET status='failed',payload=? WHERE id=? AND status='processing' AND payload=?",
      [
        JSON.stringify({
          ...claim,
          error: e instanceof Error ? e.message : 'Reassessment failed',
        }),
        eventId,
        claimPayload,
      ],
    );
  }
}
