import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  answerResources,
  canonicalPath,
  currentTurkishYear,
  resolveQuery,
} from '@sak/answers';
import { Search } from '../../components/search';
import { database } from '../../lib/product';
export const metadata: Metadata = {
  title: 'Arama',
  robots: { index: false, follow: true },
};
export const dynamic = 'force-dynamic';
export default async function Results({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const params = await searchParams;
  const q = typeof params.q === 'string' ? params.q : '';
  const result = resolveQuery(q);
  if (result.intent)
    redirect(canonicalPath(result.intent.resource, result.intent.year));
  const suggestions = [...result.suggestions];
  const client = database();
  if (client && result.normalized.length >= 3) {
    try {
      const lookup = await client.query<{ matches: unknown }>(
        'select search_answer_resources($1) matches',
        [result.normalized],
      );
      const matches = lookup[0]?.matches;
      if (Array.isArray(matches))
        for (const row of matches) {
          if (row && typeof row === 'object' && !Array.isArray(row)) {
            const resource = answerResources.find(
              (r) => r.key === row['resource_key'],
            );
            if (resource && !suggestions.includes(resource))
              suggestions.push(resource);
          }
        }
    } catch {
      // Deterministic aliases already provide the safe fallback.
    }
  }
  return (
    <section className="wrap narrow search-results">
      <p className="eyebrow">Arama</p>
      <h1>Biraz daha netleştirelim.</h1>
      <Search value={q.slice(0, 240)} compact />
      <p>{result.reason}</p>
      <p>Konuyu ve yılı birlikte yazabilirsin: “2026 YKS ek tercih”.</p>
      {suggestions.length > 0 && (
        <>
          <h2>Bunlardan birini mi arıyorsun?</h2>
          <ul>
            {suggestions.map((r) => (
              <li key={r.key}>
                <Link href={canonicalPath(r, currentTurkishYear())}>
                  {r.question}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      <form action="/api/feedback" method="post" className="feedback">
        <input type="hidden" name="kind" value="unresolved" />
        <input type="hidden" name="query" value={q.slice(0, 240)} />
        <p>
          Bu aramadaki konu kelimeleri kapsama alanımızı geliştirmemize yardımcı
          olabilir. Ham arama metnini saklamıyoruz.
        </p>
        <button type="submit">Eksik konuyu anonim bildir</button>
      </form>
    </section>
  );
}
