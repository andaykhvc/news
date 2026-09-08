import { allowedHostSchema, type AllowedHost } from '@sak/domain';

export type UrlValidation =
  { ok: true; url: string; hostname: string } | { ok: false; reason: string };

export function isGovernmentHostname(hostname: string): boolean {
  return hostname.endsWith('.gov.tr') && hostname !== 'gov.tr';
}

export function validateSourceUrl(
  input: string,
  sourceId: string,
  hosts: readonly AllowedHost[],
  options: { allowHttp?: boolean } = {},
): UrlValidation {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }
  if (
    url.protocol !== 'https:' &&
    !(options.allowHttp && url.protocol === 'http:')
  )
    return { ok: false, reason: 'protocol_not_allowed' };
  if (url.username || url.password || url.port)
    return { ok: false, reason: 'credentials_or_nonstandard_port' };
  if (!isGovernmentHostname(url.hostname))
    return { ok: false, reason: 'not_government_host' };
  const trusted = hosts.some(
    (host) =>
      allowedHostSchema.safeParse(host).success &&
      host.source_id === sourceId &&
      host.status === 'active' &&
      isGovernmentHostname(host.hostname) &&
      (url.hostname === host.hostname ||
        (host.include_subdomains &&
          url.hostname.endsWith(`.${host.hostname}`))),
  );
  if (!trusted) return { ok: false, reason: 'unregistered_or_inactive_host' };
  url.hash = '';
  return { ok: true, url: url.href, hostname: url.hostname };
}
