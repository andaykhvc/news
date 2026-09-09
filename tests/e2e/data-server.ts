/** Local PostgREST contract double. Application code has no demo/fixture switch. */
import { createServer } from 'node:http';
import { answerFixture } from '../answer-fixture';
import { factHistory } from '../../packages/answers/src/index';
const server = createServer(async (request, response) => {
  let body = '';
  for await (const chunk of request) body += String(chunk);
  const input: unknown = body ? JSON.parse(body) : {};
  const params =
    input && typeof input === 'object'
      ? (input as Record<string, unknown>)
      : {};
  response.setHeader('Content-Type', 'application/json');
  if (request.url?.includes('product_snapshot')) {
    const year = String(params['p_year'] ?? '2026');
    if (year === '2034') {
      response.statusCode = 503;
      response.end('{"message":"fixture outage"}');
      return;
    }
    const data = answerFixture(new Date().toISOString());
    for (const f of data.facts) {
      f.reference_period = year;
      if (f.value.type === 'date_range') {
        f.value.start = `${year}-09-20`;
        f.value.end = `${year}-09-25`;
      }
    }
    for (const v of data.versions) {
      v.raw_text = v.raw_text.replaceAll('2026', year);
      v.normalized_text = v.raw_text;
    }
    for (const e of data.evidence)
      e.evidence_text = e.evidence_text.replaceAll('2026', year);
    for (const v of data.validations) {
      v.candidate.reference_period = year;
      v.candidate.evidence.quote = v.candidate.evidence.quote.replaceAll(
        '2026',
        year,
      );
      v.candidate.value = data.facts[0]!.value;
    }
    if (year === '2025') data.facts[0]!.reference_period = '2024';
    if (year === '2027') {
      data.facts[0]!.status = 'superseded';
      data.facts[0]!.superseded_at = new Date().toISOString();
    }
    if (year === '2028') data.facts[0]!.status = 'needs_review';
    if (year === '2029') data.facts = [];
    if (year === '2030') data.checks[0]!.reasons = ['parser_drift'];
    if (year === '2031')
      data.documents[0]!.current_version_id =
        '00000000-0000-4000-8000-000000000099';
    if (year === '2032') {
      data.facts = [];
      data.checks[0]!.extraction_complete = false;
    }
    data.history = data.facts.flatMap(factHistory);
    response.end(JSON.stringify(data));
    return;
  }
  if (request.url?.includes('product_admin_snapshot')) {
    response.end(
      JSON.stringify({
        jobs: [],
        documents: [],
        runs: [],
        errors: [],
        extractions: [],
        candidates: [],
        facts: [],
        feedback: [],
      }),
    );
    return;
  }
  if (request.url?.includes('search_answer_resources')) {
    response.end('[]');
    return;
  }
  if (request.url?.includes('consume_product_limit')) {
    response.end('true');
    return;
  }
  if (request.url?.includes('record_product_event')) {
    response.end('null');
    return;
  }
  response.statusCode = 503;
  response.end(JSON.stringify({ message: 'Fixture endpoint unavailable' }));
});
server.listen(56329, '127.0.0.1');
