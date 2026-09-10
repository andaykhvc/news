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
  const rows = await client.query<{ data: unknown }>(
    'select product_snapshot($1::text[],$2::text) data',
    [entities, String(year)],
  );
  const snapshot = answerSnapshotSchema.parse(rows[0]?.data);
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
