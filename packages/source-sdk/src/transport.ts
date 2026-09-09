import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { Readable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import ipaddr from 'ipaddr.js';
import type { HttpTransport } from './http';
export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  const parsed = ipaddr.process(address);
  return parsed.range() === 'unicast';
}
/** Resolve once per request and pin the connection; TLS still authenticates the original hostname. */
export function createPinnedTransport(options: {
  userAgent: string;
  intervalMs?: number;
}): HttpTransport {
  if (!options.userAgent.trim())
    throw new Error('A descriptive crawler User-Agent is required');
  const queues = new Map<string, Promise<void>>();
  const last = new Map<string, number>();
  return async (url, { signal }) => {
    const target = new URL(url);
    if (target.protocol !== 'https:' || (target.port && target.port !== '443'))
      throw new Error('HTTPS only');
    const previous = queues.get(target.origin) ?? Promise.resolve();
    const slot = previous
      .catch(() => {})
      .then(async () => {
        await delay(
          Math.max(
            0,
            (last.get(target.origin) ?? 0) +
              (options.intervalMs ?? 1500) -
              Date.now(),
          ),
          undefined,
          { signal },
        );
        last.set(target.origin, Date.now());
      });
    queues.set(target.origin, slot);
    await slot;
    const addresses = await lookup(target.hostname, {
      all: true,
      verbatim: true,
    });
    signal.throwIfAborted();
    if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
      throw new Error('DNS resolved to a forbidden address');
    const pinned = addresses[0]!;
    return new Promise<Response>((resolve, reject) => {
      const req = request(
        target,
        {
          method: 'GET',
          signal,
          headers: {
            'user-agent': options.userAgent,
            'accept-encoding': 'identity',
            accept:
              'text/html,application/pdf,application/json;q=0.9,text/plain;q=0.8',
          },
          lookup: (_host, _options, callback) => callback(null, [pinned]),
        },
        (res) => {
          if (
            res.headers['content-encoding'] &&
            res.headers['content-encoding'] !== 'identity'
          ) {
            res.destroy();
            reject(new Error('Unexpected compressed response'));
            return;
          }
          const headers = new Headers();
          for (const [k, v] of Object.entries(res.headers)) {
            if (v !== undefined)
              headers.set(k, Array.isArray(v) ? v.join(', ') : v);
          }
          resolve(
            new Response(Readable.toWeb(res) as ReadableStream<Uint8Array>, {
              status: res.statusCode ?? 502,
              headers,
            }),
          );
        },
      );
      req.setTimeout(20000, () => req.destroy(new Error('Socket timeout')));
      req.on('error', reject);
      req.end();
    });
  };
}
