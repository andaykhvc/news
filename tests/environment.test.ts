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
it('accepts an HTTPS public site origin and checks intelligence worker configuration', () => {
  const env = {
    DATABASE_URL: 'postgresql://app:password@db.example.com/db',
    PUBLIC_SITE_URL: 'https://news.example.com',
    ADMIN_PASSWORD_SCRYPT: 'a'.repeat(32) + ':' + 'b'.repeat(128),
    ADMIN_SESSION_SECRET: 's'.repeat(32),
    ANALYTICS_SALT: 'x'.repeat(32),
  };
  expect(environmentProblems(env, 'web')).toEqual([]);
  expect(
    environmentProblems(
      {
        ...env,
        NEWS_CONCURRENCY: '20',
        NEWS_USER_AGENT: 'otherbot',
        NEWS_ANALYSIS_URL: 'http://model.example.com',
      },
      'worker',
    ),
  ).toHaveLength(3);
});
