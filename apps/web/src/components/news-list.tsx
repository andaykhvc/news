import Link from 'next/link';
import { NewsDate } from './news-date';
import type { FeedItem } from '../lib/news-feed';
import { newsCategoryLabels } from '../lib/news-categories';
export function NewsList({ items }: { items: FeedItem[] }) {
  return (
    <ol className="announcement-list">
      {items.map((item) => (
        <li key={item.id}>
          <Link href={item.href} prefetch={false}>
            <span className="announcement-source">
              {newsCategoryLabels[item.category]} · {item.source}
            </span>
            <strong>{item.title}</strong>
            <span className="announcement-excerpt">{item.excerpt}</span>
            <NewsDate
              publishedAt={item.publishedAt}
              checkedAt={item.checkedAt}
            />
            {item.conflicts && (
              <span className="announcement-conflict">
                Kaynaklarda farklı bilgiler var
              </span>
            )}
            <span className="announcement-arrow" aria-hidden="true">
              ↗
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
