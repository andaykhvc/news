import { z } from 'zod';

export const idSchema = z.uuid();
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
