/** Editorial resource identities, never factual values. One event has one canonical URL. */
export interface AnswerResource {
  key: string;
  group: string;
  event: string;
  entity: string;
  topic: string;
  predicate: string;
  question: string;
  label: string;
  category: 'Sınavlar' | 'Üniversite' | 'MEB/Okul' | 'KYK';
  aliases: readonly string[];
  excludedEvidenceTerms?: readonly string[];
}
export const answerResources: readonly AnswerResource[] = [
  {
    key: 'yks_extra',
    group: 'yks',
    event: 'ek-yerlestirme',
    entity: 'yks_ek_yerlestirme',
    topic: 'education.exams',
    predicate: 'preference_period',
    question: 'YKS ek tercih ne zaman?',
    label: 'YKS ek yerleştirme',
    category: 'Üniversite',
    aliases: [
      'yks ek tercih',
      'yks ikinci tercih',
      'yks ek yerleştirme',
      'ek yerleştirme',
      'ek tercih',
    ],
  },
  {
    key: 'yks_preferences',
    excludedEvidenceTerms: ['ek yerleştirme', 'ek tercih'],
    group: 'yks',
    event: 'tercihler',
    entity: 'yks',
    topic: 'education.exams',
    predicate: 'preference_period',
    question: 'YKS tercihleri ne zaman?',
    label: 'YKS tercihleri',
    category: 'Üniversite',
    aliases: ['yks tercih', 'yks tercihleri', 'üniversite tercihleri'],
  },
  {
    key: 'yks_results',
    excludedEvidenceTerms: ['ek yerleştirme', 'ek tercih', 'yerleştirme sonuç'],
    group: 'yks',
    event: 'sinav-sonuclari',
    entity: 'yks',
    topic: 'education.exams',
    predicate: 'results_status',
    question: 'YKS sınav sonuçları açıklandı mı?',
    label: 'YKS sınav sonuçları',
    category: 'Sınavlar',
    aliases: ['yks sonuç', 'yks sonuçları'],
  },
  {
    key: 'dgs_preferences',
    group: 'dgs',
    event: 'tercihler',
    entity: 'dgs',
    topic: 'education.exams',
    predicate: 'preference_period',
    question: 'DGS tercihleri ne zaman?',
    label: 'DGS tercihleri',
    category: 'Üniversite',
    aliases: ['dgs tercih', 'dgs tercihleri', 'dikey geçiş tercihleri'],
  },
  {
    key: 'kpss_exam',
    group: 'kpss-ortaogretim',
    event: 'sinav-tarihi',
    entity: 'kpss_ortaogretim',
    topic: 'education.exams',
    predicate: 'exam_date',
    question: 'KPSS ortaöğretim sınavı ne zaman?',
    label: 'KPSS ortaöğretim',
    category: 'Sınavlar',
    aliases: ['kpss ortaöğretim sınav', 'kpss lise sınav', 'ortaöğretim kpss'],
  },
  {
    key: 'lgs_exam',
    group: 'lgs',
    event: 'sinav-tarihi',
    entity: 'lgs',
    topic: 'education.school',
    predicate: 'exam_date',
    question: 'LGS ne zaman?',
    label: 'LGS sınavı',
    category: 'MEB/Okul',
    aliases: ['lgs', 'lgs sınav', 'liselere geçiş sınavı'],
  },
  {
    key: 'kyk_results',
    group: 'kyk',
    event: 'yurt-sonuclari',
    entity: 'dormitory',
    topic: 'education.student_support',
    predicate: 'results_status',
    question: 'KYK yurt sonuçları açıklandı mı?',
    label: 'KYK yurt sonuçları',
    category: 'KYK',
    aliases: [
      'kyk yurt sonuçları',
      'kyk yurtları',
      'kyk yurt sonuç',
      'yurt sonuçları',
    ],
  },
  {
    key: 'kyk_applications',
    group: 'kyk',
    event: 'yurt-basvurulari',
    entity: 'dormitory',
    topic: 'education.student_support',
    predicate: 'application_period',
    question: 'KYK yurt başvuruları ne zaman?',
    label: 'KYK yurt başvuruları',
    category: 'KYK',
    aliases: ['kyk yurt başvuru', 'kyk yurt başvuruları', 'yurt başvuruları'],
  },
  {
    key: 'yks_placement_results',
    excludedEvidenceTerms: ['ek yerleştirme', 'ek tercih'],
    group: 'yks',
    event: 'yerlestirme-sonuclari',
    entity: 'yks_yerlestirme',
    topic: 'education.exams',
    predicate: 'results_status',
    question: 'YKS yerleştirme sonuçları açıklandı mı?',
    label: 'YKS yerleştirme sonuçları',
    category: 'Üniversite',
    aliases: [
      'yks yerleştirme sonuçları',
      'yks yerleştirme sonuç',
      'üniversite yerleştirme sonuçları',
    ],
  },
  {
    key: 'yks_extra_results',
    group: 'yks',
    event: 'ek-yerlestirme-sonuclari',
    entity: 'yks_ek_yerlestirme',
    topic: 'education.exams',
    predicate: 'results_status',
    question: 'YKS ek yerleştirme sonuçları açıklandı mı?',
    label: 'YKS ek yerleştirme sonuçları',
    category: 'Üniversite',
    aliases: [
      'yks ek yerleştirme sonuçları',
      'yks ek yerleştirme sonuç',
      'ek yerleştirme sonuçları',
    ],
  },
];
export function canonicalPath(resource: AnswerResource, year: number): string {
  return `/${resource.group}/${year}/${resource.event}`;
}
export function resourceForRoute(group: string, year: string, event: string) {
  if (!/^(19|20|21)\d{2}$/.test(year)) return undefined;
  return answerResources.find((r) => r.group === group && r.event === event);
}
export function currentTurkishYear(asOf = new Date()): number {
  return Number(
    new Intl.DateTimeFormat('en', {
      year: 'numeric',
      timeZone: 'Europe/Istanbul',
    }).format(asOf),
  );
}
