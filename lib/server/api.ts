import { limitedText } from '../core/limits';
import { getDb, config } from '../../db';
import { Store } from './store';
import { Workflow } from './workflow';
export function context(req: Request) {
  const url = new URL(req.url),
    env = config();
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    !local &&
    (!env.OPERATOR_TOKEN ||
      req.headers.get('authorization') !== `Bearer ${env.OPERATOR_TOKEN}`)
  )
    throw Error(
      'Unauthorized: configure and provide the operator token for remote access',
    );
  const origin = req.headers.get('origin');
  if (origin && origin !== url.origin)
    throw Error('Cross-origin request rejected');
  const store = new Store(getDb());
  return { store, workflow: new Workflow(store, env.ANAKIN_API_KEY), env };
}
export async function limited(store: Store, key: string, max = 10) {
  const window = Math.floor(Date.now() / 60000);
  await store.run(
    'INSERT INTO rate_limits (id,window,count) VALUES (?,?,1) ON CONFLICT(id) DO UPDATE SET count=CASE WHEN window=? THEN count+1 ELSE 1 END,window=?',
    [key, window, window, window],
  );
  const row = await store.first('SELECT * FROM rate_limits WHERE id=?', [key]);
  if (Number(row?.count) > max)
    throw Error('Rate limit reached. Wait one minute before retrying.');
}
export async function readBody(req: Request, max = 300000) {
  return limitedText(req.body, max);
}
export function errorResponse(e: unknown) {
  const message = e instanceof Error ? e.message : 'Request failed';
  return Response.json(
    { error: message.slice(0, 600) },
    {
      status: message.startsWith('Unauthorized')
        ? 401
        : message.includes('Rate limit')
          ? 429
          : 400,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
