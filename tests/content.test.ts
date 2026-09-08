import { describe, expect, it } from 'vitest';
import {
  normalizeContent,
  hashContent,
  fingerprintDocument,
  detectDocumentVersion,
} from '../packages/ingestion/src/index';
import { documentFixture } from './helpers';

describe('normalization and deterministic hashing', () => {
  it('collapses irrelevant whitespace and normalizes line endings', () =>
    expect(normalizeContent('  İlk\t satır\r\n\r\n\r\n İkinci satır  ')).toBe(
      'İlk satır\n\nİkinci satır',
    ));
  it('is idempotent', () => {
    const text = normalizeContent(' A \t B\r\n C ');
    expect(normalizeContent(text)).toBe(text);
  });
  it('preserves Turkish characters, punctuation and semantic line breaks', () =>
    expect(normalizeContent('İı Şğ 1.000,50\n10 / 12')).toBe(
      'İı Şğ 1.000,50\n10 / 12',
    ));
  it('uses SHA-256 with a known deterministic result', () =>
    expect(hashContent('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    ));
  it('ignores spacing but detects text, title and attachment changes', () => {
    const base = documentFixture.parsed;
    const fingerprint = (parsed: typeof base) =>
      fingerprintDocument(parsed, 'text/plain').contentHash;
    expect(fingerprint({ ...base, raw_text: `  ${base.raw_text}  ` })).toBe(
      fingerprint(base),
    );
    expect(fingerprint({ ...base, raw_text: `${base.raw_text}!` })).not.toBe(
      fingerprint(base),
    );
    expect(fingerprint({ ...base, title: 'Correction' })).not.toBe(
      fingerprint(base),
    );
    expect(
      fingerprintDocument(
        {
          ...base,
          attachments: [
            {
              url: 'https://fixture.gov.tr/guide.pdf',
              mime_type: 'application/pdf',
              filename: null,
            },
          ],
        },
        'text/plain',
      ).contentHash,
    ).not.toBe(fingerprint(base));
  });
  it('does not mutate evidence text', () => {
    const parsed = { ...documentFixture.parsed, raw_text: ' A  B ' };
    fingerprintDocument(parsed, 'text/plain');
    expect(parsed.raw_text).toBe(' A  B ');
  });
  it('rejects whitespace-only documents', () =>
    expect(() =>
      fingerprintDocument(
        { ...documentFixture.parsed, raw_text: ' \n\t ' },
        'text/plain',
      ),
    ).toThrow('empty'));
  it('classifies new, unchanged and changed versions', () => {
    expect(detectDocumentVersion(null, 'a')).toBe('new_document');
    expect(detectDocumentVersion('a', 'a')).toBe('unchanged');
    expect(detectDocumentVersion('a', 'b')).toBe('new_version');
  });
});
