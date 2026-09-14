export function siteUrl() {
  const value = process.env['PUBLIC_SITE_URL'];
  if (!value) {
    const domain = process.env['VERCEL_PROJECT_PRODUCTION_URL'];
    return domain
      ? new URL('https://' + domain).origin
      : 'http://localhost:3000';
  }
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    !['https:', 'http:'].includes(url.protocol)
  )
    throw new Error('Invalid PUBLIC_SITE_URL');
  return url.origin;
}
