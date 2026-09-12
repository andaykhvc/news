import { formatDate } from '@sak/answers';

/** Publication is the source's date in Turkey, never the server's calendar day. */
export function NewsDate({
  publishedAt,
  checkedAt,
}: {
  publishedAt: string | null;
  checkedAt: string;
}) {
  return (
    <span className="announcement-date">
      {publishedAt ? (
        <>
          Yayın tarihi ·{' '}
          <time dateTime={publishedAt}>{formatDate(publishedAt)}</time>
        </>
      ) : (
        <>
          Yayın tarihi belirlenemedi · Son kontrol:{' '}
          <time dateTime={checkedAt}>{formatDate(checkedAt)}</time>
        </>
      )}
    </span>
  );
}
