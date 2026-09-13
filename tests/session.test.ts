import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authorized,
  createSession,
  localAccess,
  requireSameOrigin,
  sessionCookie,
  sessionState,
  SESSION_COOKIE,
  SESSION_SECONDS,
  verifySession,
} from '../lib/server/session';
const key = 'isolated-session-test-key-with-high-entropy';
const host = 'https://recallops.test';
const env = { hosted: true, OPERATOR_TOKEN: key };
const cookieRequest = (value: string) =>
  new Request(host + '/api/workspace', {
    headers: { cookie: `${SESSION_COOKIE}=${value}` },
  });
void test('signed owner session contains no access key and expires at its bound', () => {
  const time = Date.now(),
    session = createSession(key, time);
  assert.equal(session.value.includes(key), false);
  assert.equal(verifySession(session.value, key, time), session.expiresAt);
  assert.equal(
    verifySession(session.value, key, time + SESSION_SECONDS * 1000),
    null,
  );
  assert.equal(verifySession(session.value, key, time - 2000), null);
});
void test('tampering, malformed sessions and key rotation never authenticate', () => {
  const { value } = createSession(key);
  for (const broken of [
    value + 'x',
    value.split('.')[0] + '.bad',
    'bad',
    '.',
    'x'.repeat(1100),
    value.replace(/^./, value[0] === 'A' ? 'B' : 'A'),
  ])
    assert.equal(verifySession(broken, key), null);
  assert.equal(verifySession(value, key + 'rotated'), null);
  assert.equal(authorized(cookieRequest(value + 'x'), env), false);
});
void test('workspace accepts a verified cookie and preserves explicit bearer API access', () => {
  const { value } = createSession(key);
  assert.equal(authorized(cookieRequest(value), env), true);
  assert.equal(sessionState(cookieRequest(value), env).mode, 'operator');
  assert.equal(
    authorized(
      new Request(host, { headers: { Authorization: `Bearer ${key}` } }),
      env,
    ),
    true,
  );
  assert.equal(
    authorized(
      new Request(host, { headers: { Authorization: 'Bearer wrong' } }),
      env,
    ),
    false,
  );
  assert.equal(authorized(new Request(host), env), false);
});
void test('hosted execution cannot bypass owner access with a loopback URL', () => {
  assert.equal(localAccess(new Request('http://localhost'), env), false);
  assert.equal(authorized(new Request('http://localhost'), env), false);
  assert.equal(
    sessionState(new Request('http://localhost'), { hosted: false }).mode,
    'local',
  );
  assert.equal(
    sessionState(new Request(host), { hosted: true }).mode,
    'unconfigured',
  );
});
void test('session cookie is HttpOnly, same-site restricted, expiring, secure on HTTPS and cleared on logout', () => {
  const encoded = sessionCookie(createSession(key).value, new Request(host));
  for (const flag of [
    'HttpOnly',
    'SameSite=Strict',
    'Secure',
    'Path=/',
    'Max-Age=43200',
  ])
    assert.ok(encoded.includes(flag));
  const clear = sessionCookie('', new Request(host), true);
  assert.ok(clear.includes('Max-Age=0'));
  assert.equal(
    sessionState(new Request(host, { headers: { Cookie: clear } }), env)
      .authenticated,
    false,
  );
});
void test('session mutations require the exact origin including rejection of absent origins', () => {
  for (const origin of [
    undefined,
    'https://attacker.test',
    'null',
    'https://recallops.test.attacker.test',
  ])
    assert.throws(
      () =>
        requireSameOrigin(
          new Request(host + '/api/session', {
            method: 'POST',
            headers: origin ? { Origin: origin } : {},
          }),
        ),
      /Cross-origin/,
    );
  assert.doesNotThrow(() =>
    requireSameOrigin(
      new Request(host + '/api/session', {
        method: 'POST',
        headers: { Origin: host },
      }),
    ),
  );
});
