import { displayString } from '../core/text';
export const sourceHosts = [
  'www.cpsc.gov',
  'cpsc.gov',
  'iniushop.com',
  'b41recall.iniushop.com',
];
export function safeUrl(raw: string, hosts = sourceHosts): string {
  const u = new URL(raw);
  if (
    u.protocol !== 'https:' ||
    u.username ||
    u.password ||
    u.port ||
    !hosts.includes(u.hostname.toLowerCase())
  )
    throw Error('URL must use HTTPS on an approved official source domain');
  u.hash = '';
  return u.toString();
}
export const escapeHtml = (s: unknown) =>
  displayString(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
export const redact = (s: string) =>
  s
    .replace(/(?:sk-|gh[opusr]_|anakin[_-]|ask_)[A-Za-z0-9_-]+/gi, '[REDACTED]')
    .slice(0, 500);
export async function sha256(s: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}
export async function verifyWebhook(
  body: string,
  signature: string | null,
  secret: string,
): Promise<boolean> {
  if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/.test(signature))
    return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const bytes = Uint8Array.from(signature.slice(7).match(/../g)!, (x) =>
    parseInt(x, 16),
  );
  return crypto.subtle.verify(
    'HMAC',
    key,
    bytes,
    new TextEncoder().encode(body),
  );
}
export function publicProviderData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(publicProviderData);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([k]) =>
            !/(secret|token|api.?key|authorization|cookie|credential)/i.test(k),
        )
        .map(([k, v]) => [k, publicProviderData(v)]),
    );
  return value;
}
