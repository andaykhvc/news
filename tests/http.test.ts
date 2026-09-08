import { describe, expect, it, vi } from 'vitest';
import {
  createHttpClient,
  type HttpTransport,
} from '../packages/source-sdk/src/index';
import { host, source } from './helpers';

const client = (transport: HttpTransport, maxBytes = 100) =>
  createHttpClient({
    sourceId: source.id,
    hosts: [host],
    transport,
    maxBytes,
    now: () => new Date('2026-09-08T00:00:00Z'),
  });
describe('HTTP boundary', () => {
  it('validates the initial URL before transport invocation', async () => {
    const transport = vi.fn<HttpTransport>();
    expect((await client(transport).get('https://attacker.com/')).ok).toBe(
      false,
    );
    expect(transport).not.toHaveBeenCalled();
  });
  it('validates each redirect before any subsequent request', async () => {
    const transport = vi.fn<HttpTransport>(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: 'https://fixture.gov.tr.attacker.com/' },
        }),
    );
    const result = await client(transport).get('https://fixture.gov.tr/');
    expect(result).toMatchObject({
      ok: false,
      error: { type: 'source_validation_failed' },
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('supports safe relative redirects', async () => {
    const transport = vi
      .fn<HttpTransport>()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: '/updated' } }),
      )
      .mockResolvedValueOnce(
        new Response('Duyuru', {
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        }),
      );
    expect(
      await client(transport).get('https://fixture.gov.tr/'),
    ).toMatchObject({
      ok: true,
      value: { final_url: 'https://fixture.gov.tr/updated', body: 'Duyuru' },
    });
  });
  it('rejects binary PDF content until a binary transport is implemented', async () => {
    expect(
      await client(
        async () =>
          new Response('pdf', {
            headers: { 'content-type': 'application/pdf' },
          }),
      ).get('https://fixture.gov.tr/a.pdf'),
    ).toMatchObject({ ok: false, error: { retryable: false } });
  });
  it('enforces streamed size limits without a content-length header', async () => {
    expect(
      await client(
        async () =>
          new Response('123456', { headers: { 'content-type': 'text/plain' } }),
        5,
      ).get('https://fixture.gov.tr/'),
    ).toMatchObject({
      ok: false,
      error: { message: 'Response exceeds byte limit' },
    });
  });
  it('distinguishes retryable statuses from permanent failures', async () => {
    expect(
      await client(async () => new Response(null, { status: 503 })).get(
        'https://fixture.gov.tr/',
      ),
    ).toMatchObject({ ok: false, error: { retryable: true } });
    expect(
      await client(async () => new Response(null, { status: 404 })).get(
        'https://fixture.gov.tr/',
      ),
    ).toMatchObject({ ok: false, error: { retryable: false } });
  });
});
