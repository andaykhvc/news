/** Synthetic, isolated answer-contract fixture. Never imported by application or production seed. */
import { randomUUID } from 'node:crypto';
import {
  emptySnapshot,
  factHistory,
  type AnswerSnapshot,
} from '../packages/answers/src/index';
import { sourceRegistrySchema } from '../packages/domain/src/index';
import registryData from '../sources/registry.json';
export const fixtureNow = '2026-09-09T10:00:00Z';
export function answerFixture(asOf = fixtureNow): AnswerSnapshot {
  const data = emptySnapshot(),
    registry = sourceRegistrySchema.parse(registryData);
  const at = new Date(Date.parse(asOf) - 60000).toISOString();
  data.sources = [{ ...registry.sources[0]!, name: 'TEST FİKSTÜRÜ · ÖSYM' }];
  data.hosts = registry.hosts.filter(
    (h) => h.source_id === data.sources[0]!.id,
  );
  data.endpoints = [
    { ...registry.endpoints[0]!, last_successful_check_at: at },
  ];
  const id = randomUUID(),
    topicId = randomUUID(),
    entityId = randomUUID(),
    documentId = randomUUID(),
    versionId = randomUUID();
  data.entities = [
    {
      id: entityId,
      key: 'yks_ek_yerlestirme',
      name: 'YKS ek yerleştirme',
      entity_type: 'education_subject',
      created_at: at,
      updated_at: at,
    },
  ];
  data.topics = [
    {
      id: topicId,
      key: 'education.exams',
      name: 'Sınavlar',
      parent_id: null,
      created_at: at,
      updated_at: at,
    },
  ];
  data.rules = [
    {
      id: randomUUID(),
      topic_id: topicId,
      predicate: 'preference_period',
      subject_entity_id: entityId,
      source_id: data.sources[0]!.id,
      valid_from: null,
      valid_until: null,
      status: 'active',
      created_at: at,
      updated_at: at,
    },
  ];
  const quote =
    'TEST FİKSTÜRÜ: 2026 YKS ek yerleştirme tercih işlemleri 20 Eylül 2026 – 25 Eylül 2026 tarihlerinde yapılacaktır.';
  data.documents = [
    {
      id: documentId,
      source_id: data.sources[0]!.id,
      source_endpoint_id: data.endpoints[0]!.id,
      canonical_url: 'https://www.osym.gov.tr/Duyurular/Index',
      external_identifier: null,
      title: 'TEST FİKSTÜRÜ — gerçek YKS duyurusu değildir',
      document_type: 'announcement',
      first_seen_at: at,
      latest_seen_at: at,
      published_at: at,
      current_version_id: versionId,
      status: 'active',
    },
  ];
  data.versions = [
    {
      id: versionId,
      document_id: documentId,
      content_hash: 'a'.repeat(64),
      normalization_version: 'v1',
      title: data.documents[0]!.title,
      raw_text: quote,
      normalized_text: quote,
      mime_type: 'text/html',
      fetched_at: at,
      published_at: at,
      metadata: {
        structure: {
          parser: 'fixture-only',
          blocks: [
            {
              kind: 'paragraph',
              start: 0,
              end: quote.length,
              selector: 'p',
              heading: null,
              page: null,
            },
          ],
          warnings: [],
          publication_date: null,
        },
      },
    },
  ];
  data.facts = [
    {
      id,
      subject_entity_id: entityId,
      predicate: 'preference_period',
      value: { type: 'date_range', start: '2026-09-20', end: '2026-09-25' },
      unit: null,
      authority_source_id: data.sources[0]!.id,
      topic_id: topicId,
      status: 'published',
      published_at: at,
      effective_at: null,
      valid_from: null,
      valid_until: null,
      verified_at: at,
      superseded_at: null,
      superseded_by_fact_id: null,
      reference_period: '2026',
      created_at: at,
      updated_at: at,
    },
  ];
  data.evidence = [
    {
      id: randomUUID(),
      fact_id: id,
      document_version_id: versionId,
      evidence_text: quote,
      evidence_locator: {
        representation: 'raw_text',
        character_start: 0,
        character_end: quote.length,
      },
      created_at: at,
    },
  ];
  data.checks = [
    {
      endpoint_id: data.endpoints[0]!.id,
      checked_at: at,
      successful_at: at,
      status: 'success',
      scope: 'rolling_window',
      complete: false,
      pages: [data.endpoints[0]!.base_url],
      reasons: [],
      extraction_complete: true,
    },
  ];
  data.validations = [
    {
      fact_id: id,
      version_id: versionId,
      candidate: {
        entity_key: 'yks_ek_yerlestirme',
        topic_key: 'education.exams',
        predicate: 'preference_period',
        value: data.facts[0]!.value,
        value_text: '20 Eylül 2026 – 25 Eylül 2026',
        unit: null,
        reference_period: '2026',
        evidence: { quote, start: 0, end: quote.length, page: null },
        correction_of: null,
      },
      decision: {
        status: 'verified',
        validator_version: 'grounding-v1',
        reasons: ['grounded_fixture'],
      },
    },
  ];
  data.history = factHistory(data.facts[0]!);
  return data;
}
