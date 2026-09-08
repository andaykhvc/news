import { z } from 'zod';
import {
  httpUrlSchema,
  idSchema,
  keySchema,
  timestampSchema,
  timestamps,
} from './common';

export const sourceStatusSchema = z.enum([
  'candidate',
  'active',
  'disabled',
  'deprecated',
]);
export const sourceSchema = z.object({
  id: idSchema,
  slug: keySchema,
  name: z.string().min(1),
  status: sourceStatusSchema,
  authority_type: keySchema,
  ...timestamps,
});

// Hostnames are canonical ASCII DNS names; registry validation applies the gov.tr policy.
export const hostnameSchema = z
  .string()
  .max(253)
  .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/);
export const allowedHostSchema = z.object({
  id: idSchema,
  source_id: idSchema,
  hostname: hostnameSchema,
  include_subdomains: z.boolean(),
  status: sourceStatusSchema,
  created_at: timestampSchema,
});
export const sourceEndpointSchema = z.object({
  id: idSchema,
  source_id: idSchema,
  slug: keySchema,
  name: z.string().min(1),
  base_url: httpUrlSchema,
  endpoint_type: keySchema,
  status: sourceStatusSchema,
  poll_interval_seconds: z.number().int().positive(),
  last_successful_check_at: timestampSchema.nullable(),
  ...timestamps,
});
export const sourceRegistrySchema = z.object({
  sources: z.array(sourceSchema),
  hosts: z.array(allowedHostSchema),
  endpoints: z.array(sourceEndpointSchema),
});
export type Source = z.infer<typeof sourceSchema>;
export type AllowedHost = z.infer<typeof allowedHostSchema>;
export type SourceEndpoint = z.infer<typeof sourceEndpointSchema>;
export type SourceRegistry = z.infer<typeof sourceRegistrySchema>;
