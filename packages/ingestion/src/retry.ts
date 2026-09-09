import type { AdapterResult } from '@sak/source-sdk';

export interface RetryPolicy {
  maxAttempts: number;
  delayMs: number;
  sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}
export const noRetries: RetryPolicy = {
  maxAttempts: 1,
  delayMs: 0,
  sleep: async () => {},
};
export async function withRetry<T>(
  operation: () => Promise<AdapterResult<T>>,
  policy: RetryPolicy,
  signal: AbortSignal,
  onRetry: (attempt: number) => void,
): Promise<AdapterResult<T>> {
  if (
    !Number.isInteger(policy.maxAttempts) ||
    policy.maxAttempts < 1 ||
    policy.maxAttempts > 5 ||
    policy.delayMs < 0
  )
    throw new Error('Invalid retry policy');
  for (let attempt = 1; ; attempt++) {
    signal.throwIfAborted();
    const result = await operation();
    if (result.ok || !result.error.retryable || attempt >= policy.maxAttempts)
      return result;
    onRetry(attempt);
    await policy.sleep(
      Math.min(
        60000,
        Math.max(
          policy.delayMs * 2 ** (attempt - 1),
          result.error.retry_after_ms ?? 0,
        ),
      ),
      signal,
    );
  }
}
