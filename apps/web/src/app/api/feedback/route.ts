import { NextResponse } from 'next/server';
import { answerResources, privateQuerySummary } from '@sak/answers';
import { database } from '../../../lib/product';
import { sameOrigin, rateLimit } from '../../../lib/security';
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return new Response('Geçersiz istek', { status: 403 });
  if (!(await rateLimit(request, 'feedback', 30)))
    return new Response(
      'Bildirim şu anda alınamıyor. Lütfen daha sonra deneyin.',
      { status: 429 },
    );
  const form = await request.formData(),
    kind = form.get('kind');
  let key: string | null = null;
  if (kind === 'unresolved') {
    const query = form.get('query');
    if (typeof query === 'string') key = privateQuerySummary(query);
  } else if (kind === 'helpful' || kind === 'unhelpful') {
    const resource = answerResources.find(
      (r) => r.key === form.get('resource'),
    );
    const year = form.get('year');
    if (resource && typeof year === 'string' && /^(19|20|21)\d{2}$/.test(year))
      key = `${resource.key}:${year}`;
  }
  if (!key || typeof kind !== 'string')
    return new Response('Kaydedilebilir bir konu bulunamadı.', { status: 400 });
  const client = database();
  const result = await client
    ?.rpc('record_product_event', { p_kind: kind, p_key: key })
    .abortSignal(AbortSignal.timeout(3000));
  if (!result || result.error)
    return new Response('Bildirim kaydedilemedi.', { status: 503 });
  return new NextResponse(null, {
    status: 303,
    headers: { Location: '/tesekkurler' },
  });
}
