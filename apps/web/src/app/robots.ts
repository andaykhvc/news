import type { MetadataRoute } from 'next';
import { siteUrl } from '../lib/product';
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/api', '/ara'] },
    sitemap: siteUrl() + '/sitemap.xml',
  };
}
