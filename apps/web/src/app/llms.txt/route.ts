import { officialNewsFeed } from '../../lib/product';
import { renderLlmsText } from '../../lib/seo';

export const dynamic = 'force-dynamic';

export async function GET() {
  const articles = await officialNewsFeed(5);
  return new Response(renderLlmsText(articles), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
