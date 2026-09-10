import { expect, it } from 'vitest';
import { environmentProblems } from '../packages/shared/src/index';
it('fails production configuration without exposing any value', () => {
  const errors = environmentProblems(
    {
      DATABASE_URL: 'postgresql://app:private-value@db.example/sak_haber',
      NEXT_PUBLIC_ADMIN_SESSION_SECRET: 'secret',
    },
    'worker',
    true,
  );
  expect(errors.some((e) => e.includes('must never be public'))).toBe(true);
  expect(errors.some((e) => e.includes('complete PostgreSQL'))).toBe(false);
  expect(errors.join()).not.toContain('private-value');
});
it('allows optional extraction to be disabled but rejects half configuration', () => {
  const env = {
    DATABASE_URL: 'postgresql://app:private-value@db.example/sak_haber',
  };
  expect(environmentProblems(env, 'worker', true)).toEqual([]);
  expect(
    environmentProblems({ ...env, EXTRACTION_MODEL: 'model' }, 'worker'),
  ).toContain('OPENAI_API_KEY and EXTRACTION_MODEL: configure both or neither');
});
