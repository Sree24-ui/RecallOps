import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

export const SESSION_COOKIE = 'recallops_session';
export const SESSION_SECONDS = 12 * 60 * 60;
type Environment = { hosted: boolean; OPERATOR_TOKEN?: string };
export function sameSecret(a: string, b: string) {
  return timingSafeEqual(
    createHash('sha256').update(a).digest(),
    createHash('sha256').update(b).digest(),
  );
}
export function localAccess(req: Request, env: Environment) {
  return (
    !env.hosted &&
    ['localhost', '127.0.0.1', '[::1]'].includes(new URL(req.url).hostname)
  );
}
export function requireSameOrigin(req: Request) {
  if (req.headers.get('origin') !== new URL(req.url).origin)
    throw Error('Cross-origin request rejected');
}
export function createSession(key: string, time = Date.now()) {
  const exp = Math.floor(time / 1000) + SESSION_SECONDS;
  const body = Buffer.from(
    JSON.stringify({ v: 1, exp, nonce: randomBytes(24).toString('base64url') }),
  ).toString('base64url');
  const signature = createHmac('sha256', key)
    .update('recallops-session:' + body)
    .digest('base64url');
  return {
    value: `${body}.${signature}`,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}
export function verifySession(
  value: string,
  key: string,
  time = Date.now(),
): string | null {
  if (value.length > 1000) return null;
  const parts = value.split('.');
  if (parts.length !== 2 || !parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p)))
    return null;
  const [body, signature] = parts;
  const expected = createHmac('sha256', key)
    .update('recallops-session:' + body)
    .digest('base64url');
  if (!sameSecret(signature, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    const now = Math.floor(time / 1000);
    if (
      data.v !== 1 ||
      !Number.isSafeInteger(data.exp) ||
      data.exp <= now ||
      data.exp > now + SESSION_SECONDS ||
      typeof data.nonce !== 'string'
    )
      return null;
    return new Date(data.exp * 1000).toISOString();
  } catch {
    return null;
  }
}
export function sessionState(
  req: Request,
  env: Environment,
  time = Date.now(),
) {
  if (localAccess(req, env))
    return { authenticated: true, mode: 'local' as const };
  if (!env.OPERATOR_TOKEN)
    return { authenticated: false, mode: 'unconfigured' as const };
  const cookie = req.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(SESSION_COOKIE + '='))
    ?.slice(SESSION_COOKIE.length + 1);
  const expiresAt = cookie
    ? verifySession(cookie, env.OPERATOR_TOKEN, time)
    : null;
  return {
    authenticated: !!expiresAt,
    mode: 'operator' as const,
    ...(expiresAt ? { expiresAt } : {}),
  };
}
export function authorized(req: Request, env: Environment) {
  if (localAccess(req, env)) return true;
  if (!env.OPERATOR_TOKEN) return false;
  const bearer = /^Bearer (.+)$/i.exec(
    req.headers.get('authorization') ?? '',
  )?.[1];
  return (
    (!!bearer && sameSecret(bearer, env.OPERATOR_TOKEN)) ||
    sessionState(req, env).authenticated
  );
}
export function sessionCookie(value: string, req: Request, clear = false) {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : SESSION_SECONDS}${new URL(req.url).protocol === 'https:' ? '; Secure' : ''}`;
}
