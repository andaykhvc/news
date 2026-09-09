import { z } from 'zod';

// Six original topic IDs are valid PostgreSQL UUID values with a legacy variant.
// Preserve those referenced identities; all new IDs still require RFC UUID validation.
export const idSchema = z.union([
  z.uuid(),
  z.string().regex(/^00000000-0000-4000-c000-00000000000[1-6]$/),
]);
export const timestampSchema = z.iso.datetime({ offset: true });
export const dateSchema = z.iso.date();
export const keySchema = z.string().regex(/^[a-z][a-z0-9_.-]*$/);
export const metadataSchema = z.record(z.string(), z.json());
export type Json = z.infer<ReturnType<typeof z.json>>;
export const timestamps = {
  created_at: timestampSchema,
  updated_at: timestampSchema,
};
export const httpUrlSchema = z.url({ protocol: /^https?$/ });
