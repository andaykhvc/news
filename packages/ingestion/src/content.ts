import { createHash } from 'node:crypto';
import type { PersistedOutcome } from '@sak/domain';
import type { ParsedDocument } from '@sak/source-sdk';

export const NORMALIZATION_VERSION = 'v1' as const;
export function normalizeContent(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[\t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
export function hashContent(normalized: string): string {
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}
export function fingerprintDocument(
  parsed: ParsedDocument,
  mimeType: string,
): { normalizedText: string; contentHash: string } {
  const normalizedText = normalizeContent(parsed.raw_text);
  if (!normalizedText)
    throw new Error('Document text is empty after normalization');
  // Fixed field order; attachment order is irrelevant. Arbitrary adapter metadata is not hashed.
  const attachments = parsed.attachments
    .map((a) => JSON.stringify([a.url, a.mime_type, a.filename]))
    .sort();
  const contentHash = hashContent(
    JSON.stringify([
      NORMALIZATION_VERSION,
      normalizeContent(parsed.title),
      normalizedText,
      mimeType,
      parsed.document_type,
      parsed.published_at,
      attachments,
    ]),
  );
  return { normalizedText, contentHash };
}
export function detectDocumentVersion(
  currentHash: string | null,
  nextHash: string,
): PersistedOutcome {
  return currentHash === null
    ? 'new_document'
    : currentHash === nextHash
      ? 'unchanged'
      : 'new_version';
}
