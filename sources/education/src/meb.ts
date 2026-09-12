import type { HtmlProfile } from '@sak/source-sdk';
export const mebProfile: HtmlProfile = {
  sourceKey: 'meb',
  title: 'h2.main-title',
  body: '.content.article-detay',
  publication: '.content.article-detay .content-image .date',
  listing: 'a.news-title, .announcements a[href]',
  next: '',
  documentPattern: new RegExp('/haber/\\d+/tr$'),
  scope: 'rolling_window',
};
