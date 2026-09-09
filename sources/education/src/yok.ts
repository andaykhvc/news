import type { HtmlProfile } from '@sak/source-sdk';
export const yokProfile: HtmlProfile = {
  sourceKey: 'yok',
  title: '.post-content h2.title',
  body: '.post-content > div',
  listing: '.item-content h3.title a',
  next: 'a[rel="next"]',
  documentPattern: new RegExp('^/tr/announcements/[^/]+$'),
  scope: 'paginated_archive',
  attachmentPattern: new RegExp('/tr/document/\\d+'),
};
