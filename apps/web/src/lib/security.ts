import 'server-only';
import {
  createHmac,
  timingSafeEqual,
  scryptSync,
  randomBytes,
} from 'node:crypto';
import { cookies } from 'next/headers';
import { database, siteUrl } from './product';
export const adminCookie = 'sak_admin';
function secret(): string {
  const value = process.env['ADMIN_SESSION_SECRET'] ?? '';
  if (value.length < 32) throw new Error('Admin is not configured');
  return value;
}
function sign(value: string): string {
  return createHmac('sha256', secret()).update(value).digest('base64url');
}
function equal(a: string, b: string): boolean {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function adminConfigured() {
  return (
    !!process.env['ADMIN_PASSWORD_SCRYPT'] &&
    (process.env['ADMIN_SESSION_SECRET']?.length ?? 0) >= 32 &&
    !!database()
  );
}
export function checkPassword(password: string): boolean {
  const [salt, hash] = (process.env['ADMIN_PASSWORD_SCRYPT'] ?? '').split(':');
  if (!salt || !hash || !/^[a-f0-9]{128}$/.test(hash) || password.length > 200)
    return false;
  return equal(scryptSync(password, salt, 64).toString('hex'), hash);
}
export function makeSession() {
  const payload = `${Date.now() + 8 * 3600 * 1000}.${randomBytes(24).toString('base64url')}`;
  return `${payload}.${sign(payload)}`;
}
export function validSession(value: string | undefined): boolean {
  if (!value || !adminConfigured()) return false;
  const [expires, nonce, signature] = value.split('.');
  return (
    !!expires &&
    !!nonce &&
    !!signature &&
    Number(expires) > Date.now() &&
    Number(expires) <= Date.now() + 8 * 3600 * 1000 &&
    equal(signature, sign(`${expires}.${nonce}`))
  );
}
export async function isAdmin() {
  return validSession((await cookies()).get(adminCookie)?.value);
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const allowed = [siteUrl()];
  if (process.env['VERCEL_URL'])
    allowed.push(`https://${process.env['VERCEL_URL']}`);
  if (process.env['NODE_ENV'] !== 'production')
    allowed.push(new URL(request.url).origin);
  return origin !== null && allowed.includes(origin);
}
export async function rateLimit(request: Request, kind: string, limit: number) {
  const client = database();
  if (!client) return false;
  const dailySalt =
    process.env['ANALYTICS_SALT'] ?? process.env['ADMIN_SESSION_SECRET'];
  if (!dailySalt || dailySalt.length < 32) return false;
  // Key rotates daily, expires within a day, and is never attached to queries or facts.
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const key = createHmac('sha256', dailySalt)
    .update(`${new Date().toISOString().slice(0, 10)}:${kind}:${ip}`)
    .digest('hex');
  const result = await client
    .rpc('consume_product_limit', {
      p_key: key,
      p_limit: limit,
      p_seconds: 3600,
    })
    .abortSignal(AbortSignal.timeout(3000));
  return !result.error && result.data;
}
