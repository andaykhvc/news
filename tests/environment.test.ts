import { expect, it } from 'vitest';
import { environmentProblems } from '../packages/shared/src/index';
it('fails production configuration without exposing any value', () => {
  const errors = environmentProblems(
    {
      SUPABASE_URL: 'http://insecure.example',
      SUPABASE_SERVICE_ROLE_KEY: 'private-value',
      NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: 'secret',
    },
    'worker',
    true,
  );
  expect(errors.some((e) => e.includes('must never be public'))).toBe(true);
  expect(errors.some((e) => e.includes('HTTPS'))).toBe(true);
  expect(errors.join()).not.toContain('private-value');
});
it('allows optional extraction to be disabled but rejects half configuration', () => {
  const env = {
    SUPABASE_URL: 'https://db.example',
    SUPABASE_SERVICE_ROLE_KEY: 'private-value',
  };
  expect(environmentProblems(env, 'worker', true)).toEqual([]);
  expect(
    environmentProblems({ ...env, EXTRACTION_MODEL: 'model' }, 'worker'),
  ).toContain('OPENAI_API_KEY and EXTRACTION_MODEL: configure both or neither');
});
