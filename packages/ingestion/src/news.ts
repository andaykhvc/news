import {
  structureSchema,
  type DocumentVersion,
  type AllowedHost,
} from '@sak/domain';
import { validateSourceUrl } from '@sak/validation';

export interface NewsExcerpt {
  text: string;
  start: number;
  end: number;
}
export interface NewsAction {
  label: string;
  url: string;
}
/** Extractive reporting: every sentence remains an exact quote, never a model claim. */
export function extractNews(
  version: DocumentVersion,
  sourceId: string,
  hosts: AllowedHost[],
) {
  const structure = structureSchema.safeParse(version.metadata['structure']);
  if (
    !structure.success ||
    structure.data.warnings.length ||
    version.mime_type !== 'text/html'
  )
    return { excerpts: [], actions: [], reason: 'parser_requires_review' };
  const excerpts: NewsExcerpt[] = [];
  const segmenter = new Intl.Segmenter('tr', { granularity: 'sentence' });
  for (const block of structure.data.blocks) {
    if (!['paragraph', 'list_item'].includes(block.kind)) continue;
    const text = version.raw_text.slice(block.start, block.end);
    if (
      text === version.title ||
      /^DUYURU\b|^ÖSYM BAŞKANLIĞI|^Adaylara ve kamuoyuna/u.test(text)
    )
      continue;
    for (const sentence of segmenter.segment(text)) {
      const quote = sentence.segment.trim();
      if (
        quote.length < 35 ||
        !/[.!?]["”’']?$/u.test(quote) ||
        excerpts.some((e) => e.text === quote)
      )
        continue;
      const start =
        block.start + sentence.index + sentence.segment.indexOf(quote);
      excerpts.push({ text: quote, start, end: start + quote.length });
      if (excerpts.length === 4) break;
    }
    if (excerpts.length === 4) break;
  }
  const actions: NewsAction[] = [];
  const links = version.metadata['official_links'];
  if (Array.isArray(links))
    for (const link of links) {
      if (
        !link ||
        typeof link !== 'object' ||
        Array.isArray(link) ||
        typeof link['url'] !== 'string'
      )
        continue;
      const url = link['url'];
      if (!validateSourceUrl(url, sourceId, hosts).ok) continue;
      const host = new URL(url).hostname;
      let label: string | undefined;
      if (host === 'sonuc.osym.gov.tr' || host === 'ykssonuc.osym.gov.tr')
        label = /YKS/u.test(version.title)
          ? 'YKS sonuçlarını görüntüle'
          : 'Sonuçları görüntüle';
      else if (host === 'ais.osym.gov.tr') label = 'ÖSYM Aday İşlemleri’ne git';
      else if (
        typeof link['text'] === 'string' &&
        /sonuç|başvur|tercih|kılavuz/iu.test(link['text'])
      )
        label = link['text'].slice(0, 140);
      if (label && !actions.some((a) => a.url === url))
        actions.push({ label, url });
      if (actions.length === 4) break;
    }
  return {
    excerpts,
    actions,
    reason: excerpts.length ? null : 'no_supported_sentences',
  };
}
