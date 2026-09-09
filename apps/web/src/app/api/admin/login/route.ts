import { NextResponse } from 'next/server';
import {
  adminConfigured,
  adminCookie,
  checkPassword,
  makeSession,
  sameOrigin,
  rateLimit,
} from '../../../../lib/security';
export async function POST(request: Request) {
  if (!sameOrigin(request) || !adminConfigured())
    return new Response('Erişim kapalı', { status: 403 });
  if (!(await rateLimit(request, 'admin-login', 8)))
    return new Response('Lütfen daha sonra deneyin', { status: 429 });
  const data = await request.formData();
  const password = data.get('password');
  if (typeof password !== 'string' || !checkPassword(password))
    return new Response('Giriş başarısız', { status: 401 });
  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: '/admin' },
  });
  response.cookies.set(adminCookie, makeSession(), {
    httpOnly: true,
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 8 * 3600,
  });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
