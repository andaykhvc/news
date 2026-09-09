import type { HtmlProfile } from '@sak/source-sdk';
export const osymProfile: HtmlProfile = {
  sourceKey: 'osym',
  title: '.row.title h3',
  body: '.row.content > .col-sm-9',
  listing: 'a.duyuru-list-item',
  next: '',
  documentPattern: new RegExp('^/[^/]+$'),
  scope: 'rolling_window',
};
