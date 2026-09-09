import type { Fact, FactValue } from '@sak/domain';
import {
  foldTurkish,
  validateFactPublication,
  validateSourceUrl,
  validateEvidence,
} from '@sak/validation';
import type { AnswerResource } from './catalog';
import type { AnswerSnapshot } from './snapshot';
export type AnswerState =
  | 'current'
  | 'future_announced'
  | 'expired'
  | 'superseded'
  | 'needs_review'
  | 'no_verified_fact'
  | 'monitored_absence'
  | 'unavailable';
export interface AnswerEvidence {
  factId: string;
  versionId: string;
  documentId: string;
  institution: string;
  title: string;
  url: string;
  publishedAt: string | null;
  excerpt: string;
  locator: string;
  verifiedAt: string | null;
}
export interface ResolvedAnswer {
  resource: AnswerResource;
  year: number;
  state: AnswerState;
  status: string;
  text: string;
  value: string | null;
  stale: boolean;
  warnings: string[];
  authority: string[];
  checkedAt: string | null;
  verifiedAt: string | null;
  evidence: AnswerEvidence[];
  factId: string | null;
  history: AnswerSnapshot['history'];
  coverage: {
    url: string;
    name: string;
    scope: string;
    checkedAt: string | null;
  }[];
}
const labels: Record<AnswerState, string> = {
  current: 'Doğrulanmış bilgi',
  future_announced: 'İleri tarih duyuruldu',
  expired: 'Dönem sona erdi',
  superseded: 'Önceki bilgi değiştirildi',
  needs_review: 'İnceleme gerekiyor',
  no_verified_fact: 'Doğrulanmış cevap yok',
  monitored_absence: 'İzlenen kaynaklarda bulunamadı',
  unavailable: 'Kontrol bilgisine erişilemiyor',
};
export function formatDate(value: string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Istanbul',
  }).format(new Date(value.length === 10 ? `${value}T12:00:00+03:00` : value));
}
export function formatFactValue(value: FactValue): string | null {
  switch (value.type) {
    case 'date':
      return formatDate(value.value);
    case 'datetime':
      return (
        new Intl.DateTimeFormat('tr-TR', {
          dateStyle: 'long',
          timeStyle: 'short',
          timeZone: 'Europe/Istanbul',
        }).format(new Date(value.value)) + ' (Türkiye saati)'
      );
    case 'date_range':
      return `${formatDate(value.start)} – ${formatDate(value.end)}`;
    case 'money': {
      const [whole, fraction] = value.amount.split('.');
      return `${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${fraction ? ',' + fraction : ''} ${value.currency}`;
    }
    case 'number':
      return new Intl.NumberFormat('tr-TR').format(value.value);
    case 'boolean':
      return value.value ? 'Evet' : 'Hayır';
    case 'status':
      return (
        (
          {
            announced: 'Açıklandı',
            pending: 'Bekleniyor',
            open: 'Başvurular açık',
            closed: 'Başvurular kapalı',
            not_announced: 'Henüz açıklanmadı',
          } as Record<string, string>
        )[value.value] ?? null
      );
    case 'string':
      return value.value;
    case 'url':
      return null; // A separate registered-link renderer is required before exposing URL-valued facts.
    case 'json':
      return null; // No generic serialization of unregistered factual structures.
  }
}
const fresh = (at: string | null | undefined, now: number, maxAge: number) =>
  !!at &&
  Number.isFinite(Date.parse(at)) &&
  Date.parse(at) <= now &&
  now - Date.parse(at) <= maxAge;
