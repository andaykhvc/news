/** Report variable names only, never their secret values. */
export function environmentProblems(
  env: Readonly<Record<string, string | undefined>>,
  target: 'web' | 'worker',
  production = false,
): string[] {
  void production;
  const errors: string[] = [];
  for (const key of Object.keys(env))
    if (
      key.startsWith('NEXT_PUBLIC_') &&
      /SECRET|SERVICE_ROLE|PASSWORD|OPENAI_API_KEY/.test(key) &&
      env[key]
    )
      errors.push(`${key}: must never be public`);
  for (const key of [
    'DATABASE_URL',
    ...(target === 'web'
      ? [
          'PUBLIC_SITE_URL',
          'ADMIN_PASSWORD_SCRYPT',
          'ADMIN_SESSION_SECRET',
          'ANALYTICS_SALT',
        ]
      : []),
  ])
    if (!env[key]?.trim()) errors.push(`${key}: required`);
  for (const key of [
    'DATABASE_URL',
    ...(target === 'web' ? ['PUBLIC_SITE_URL'] : []),
  ]) {
    const value = env[key];
    if (!value) continue;
    try {
      const url = new URL(value);
      if (
        !['postgres:', 'postgresql:'].includes(url.protocol) ||
        !url.hostname ||
        !url.username ||
        !url.pathname ||
        url.hash
      )
        errors.push(`${key}: use a complete PostgreSQL connection URL`);
    } catch {
      errors.push(`${key}: invalid URL`);
    }
  }
  for (const key of ['ADMIN_SESSION_SECRET', 'ANALYTICS_SALT'])
    if (env[key] && env[key]!.length < 32)
      errors.push(`${key}: at least 32 random characters required`);
  if (
    env['ADMIN_PASSWORD_SCRYPT'] &&
    !/^[a-f0-9]{32,128}:[a-f0-9]{128}$/.test(env['ADMIN_PASSWORD_SCRYPT']!)
  )
    errors.push('ADMIN_PASSWORD_SCRYPT: expected salt:hash');
  if (Boolean(env['OPENAI_API_KEY']) !== Boolean(env['EXTRACTION_MODEL']))
    errors.push(
      'OPENAI_API_KEY and EXTRACTION_MODEL: configure both or neither',
    );
  if (env['WORKER_CONCURRENCY'] && !/^[1-4]$/.test(env['WORKER_CONCURRENCY']!))
    errors.push('WORKER_CONCURRENCY: choose 1–4');
  return errors;
}
