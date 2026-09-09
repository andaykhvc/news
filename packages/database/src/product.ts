import {
  answerSnapshotSchema,
  factHistory,
  type AnswerSnapshot,
} from '@sak/answers';
import type { DatabaseClient } from './client';
export async function loadAnswerSnapshot(
  client: DatabaseClient,
  entities: string[],
  year: number,
): Promise<AnswerSnapshot> {
  const { data, error } = await client
    .rpc('product_snapshot', { p_entities: entities, p_year: String(year) })
    .abortSignal(AbortSignal.timeout(5000));
  if (error) throw new Error('Answer data unavailable');
  const snapshot = answerSnapshotSchema.parse(data);
  const history = new Map<string, AnswerSnapshot['history'][number]>();
  for (const entry of [
    ...snapshot.facts.flatMap(factHistory),
    ...snapshot.history,
  ]) {
    const action = entry.action === 'publish' ? 'published' : entry.action;
    history.set(`${entry.fact_id}:${Date.parse(entry.at)}:${action}`, {
      ...entry,
      action,
    });
  }
  snapshot.history = [...history.values()];
  return snapshot;
}
