export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
export type LogEvent =
  | 'crawl_started'
  | 'crawl_finished'
  | 'document_discovered'
  | 'document_created'
  | 'document_unchanged'
  | 'document_version_created'
  | 'source_validation_failed'
  | 'fetch_failed'
  | 'parse_failed'
  | 'pipeline_failed'
  | 'retry_scheduled'
  | 'worker_ready';
export interface Logger {
  log(
    level: 'info' | 'warn' | 'error',
    event: LogEvent,
    fields?: Readonly<Record<string, string | number | boolean | null>>,
  ): void;
}
export function createJsonLogger(
  write: (line: string) => void = (line) => console.log(line),
  now: () => Date = () => new Date(),
): Logger {
  return {
    log: (level, event, fields = {}) =>
      write(
        JSON.stringify({
          ...fields,
          timestamp: now().toISOString(),
          level,
          event,
        }),
      ),
  };
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
