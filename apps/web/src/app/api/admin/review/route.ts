import { NextResponse } from 'next/server';
import { z } from 'zod';
import { answerResources, resolveAnswer } from '@sak/answers';
import { loadAnswerSnapshot } from '@sak/database';
import { isAdmin, sameOrigin } from '../../../../lib/security';
import { database } from '../../../../lib/product';
const formSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(['publish', 'review', 'reject', 'correct']),
  reason: z.string().trim().min(12).max(1000),
  updated_at: z.string().optional(),
  replacement: z.string().uuid().optional(),
});
export async function POST(request: Request) {
  if (!sameOrigin(request) || !(await isAdmin()))
    return new Response('Yetkisiz işlem', { status: 403 });
  const form = formSchema.safeParse(
    Object.fromEntries(await request.formData()),
  );
  const client = database();
  if (!form.success || !client)
    return new Response('Geçersiz işlem', { status: 400 });
  const input = form.data;
  const reviewer = process.env['ADMIN_OPERATOR'] ?? 'configured-operator';
  try {
    if (input.action === 'correct') {
      if (!input.replacement)
        return new Response('Yeni fact gerekli', { status: 400 });
      await client.query(
        'select resolve_fact_correction($1::uuid,$2::uuid,$3,$4)',
        [input.id, input.replacement, input.reason, reviewer],
      );
    } else {
      if (!input.updated_at || !Number.isFinite(Date.parse(input.updated_at)))
        return new Response('Sürüm gerekli', { status: 400 });
      if (input.action === 'publish') {
        const row = await client.query<{ reference_period: string | null }>(
          'select reference_period from facts where id=$1::uuid',
          [input.id],
        );
        if (
          !row[0]?.reference_period ||
          !/^\d{4}$/.test(row[0].reference_period)
        )
          throw new Error('Fact missing');
        const year = Number(row[0].reference_period);
        const snapshot = await loadAnswerSnapshot(
          client,
          answerResources.map((r) => r.entity),
          year,
        );
        const fact = snapshot.facts.find((f) => f.id === input.id);
        if (!fact || fact.status !== 'verified')
          throw new Error('Fact is not verified');
        const resource = answerResources.find(
          (r) =>
            r.entity ===
              snapshot.entities.find((e) => e.id === fact.subject_entity_id)
                ?.key &&
            r.predicate === fact.predicate &&
            r.topic ===
              snapshot.topics.find((t) => t.id === fact.topic_id)?.key,
        );
        if (!resource) throw new Error('No registered answer resource');
        fact.status = 'published';
        fact.published_at = new Date().toISOString();
        const resolved = resolveAnswer(
          resource,
          year,
          snapshot,
          new Date().toISOString(),
        );
        if (resolved.factId !== fact.id || resolved.stale)
          throw new Error('Publication gates failed');
      }
      await client.query(
        'select review_product_fact($1::uuid,$2::timestamptz,$3,$4,$5)',
        [input.id, input.updated_at, input.action, input.reason, reviewer],
      );
    }
    return new NextResponse(null, {
      status: 303,
      headers: { Location: '/admin?result=ok' },
    });
  } catch {
    return new NextResponse(null, {
      status: 303,
      headers: { Location: '/admin?result=error' },
    });
  }
}
