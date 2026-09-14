import { newsArticle } from '../../../lib/product';
import {
  llmsTxtUrl,
  publicArticleUrl,
  renderArticleMarkdown,
} from '../../../lib/seo';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Props) {
  const { id } = await params;
  const article = await newsArticle(id);
  if (!article) {
    return new Response('Not Found\n', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  }
  return new Response(renderArticleMarkdown(article), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'X-Robots-Tag': 'noindex, follow',
      Link: `<${publicArticleUrl(article.id)}>; rel="canonical", <${llmsTxtUrl()}>; rel="describedby"`,
    },
  });
}
