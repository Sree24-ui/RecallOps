import { createHmac } from 'node:crypto';
import { config, getDb } from '@/db';
import { Store } from '@/lib/server/store';
import { readBody, errorResponse } from '@/lib/server/api';
import {
  createSession,
  localAccess,
  requireSameOrigin,
  sameSecret,
  sessionCookie,
  sessionState,
} from '@/lib/server/session';
const headers = { 'Cache-Control': 'no-store', Vary: 'Cookie' };
export async function GET(req: Request) {
  return Response.json(sessionState(req, config()), { headers });
}
export async function POST(req: Request) {
  try {
    requireSameOrigin(req);
    const env = config();
    if (localAccess(req, env))
      return Response.json(sessionState(req, env), { headers });
    if (!env.OPERATOR_TOKEN)
      return Response.json(
        { error: 'Workspace sign-in is not configured yet.' },
        { status: 503, headers },
      );
    const body = JSON.parse(await readBody(req, 5000));
    if (
      typeof body?.token !== 'string' ||
      !body.token.trim() ||
      body.token.length > 4096
    )
      return Response.json(
        { error: 'Enter your owner access key.' },
        { status: 400, headers },
      );
    // The Vercel edge overwrites this header. Hash it so no raw IP is stored.
    const identity = env.hosted
      ? req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
        'unidentified'
      : new URL(req.url).hostname;
    const key =
      'signin:' +
      createHmac('sha256', env.OPERATOR_TOKEN).update(identity).digest('hex');
    const store = new Store(getDb());
    const window = Math.floor(Date.now() / 60000);
    const attempt = await store.first(
      'INSERT INTO rate_limits (id,window,count) VALUES (?,?,1) ON CONFLICT(id) DO UPDATE SET count=CASE WHEN window=? THEN count+1 ELSE 1 END,window=? RETURNING count',
      [key, window, window, window],
    );
    if (Number(attempt?.count) > 10)
      return Response.json(
        {
          error:
            'Too many sign-in attempts. Please wait one minute and try again.',
        },
        { status: 429, headers: { ...headers, 'Retry-After': '60' } },
      );
    if (!sameSecret(body.token.trim(), env.OPERATOR_TOKEN)) {
      return Response.json(
        {
          error:
            'That access key was not recognized. Use the key from your private owner-access file.',
        },
        { status: 401, headers },
      );
    }
    await store.run('DELETE FROM rate_limits WHERE id=?', [key]);
    const session = createSession(env.OPERATOR_TOKEN);
    return Response.json(
      { authenticated: true, mode: 'operator', expiresAt: session.expiresAt },
      {
        headers: {
          ...headers,
          'Set-Cookie': sessionCookie(session.value, req),
        },
      },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function DELETE(req: Request) {
  try {
    requireSameOrigin(req);
    const env = config();
    return Response.json(
      {
        authenticated: localAccess(req, env),
        mode: localAccess(req, env)
          ? 'local'
          : env.OPERATOR_TOKEN
            ? 'operator'
            : 'unconfigured',
      },
      { headers: { ...headers, 'Set-Cookie': sessionCookie('', req, true) } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
