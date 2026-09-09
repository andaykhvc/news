import { NextResponse } from 'next/server';
import { adminCookie, sameOrigin } from '../../../../lib/security';
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return new Response('Geçersiz istek', { status: 403 });
  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: '/admin' },
  });
  response.cookies.delete(adminCookie);
  return response;
}
