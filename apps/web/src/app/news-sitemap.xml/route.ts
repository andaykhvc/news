import { newsFeed } from '../../lib/product';
import { renderNewsSitemap } from '../../lib/seo';

export const dynamic = 'force-dynamic';

export async function GET() {
  const articles = await newsFeed(1000);
  return new Response(renderNewsSitemap(articles), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
    },
  });
}
