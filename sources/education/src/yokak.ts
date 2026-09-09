import type { HtmlProfile } from '@sak/source-sdk';
export const yokakProfile: HtmlProfile = {
  sourceKey: 'yokak',
  title: 'h1.entry-title',
  body: '.entry-content',
  listing: 'h2.entry-title a',
  next: 'a.next.page-numbers',
  documentPattern: new RegExp('^/\\d{4}/\\d{2}/\\d{2}/'),
  scope: 'paginated_archive',
};
