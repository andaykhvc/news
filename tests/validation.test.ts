import { describe, expect, it } from 'vitest';
import {
  validateSourceUrl,
  validateSourceRegistry,
} from '../packages/validation/src/index';
import { initialSourceRegistry } from '../packages/database/src/registry';
import { host, registry, source } from './helpers';

describe('hostname trust', () => {
  it('accepts an exact active host and canonicalizes fragments', () => {
    expect(
      validateSourceUrl('https://FIXTURE.gov.tr/a?q=1#section', source.id, [
        host,
      ]),
    ).toMatchObject({ ok: true, url: 'https://fixture.gov.tr/a?q=1' });
  });
  it.each([
    'https://fixture.gov.tr.attacker.com',
    'https://fakefixture.gov.tr.example.com',
    'https://fakefixture.gov.tr',
    'https://other.gov.tr',
    'https://fixture.gov.tr./',
    'https://fixture.gov.tr@attacker.com/',
    'https://attacker@fixture.gov.tr/',
    'https://fixture.gov.tr:8443/',
    'ftp://fixture.gov.tr/',
    'javascript:alert(1)',
    'https://127.0.0.1/',
    'https://[::1]/',
    '/relative',
    'https://fıxture.gov.tr/',
    'http://fixture.gov.tr/',
  ])('rejects %s', (url) =>
    expect(validateSourceUrl(url, source.id, [host]).ok).toBe(false),
  );
  it('requires explicit permission for subdomains', () => {
    const url = 'https://announcements.fixture.gov.tr/';
    expect(validateSourceUrl(url, source.id, [host]).ok).toBe(false);
    expect(
      validateSourceUrl(url, source.id, [{ ...host, include_subdomains: true }])
        .ok,
    ).toBe(true);
  });
  it('does not allow suffix tricks even with subdomains enabled', () => {
    expect(
      validateSourceUrl('https://evilfixture.gov.tr/', source.id, [
        { ...host, include_subdomains: true },
      ]).ok,
    ).toBe(false);
  });
  it.each(['candidate', 'disabled', 'deprecated'] as const)(
    'does not trust a %s host',
    (status) => {
      expect(
        validateSourceUrl('https://fixture.gov.tr/', source.id, [
          { ...host, status },
        ]).ok,
      ).toBe(false);
    },
  );
  it('scopes hosts to their institution', () =>
    expect(
      validateSourceUrl('https://fixture.gov.tr/', crypto.randomUUID(), [host])
        .ok,
    ).toBe(false));
  it('only allows HTTP when explicitly opted in', () =>
    expect(
      validateSourceUrl('http://fixture.gov.tr/', source.id, [host], {
        allowHttp: true,
      }).ok,
    ).toBe(true));
});

describe('source registry', () => {
  it('seeds reviewed sources and exact endpoints without automatic subdomain trust', () => {
    const initial = validateSourceRegistry(initialSourceRegistry);
    expect(initial.sources).toHaveLength(5);
    expect(initial.endpoints).toHaveLength(7);
    expect(initial.sources.every((s) => s.status === 'active')).toBe(true);
    expect(initial.hosts.every((h) => !h.include_subdomains)).toBe(true);
  });
  it('accepts a consistent registry', () =>
    expect(validateSourceRegistry(registry)).toEqual(registry));
  it('rejects duplicate slugs', () =>
    expect(() =>
      validateSourceRegistry({
        ...registry,
        sources: [...registry.sources, { ...source, id: crypto.randomUUID() }],
      }),
    ).toThrow('Duplicate'));
  it('rejects orphaned hosts', () =>
    expect(() =>
      validateSourceRegistry({
        ...registry,
        hosts: [{ ...host, source_id: crypto.randomUUID() }],
      }),
    ).toThrow('Orphaned'));
  it('rejects non-government host registrations', () =>
    expect(() =>
      validateSourceRegistry({
        ...registry,
        hosts: [{ ...host, hostname: 'example.com' }],
      }),
    ).toThrow('gov.tr'));
  it('rejects active endpoints under candidate sources', () =>
    expect(() =>
      validateSourceRegistry({
        ...registry,
        sources: [{ ...source, status: 'candidate' }],
      }),
    ).toThrow('Active endpoint'));
  it('rejects unknown candidate endpoint hosts too', () =>
    expect(() =>
      validateSourceRegistry({
        ...registry,
        endpoints: registry.endpoints.map((e) => ({
          ...e,
          status: 'candidate',
          base_url: 'https://other.gov.tr',
        })),
      }),
    ).toThrow('outside'));
});
