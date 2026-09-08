import { sourceStatusSchema } from '@sak/domain';

export function GET() {
  return Response.json({
    service: 'sak-haber-web',
    status: 'ok',
    sourceStates: sourceStatusSchema.options,
  });
}
