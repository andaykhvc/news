import type { HtmlProfile } from '@sak/source-sdk';
export const gsbProfile: HtmlProfile = {
  sourceKey: 'gsb',
  title: '.Text h3, .btn-breadcrumb a:last-child',
  body: '.Text.sesliOku',
  listing: 'a.duyuruLink, .post-title a',
  next: '',
  documentPattern: new RegExp('^/(Duyuru|HaberDetaylari)/'),
  scope: 'rolling_window',
};
