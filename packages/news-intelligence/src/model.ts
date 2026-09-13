import { z } from 'zod';
import { createHash } from 'node:crypto';
export const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const stamp = z.iso.datetime({ offset: true });
const key = z.string().regex(/^[a-z0-9_-]{1,80}$/);
export const sourceSchema = z.object({
  id: key,
  name: z.string().min(1),
  status: z.enum(['active', 'candidate', 'disabled']),
  hosts: z.array(z.string().min(1)).min(1).max(20),
  family: key.nullable(),
  reliability: z.number().min(0).max(1).default(0.5),
  discovery: z
    .array(
      z.object({
        kind: z.enum(['rss', 'atom', 'sitemap', 'news_sitemap', 'index']),
        url: z.url(),
        selector: z.string().optional(),
      }),
    )
    .max(20),
  articleSelector: z.string().default('article'),
  titleSelector: z.string().default('h1'),
  publicationSelector: z.string().optional(),
  intervalSeconds: z.number().int().min(300).default(900),
  delayMs: z.number().int().min(1500).max(60000).default(2000),
  maxReports: z.number().int().min(1).max(200).default(30),
  maxPages: z.number().int().min(1).max(20).default(4),
  maxBytes: z.number().int().min(1000).max(5000000).default(1000000),
  maxTextChars: z.number().int().min(100).max(100000).default(30000),
  respectRobots: z.literal(true).default(true),
});
export type NewsSource = z.infer<typeof sourceSchema>;
export const reportSchema = z.object({
  id: z.string().length(64),
  key: z.string().length(64),
  sourceId: key,
  sourceFamily: key.nullable(),
  sourceReliability: z.number().min(0).max(1),
  canonicalUrl: z.url(),
  title: z.string().min(1).max(1000),
  text: z.string().min(40).max(100000),
  contentHash: z.string().length(64),
  publishedAt: stamp.nullable(),
  modifiedAt: stamp.nullable(),
  discoveredAt: stamp,
  officialVersionId: z.uuid().nullable().default(null),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type NewsReport = z.infer<typeof reportSchema>;
export const entitySchema = z.object({
  kind: z.enum([
    'city',
    'district',
    'road',
    'person',
    'institution',
    'team',
    'organization',
    'location',
  ]),
  value: z.string().min(1).max(200),
  text: z.string().min(1).max(200),
});
export type NewsEntity = z.infer<typeof entitySchema>;
export const valueSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('number'), value: z.number().finite().min(0) }),
  z.object({ type: z.literal('boolean'), value: z.boolean() }),
  z.object({ type: z.literal('text'), value: z.string().min(1).max(300) }),
  z.object({ type: z.literal('datetime'), value: stamp }),
]);
export const claimSchema = z.object({
  predicate: key,
  scope: z.string().max(200).default('event'),
  value: valueSchema,
  valueText: z.string().min(1).max(300),
  quote: z.string().min(1).max(2000),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  correction: z.boolean().default(false),
  asOf: stamp.nullable().default(null),
});
export type AtomicClaim = z.infer<typeof claimSchema>;
export const analysisSchema = z.object({
  kind: key,
  limitations: z.array(z.string()).max(10).default([]),
  entities: z.array(entitySchema).max(80),
  claims: z.array(claimSchema).max(100),
  occurredAt: stamp.nullable(),
  occurrenceText: z.string().nullable(),
  originHint: z.string().max(100).nullable(),
});
export type Analysis = z.infer<typeof analysisSchema>;
export type EventReport = Omit<NewsReport, 'text' | 'metadata'> & {
  analysis: Analysis;
  tokens: string[];
  bodyTokens: string[];
  method: string;
};
export type ClaimEvidence = {
  reportId: string;
  family: string;
  quote: string;
  start: number;
  end: number;
  asOf: string;
  officialVersionId: string | null;
  active: boolean;
};
export type EventClaim = {
  id: string;
  predicate: string;
  scope: string;
  value: AtomicClaim['value'];
  status: 'supported' | 'weakly_supported' | 'conflicting' | 'superseded';
  evidence: ClaimEvidence[];
};
export type ClusterDecision = {
  eventId: string | null;
  score: number;
  reasons: string[];
  alternatives: { eventId: string; score: number; reasons: string[] }[];
};
export type ConfidenceSignals = {
  reports: number;
  families: number;
  unknownOrigins: number;
  officialReports: number;
  activeClaims: number;
  supportedClaims: number;
  freshness: number;
  reportsLastHour: number;
  updatesLastHour: number;
  contradictions: number;
  geographicSpecificity: number;
  sourceReliability: number;
  score: number;
  importance: number;
};
export type EventUpdate = {
  id: string;
  at: string;
  reportId: string;
  kind: 'created' | 'updated';
  engineVersion: string;
  changes: string[];
  decision: ClusterDecision;
};
export type NewsEvent = {
  id: string;
  kind: string;
  entities: NewsEntity[];
  createdAt: string;
  updatedAt: string;
  reports: EventReport[];
  claims: EventClaim[];
  signals: ConfidenceSignals;
  timeline: EventUpdate[];
};
export interface AnalysisProvider {
  readonly name: string;
  analyze(report: NewsReport, signal: AbortSignal): Promise<unknown>;
}
export interface SemanticProvider {
  readonly name: string;
  similarity(left: string, right: string, signal: AbortSignal): Promise<number>;
}
export const ENGINE_VERSION = 'events-v1';
