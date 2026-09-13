import { setTimeout as delay } from 'node:timers/promises';
import type { HttpTransport } from '@sak/source-sdk';
import type { NewsSource } from './model';
import { robotsPolicy } from './robots';
export type CachedResponse = {
  url: string;
  body: string;
  etag: string | null;
  lastModified: string | null;
  checkedAt: string;
  status: number;
};
export interface ResponseCache {
  get(source: string, url: string): Promise<CachedResponse | null>;
  put(source: string, value: CachedResponse): Promise<void>;
}
export const memoryCache = (): ResponseCache => {
  const data = new Map<string, CachedResponse>();
  return {
    async get(s, u) {
      return data.get(s + u) ?? null;
    },
    async put(s, v) {
      data.set(s + v.url, v);
    },
  };
};
export function allowedUrl(raw: string, source: NewsSource, base?: string) {
  const url = new URL(raw, base);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    !source.hosts.includes(url.hostname)
  )
    throw new Error('source_url_restricted');
  url.hash = '';
  return url.href;
}
export function createNewsFetcher(
  source: NewsSource,
  transport: HttpTransport,
  cache: ResponseCache,
  signal: AbortSignal,
) {
  const robots = new Map<string, string>();
  let last = 0;
  async function request(
    url: string,
    limit: number,
    headers: Record<string, string> = {},
  ) {
    const response = await transport(url, {
      redirect: 'manual',
      signal: AbortSignal.any([signal, AbortSignal.timeout(25000)]),
      headers,
    });
    if (response.redirected) throw new Error('unvalidated_redirect');
    if (Number(response.headers.get('content-length')) > limit) {
      await response.body?.cancel();
      throw new Error('response_size_limit');
    }
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader)
      try {
        while (true) {
          const r = await reader.read();
          if (r.done) break;
          size += r.value.length;
          if (size > limit) {
            await reader.cancel();
            throw new Error('response_size_limit');
          }
          chunks.push(r.value);
        }
      } finally {
        reader.releaseLock();
      }
    return {
      status: response.status,
      headers: response.headers,
      body: Buffer.concat(chunks).toString('utf8'),
    };
  }
  async function policy(url: string) {
    const origin = new URL(url).origin;
    if (!robots.has(origin)) {
      let target = origin + '/robots.txt';
      let text: string | undefined;
      for (let hop = 0; hop < 5; hop++) {
        const r = await request(allowedUrl(target, source), 500000);
        if ([301, 302, 303, 307, 308].includes(r.status)) {
          const loc = r.headers.get('location');
          if (!loc) throw new Error('robots_redirect_missing');
          target = allowedUrl(loc, source, target);
          continue;
        }
        if (r.status === 404 || r.status === 410) text = '';
        else if (r.status === 200) text = r.body;
        else throw new Error('robots_unavailable_' + r.status);
        break;
      }
      if (text === undefined) throw new Error('robots_redirect_limit');
      robots.set(origin, text);
    }
    return robotsPolicy(robots.get(origin)!, url);
  }
  return async (
    requested: string,
  ): Promise<CachedResponse & { notModified: boolean }> => {
    let url = allowedUrl(requested, source);
    for (let hop = 0; hop < 4; hop++) {
      const p = await policy(url);
      if (!p.allowed) throw new Error('robots_disallowed');
      if (p.delayMs > 60000)
        throw new Error('robots_delay_exceeds_worker_budget');
      await delay(
        Math.max(0, last + Math.max(p.delayMs, source.delayMs) - Date.now()),
        undefined,
        { signal },
      );
      last = Date.now();
      const saved = await cache.get(source.id, url);
      let r: Awaited<ReturnType<typeof request>> | undefined;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          r = await request(url, source.maxBytes, {
            ...(saved?.etag ? { 'if-none-match': saved.etag } : {}),
            ...(saved?.lastModified
              ? { 'if-modified-since': saved.lastModified }
              : {}),
          });
        } catch (error) {
          if (attempt === 2 || signal.aborted) throw error;
          await delay(
            Math.max(source.delayMs, p.delayMs, 1000 * 2 ** attempt),
            undefined,
            { signal },
          );
          continue;
        }
        if (r.status !== 429 && r.status < 500) break;
        const raw = r.headers.get('retry-after');
        const retry = raw
          ? /^\d+$/.test(raw)
            ? Number(raw) * 1000
            : Date.parse(raw) - Date.now()
          : 1000 * 2 ** attempt;
        if (retry > 60000)
          throw new Error('source_retry_after_' + Math.ceil(retry / 1000));
        if (attempt < 2)
          await delay(
            Math.max(source.delayMs, p.delayMs, 1000, retry || 0),
            undefined,
            { signal },
          );
      }
      last = Date.now();
      if (!r) throw new Error('fetch_failed');
      if ([301, 302, 303, 307, 308].includes(r.status)) {
        const location = r.headers.get('location');
        if (!location) throw new Error('redirect_missing');
        url = allowedUrl(location, source, url);
        continue;
      }
      if (r.status === 304) {
        if (!saved) throw new Error('conditional_without_cache');
        const updated = { ...saved, checkedAt: new Date().toISOString() };
        await cache.put(source.id, updated);
        return { ...updated, notModified: true };
      }
      if (r.status !== 200) throw new Error('source_http_' + r.status);
      const mime = r.headers.get('content-type')?.split(';')[0];
      if (
        mime &&
        !/^(text\/(html|plain|xml)|application\/(xml|rss\+xml|atom\+xml|xhtml\+xml))$/.test(
          mime,
        )
      )
        throw new Error('unsupported_content_type');
      if (
        /captcha|cf-chl-|g-recaptcha|access denied|verify you are human/i.test(
          r.body.slice(0, 8000),
        )
      )
        throw new Error('source_access_control');
      const value = {
        url,
        body: r.body,
        etag: r.headers.get('etag'),
        lastModified: r.headers.get('last-modified'),
        status: 200,
        checkedAt: new Date().toISOString(),
      };
      await cache.put(source.id, value);
      return { ...value, notModified: false };
    }
    throw new Error('redirect_limit');
  };
}
