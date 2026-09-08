import type { AllowedHost } from '@sak/domain';
import { errorMessage } from '@sak/shared';
import { validateSourceUrl } from '@sak/validation';
import type { AdapterResult, FetchedDocument, HttpClient } from './contracts';

// A transport is deliberately injected: Prompt 2 must provide DNS/IP-pinned egress
// before enabling a real network adapter. Tests use fixture-backed transports.
export type HttpTransport = (
  url: string,
  options: { redirect: 'manual'; signal: AbortSignal },
) => Promise<Response>;

export function createHttpClient(options: {
  sourceId: string;
  hosts: readonly AllowedHost[];
  transport: HttpTransport;
  now?: () => Date;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}): HttpClient {
  const maxBytes = options.maxBytes ?? 5_000_000;
  return {
    async get(requestedUrl, signal): Promise<AdapterResult<FetchedDocument>> {
      const timeout = AbortSignal.timeout(options.timeoutMs ?? 15_000);
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
      let url = requestedUrl;
      try {
        for (let hop = 0; hop <= (options.maxRedirects ?? 3); hop++) {
          const validated = validateSourceUrl(
            url,
            options.sourceId,
            options.hosts,
          );
          if (!validated.ok)
            return {
              ok: false,
              error: {
                type: 'source_validation_failed',
                message: validated.reason,
                retryable: false,
              },
            };
          const response = await options.transport(validated.url, {
            redirect: 'manual',
            signal: combined,
          });
          if (response.redirected)
            throw new Error(
              'Transport followed a redirect without policy validation',
            );
          if ([301, 302, 303, 307, 308].includes(response.status)) {
            await response.body?.cancel();
            const location = response.headers.get('location');
            if (!location) throw new Error('Redirect has no location');
            url = new URL(location, validated.url).href;
            continue;
          }
          if (!response.ok) {
            await response.body?.cancel();
            return {
              ok: false,
              error: {
                type: 'fetch_failed',
                message: `HTTP ${response.status}`,
                retryable: response.status === 429 || response.status >= 500,
              },
            };
          }
          const mime =
            response.headers
              .get('content-type')
              ?.split(';')[0]
              ?.trim()
              .toLowerCase() ?? '';
          if (
            !['text/html', 'text/plain', 'application/xhtml+xml'].includes(mime)
          ) {
            await response.body?.cancel();
            throw new Error(`Unsupported text MIME type: ${mime}`);
          }
          if (Number(response.headers.get('content-length')) > maxBytes) {
            await response.body?.cancel();
            throw new Error('Response exceeds byte limit');
          }
          const reader = response.body?.getReader();
          if (!reader) throw new Error('Empty response');
          const chunks: Uint8Array[] = [];
          let size = 0;
          try {
            while (true) {
              combined.throwIfAborted();
              const chunk = await reader.read();
              if (chunk.done) break;
              size += chunk.value.byteLength;
              if (size > maxBytes) {
                await reader.cancel();
                throw new Error('Response exceeds byte limit');
              }
              chunks.push(chunk.value);
            }
          } finally {
            reader.releaseLock();
          }
          const bytes = new Uint8Array(size);
          let offset = 0;
          for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
          }
          const charset =
            response.headers
              .get('content-type')
              ?.match(/charset=["']?([^;"'\s]+)/i)?.[1] ?? 'utf-8';
          const body = new TextDecoder(charset, { fatal: true }).decode(bytes);
          return {
            ok: true,
            value: {
              requested_url: requestedUrl,
              final_url: validated.url,
              body,
              mime_type: mime,
              fetched_at: (options.now?.() ?? new Date()).toISOString(),
            },
          };
        }
        throw new Error('Redirect limit exceeded');
      } catch (error) {
        return {
          ok: false,
          error: {
            type: 'fetch_failed',
            message: errorMessage(error),
            retryable:
              !signal?.aborted &&
              (error instanceof TypeError ||
                (error instanceof Error && error.name === 'TimeoutError')),
          },
        };
      }
    },
  };
}
