import {
  answerResources,
  currentTurkishYear,
  resolveAnswer,
} from '../packages/answers/src/index';
import { educationOntology } from '../sources/education/src/index';
import {
  createDatabaseClient,
  loadAnswerSnapshot,
} from '../packages/database/src/index';
for (const r of answerResources) {
  if (
    !educationOntology.entities.some((e) => e.key === r.entity) ||
    !educationOntology.topics.some((t) => t.key === r.topic) ||
    !educationOntology.authorities.some(
      (a) =>
        a.entity === r.entity &&
        a.topic === r.topic &&
        a.predicates.includes(r.predicate),
    )
  )
    throw new Error(`Catalog authority mapping missing: ${r.key}`);
}
if (process.argv.includes('--offline'))
  console.log(
    'Catalog entity/topic/authority mappings valid; no demo factual values in catalog.',
  );
else {
  const client = createDatabaseClient(process.env),
    year = currentTurkishYear(),
    data = await loadAnswerSnapshot(
      client,
      answerResources.map((r) => r.entity),
      year,
    ),
    now = new Date().toISOString();
  const answers = answerResources.map((r) => resolveAnswer(r, year, data, now));
  const violations = answers.filter(
    (a) =>
      data.facts.some(
        (f) =>
          f.status === 'published' &&
          f.subject_entity_id ===
            data.entities.find((e) => e.key === a.resource.entity)?.id &&
          f.predicate === a.resource.predicate,
      ) && !a.factId,
  );
  const fixtures = data.documents.filter((d) =>
    /TEST FİKSTÜRÜ|OFFLINE DEMO/i.test(d.title),
  );
  console.log(
    JSON.stringify(
      {
        year,
        published: data.facts.filter((f) => f.status === 'published').length,
        answers: answers.map((a) => ({
          key: a.resource.key,
          state: a.state,
          stale: a.stale,
          evidence: a.evidence.length,
        })),
        invalidPublishedAnswers: violations.map((a) => a.resource.key),
        fixtureDocuments: fixtures.length,
      },
      null,
      2,
    ),
  );
  if (violations.length || fixtures.length) process.exitCode = 1;
}