export function resolveAnswer(
  resource: AnswerResource,
  year: number,
  data: AnswerSnapshot,
  asOf: string,
  available = true,
): ResolvedAnswer {
  const now = Date.parse(asOf);
  if (!Number.isFinite(now)) throw new Error('Invalid answer clock');
  const entity = data.entities.find((e) => e.key === resource.entity);
  const topic = data.topics.find((t) => t.key === resource.topic);
  const rules = data.rules.filter(
    (r) =>
      r.status === 'active' &&
      r.topic_id === topic?.id &&
      r.predicate === resource.predicate &&
      (r.subject_entity_id === null || r.subject_entity_id === entity?.id) &&
      (!r.valid_from || Date.parse(r.valid_from) <= now) &&
      (!r.valid_until || Date.parse(r.valid_until) > now),
  );
  const sources = data.sources.filter(
    (s) => s.status === 'active' && rules.some((r) => r.source_id === s.id),
  );
  const endpoints = data.endpoints.filter(
    (e) => e.status === 'active' && sources.some((s) => s.id === e.source_id),
  );
  const healthy =
    endpoints.length > 0 &&
    endpoints.every((e) => {
      const c = data.checks.find((c) => c.endpoint_id === e.id);
      return (
        c?.status === 'success' &&
        fresh(
          c.successful_at,
          now,
          Math.max(e.poll_interval_seconds * 3, 3600) * 1000,
        ) &&
        fresh(
          c.checked_at,
          now,
          Math.max(e.poll_interval_seconds * 3, 3600) * 1000,
        ) &&
        c.reasons.every((r) =>
          ['bounded_or_incomplete_discovery', 'document_limit'].includes(r),
        )
      );
    });
  const successful = endpoints
    .map((e) => data.checks.find((c) => c.endpoint_id === e.id)?.successful_at)
    .filter((x): x is string => !!x && Date.parse(x) <= now)
    .sort();
  const answer: ResolvedAnswer = {
    resource,
    year,
    state: available ? 'no_verified_fact' : 'unavailable',
    status: '',
    text: `${year} yılı için bu soruyu yanıtlayan doğrulanmış ve yayıma açılmış bir bilgi henüz yok. Bu, kurumun duyuru yayımlamadığı anlamına gelmez.`,
    value: null,
    stale: !healthy,
    warnings: [],
    authority: sources.map((s) => s.name),
    checkedAt: successful[0] ?? null,
    verifiedAt: null,
    evidence: [],
    factId: null,
    history: [],
    coverage: endpoints
      .filter((e) => validateSourceUrl(e.base_url, e.source_id, data.hosts).ok)
      .map((e) => ({
        url: e.base_url,
        name: e.name,
        scope:
          data.checks.find((c) => c.endpoint_id === e.id)?.scope ?? 'unknown',
        checkedAt:
          data.checks.find((c) => c.endpoint_id === e.id)?.successful_at ??
          null,
      })),
  };
  const finish = () => {
    answer.status =
      answer.stale && ['current', 'future_announced'].includes(answer.state)
        ? 'Güncelliği yeniden kontrol edilmeli'
        : labels[answer.state];
    if (answer.stale)
      answer.warnings.push(
        'Kaynak kontrolü eksik, gecikmiş veya sağlıksız. Bilgiyi yeni doğrulanmış kabul etmeyin; resmî bağlantıyı kontrol edin.',
      );
    return answer;
  };
  if (!available) {
    answer.text =
      'Kaynak verisine şu an erişemiyoruz. Doğrulayamadığımız bir tarih veya sonuç göstermiyoruz.';
    return finish();
  }
  const matching = data.facts.filter(
    (f) =>
      f.subject_entity_id === entity?.id &&
      f.topic_id === topic?.id &&
      f.predicate === resource.predicate &&
      f.reference_period === String(year),
  );
  answer.history = data.history
    .filter(
      (h) =>
        matching.some((f) => f.id === h.fact_id) && Date.parse(h.at) <= now,
    )
    .sort((a, b) => b.at.localeCompare(a.at));
  const relevant = matching.filter((f) =>
    sources.some((s) => s.id === f.authority_source_id),
  );
  // Pending or conflicting claims cannot be bypassed by selecting a nicer published row.
  if (
    relevant.some((f) => f.status === 'needs_review') ||
    new Set(
      relevant
        .filter((f) => ['verified', 'published'].includes(f.status))
        .map((f) => JSON.stringify(f.value)),
    ).size > 1
  ) {
    answer.state = 'needs_review';
    answer.text =
      'Bu konuya ilişkin bilgiler arasında inceleme gerektiren bir fark var. Kontrol tamamlanmadan kesin bir cevap vermiyoruz.';
    return finish();
  }
  const candidates = relevant
    .filter((f) => f.status === 'published')
    .sort((a, b) => (b.verified_at ?? '').localeCompare(a.verified_at ?? ''));
  for (const fact of candidates) {
    const source = sources.find((s) => s.id === fact.authority_source_id)!;
    const bundles = data.evidence
      .filter((e) => e.fact_id === fact.id)
      .flatMap((evidence) => {
        const version = data.versions.find(
          (v) => v.id === evidence.document_version_id,
        );
        const document = data.documents.find(
          (d) => d.id === version?.document_id,
        );
        return version && document && document.current_version_id === version.id
          ? [
              {
                evidence,
                version,
                document,
                documentSourceId: document.source_id,
              },
            ]
          : [];
      });
    const errors = validateFactPublication({
      fact,
      source,
      asOf,
      expectedReferencePeriod: String(year),
      evidence: bundles,
    });
    // Future event dates are answers today; future *validity* or effective_at is not.
    if (
      errors.length ||
      !fact.published_at ||
      Date.parse(fact.published_at) > now ||
      bundles.some(
        ({ document, version, evidence }) =>
          document.status !== 'active' ||
          resource.excludedEvidenceTerms?.some((term) =>
            foldTurkish(version.title + ' ' + evidence.evidence_text).includes(
              foldTurkish(term),
            ),
          ) ||
          !endpoints.some((e) => e.id === document.source_endpoint_id) ||
          document.current_version_id !== version.id ||
          !validateSourceUrl(document.canonical_url, source.id, data.hosts)
            .ok ||
          Date.parse(version.fetched_at) > now ||
          (version.published_at !== null &&
            Date.parse(version.published_at) > now) ||
          !validLocator(evidence, version) ||
          !data.validations.some(
            (v) =>
              v.fact_id === fact.id &&
              v.version_id === version.id &&
              (v.decision.status === 'verified' ||
                (v.decision.status === 'needs_review' &&
                  v.decision.reasons.length === 1 &&
                  v.decision.reasons[0] ===
                    'conflicting_authoritative_claims')) &&
              v.candidate.entity_key === resource.entity &&
              v.candidate.topic_key === resource.topic &&
              v.candidate.predicate === fact.predicate &&
              v.candidate.reference_period === fact.reference_period &&
              v.candidate.unit === fact.unit &&
              JSON.stringify(v.candidate.value) ===
                JSON.stringify(fact.value) &&
              v.candidate.evidence.quote === evidence.evidence_text &&
              v.candidate.evidence.start ===
                evidence.evidence_locator.character_start &&
              v.candidate.evidence.end ===
                evidence.evidence_locator.character_end &&
              v.candidate.evidence.page ===
                (evidence.evidence_locator.page_number ?? null),
          ),
      )
    )
      continue;
    const value = formatFactValue(fact.value);
    if (value === null) continue;
    answer.factId = fact.id;
    answer.value = value;
    answer.verifiedAt = fact.verified_at;
    answer.authority = [source.name];
    const day = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Istanbul',
    }).format(new Date(asOf));
    const start =
      fact.value.type === 'date_range'
        ? fact.value.start
        : fact.value.type === 'date'
          ? fact.value.value
          : null;
    const end =
      fact.value.type === 'date_range'
        ? fact.value.end
        : fact.value.type === 'date'
          ? fact.value.value
          : null;
    answer.state =
      start && start > day
        ? 'future_announced'
        : end && end < day
          ? 'expired'
          : 'current';
    answer.text = `${year} ${resource.label}: ${value}.${answer.state === 'expired' ? ' Bu tarih/dönem sona erdi.' : ''}`;
    answer.evidence = bundles.map(({ evidence, version, document }) => ({
      factId: fact.id,
      versionId: version.id,
      documentId: document.id,
      institution: source.name,
      title: version.title,
      url: document.canonical_url,
      publishedAt: version.published_at,
      excerpt: evidence.evidence_text,
      locator: evidence.evidence_locator.page_number
        ? `Sayfa ${evidence.evidence_locator.page_number}`
        : (evidence.evidence_locator.section_heading ??
          'Belgedeki ilgili bölüm'),
      verifiedAt: fact.verified_at,
    }));
    if (
      bundles.some(
        ({ document }) =>
          !fresh(
            document.latest_seen_at,
            now,
            Math.max(
              ...endpoints
                .filter((e) => e.source_id === source.id)
                .map((e) => e.poll_interval_seconds * 3),
              3600,
            ) * 1000,
          ),
      )
    )
      answer.stale = true;
    if (answer.stale)
      answer.text += ' Kaynağın güncel durumu yeniden doğrulanmalı.';
    return finish();
  }
  if (
    candidates.length > 0 &&
    candidates.every((f) => f.valid_until && Date.parse(f.valid_until) <= now)
  ) {
    answer.state = 'expired';
    answer.text =
      'Kayıtlı bilginin geçerlilik süresi sona erdi. Güncel bir cevap henüz doğrulanmadı.';
  } else if (
    candidates.length ||
    relevant.some((f) => f.status === 'verified')
  ) {
    answer.state = 'needs_review';
    answer.text =
      'Bilgi mevcut, ancak yayın veya güncel kanıt kontrolü tamamlanmadı. Şimdilik kesin bir tarih ya da sonuç göstermiyoruz.';
  } else if (relevant.some((f) => f.status === 'superseded')) {
    answer.state = 'superseded';
    answer.text =
      'Önceki bilgi değiştirildi. Yerine geçen bilgi doğrulanıp yayıma açılana kadar eski değeri göstermiyoruz.';
  } else if (relevant.some((f) => f.status === 'expired')) {
    answer.state = 'expired';
    answer.text =
      'Kayıtlı bilginin geçerliliği sona erdi. Güncel bir cevap henüz doğrulanmadı.';
  } else if (
    !matching.some((f) => ['draft', 'revoked'].includes(f.status)) &&
    entity &&
    topic &&
    healthy &&
    endpoints.every((e) => {
      const c = data.checks.find((c) => c.endpoint_id === e.id);
      return (
        c?.extraction_complete && c.reasons.length === 0 && c.pages.length > 0
      );
    })
  ) {
    answer.state = 'monitored_absence';
    answer.text = `${year} yılı için başarıyla taradığımız resmî kaynak sayfalarında bu soruya karşılık doğrulanmış bir duyuru bulamadık. Tarama tüm resmî arşivi kapsamayabilir; kurum başka bir sayfada duyuru yayımlamış olabilir.`;
  }
  return finish();
}
function validLocator(
  evidence: AnswerSnapshot['evidence'][number],
  version: AnswerSnapshot['versions'][number],
): boolean {
  if (validateEvidence(evidence, version).length) return false;
  const structure = version.metadata['structure'];
  if (!structure || typeof structure !== 'object' || Array.isArray(structure))
    return false;
  const warnings = structure['warnings'];
  if (!Array.isArray(warnings) || warnings.length) return false;
  const blocks = structure['blocks'];
  const {
    character_start: start,
    character_end: end,
    page_number: page,
  } = evidence.evidence_locator;
  return (
    start !== undefined &&
    end !== undefined &&
    Array.isArray(blocks) &&
    blocks.some(
      (b) =>
        b &&
        typeof b === 'object' &&
        !Array.isArray(b) &&
        typeof b['start'] === 'number' &&
        typeof b['end'] === 'number' &&
        b['start'] <= start &&
        b['end'] >= end &&
        (page === undefined || b['page'] === page),
    )
  );
}
export function relatedAnswers(
  resource: AnswerResource,
  year: number,
  data: AnswerSnapshot,
  asOf: string,
  resources: readonly AnswerResource[],
) {
  return resources
    .filter((r) => r.key !== resource.key && r.group === resource.group)
    .map((r) => resolveAnswer(r, year, data, asOf))
    .filter((a) => a.factId !== null);
}
export function factHistory(fact: Fact): AnswerSnapshot['history'] {
  return [
    {
      fact_id: fact.id,
      at: fact.created_at,
      action: 'extracted',
      reason: 'Belgeden yapılandırılmış bilgi çıkarıldı.',
    },
    ...(fact.verified_at
      ? [
          {
            fact_id: fact.id,
            at: fact.verified_at,
            action: 'verified',
            reason: 'Kanıt ve yetki kontrolleri geçti.',
          },
        ]
      : []),
    ...(fact.published_at
      ? [
          {
            fact_id: fact.id,
            at: fact.published_at,
            action: 'published',
            reason: 'Yayıma açıldı.',
          },
        ]
      : []),
    ...(fact.superseded_at
      ? [
          {
            fact_id: fact.id,
            at: fact.superseded_at,
            action: 'superseded',
            reason: 'Daha yeni bilgiyle değiştirildi.',
          },
        ]
      : []),
  ];
}
