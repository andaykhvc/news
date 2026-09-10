-- Prompt 1: domain-independent public-information foundation.
-- Stable lifecycle values use TEXT + CHECK; extensible classifications use TEXT.
-- All application tables are private to server code despite being in public.

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z][a-z0-9_.-]*$'),
  name text not null check (length(name) > 0),
  status text not null default 'candidate' check (status in ('candidate','active','disabled','deprecated')),
  authority_type text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.allowed_hosts (
  id uuid primary key default gen_random_uuid(), source_id uuid not null references public.sources(id),
  hostname text not null check (length(hostname) <= 253 and hostname ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+gov\.tr$'),
  include_subdomains boolean not null default false,
  status text not null default 'candidate' check (status in ('candidate','active','disabled','deprecated')),
  created_at timestamptz not null default now(), unique (source_id, hostname)
);

create table public.source_endpoints (
  id uuid primary key default gen_random_uuid(), source_id uuid not null references public.sources(id),
  slug text not null, name text not null, base_url text not null check (base_url ~ '^https://'),
  endpoint_type text not null, status text not null default 'candidate' check (status in ('candidate','active','disabled','deprecated')),
  poll_interval_seconds integer not null check (poll_interval_seconds > 0),
  last_successful_check_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (source_id, slug), unique (id, source_id)
);

create table public.crawl_runs (
  id uuid primary key default gen_random_uuid(), source_endpoint_id uuid not null references public.source_endpoints(id),
  started_at timestamptz not null default now(), finished_at timestamptz,
  status text not null default 'queued' check (status in ('queued','running','success','partial','failed')),
  documents_discovered integer not null default 0 check (documents_discovered >= 0),
  documents_fetched integer not null default 0 check (documents_fetched >= 0),
  documents_changed integer not null default 0 check (documents_changed >= 0),
  errors_count integer not null default 0 check (errors_count >= 0),
  metadata jsonb not null default '{}' check (jsonb_typeof(metadata) = 'object'),
  unique (id, source_endpoint_id), check (finished_at >= started_at),
  check ((status in ('queued','running') and finished_at is null) or (status in ('success','partial','failed') and finished_at is not null))
);
create index crawl_runs_endpoint_started_idx on public.crawl_runs(source_endpoint_id, started_at desc);

create table public.crawl_errors (
  id uuid primary key default gen_random_uuid(), crawl_run_id uuid not null, source_endpoint_id uuid not null,
  url text, error_type text not null, message text not null, retryable boolean not null,
  created_at timestamptz not null default now(), metadata jsonb not null default '{}' check (jsonb_typeof(metadata) = 'object'),
  foreign key (crawl_run_id, source_endpoint_id) references public.crawl_runs(id, source_endpoint_id)
);
create index crawl_errors_run_idx on public.crawl_errors(crawl_run_id);
create index crawl_errors_endpoint_idx on public.crawl_errors(source_endpoint_id);

create table public.documents (
  id uuid primary key default gen_random_uuid(), source_id uuid not null references public.sources(id),
  source_endpoint_id uuid not null, canonical_url text not null check (canonical_url ~ '^https://'),
  external_identifier text, title text not null check (length(title) > 0), document_type text not null,
  first_seen_at timestamptz not null, latest_seen_at timestamptz not null, published_at timestamptz,
  status text not null default 'active' check (status in ('active','withdrawn','archived')),
  current_version_id uuid,
  foreign key (source_endpoint_id, source_id) references public.source_endpoints(id, source_id),
  unique (source_id, canonical_url), check (latest_seen_at >= first_seen_at)
);
create index documents_endpoint_idx on public.documents(source_endpoint_id);

create table public.document_versions (
  id uuid primary key default gen_random_uuid(), document_id uuid not null references public.documents(id),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  normalization_version text not null check (normalization_version = 'v1'),
  title text not null check (length(title) > 0), raw_text text not null check (length(raw_text) > 0),
  normalized_text text not null check (length(normalized_text) > 0), mime_type text not null,
  fetched_at timestamptz not null, published_at timestamptz,
  metadata jsonb not null default '{}' check (jsonb_typeof(metadata) = 'object'),
  unique (document_id, content_hash), unique (id, document_id)
);
-- Composite FK prevents pointing a logical document at another document's version.
alter table public.documents add constraint documents_current_version_fk
  foreign key (current_version_id, id) references public.document_versions(id, document_id);
create index documents_current_version_idx on public.documents(current_version_id);

create table public.document_attachments (
  id uuid primary key default gen_random_uuid(), document_id uuid not null references public.documents(id),
  parent_document_version_id uuid not null, url text not null check (url ~ '^https://'), mime_type text, filename text,
  content_hash text check (content_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'discovered' check (status in ('discovered','fetched','parsed','failed','unsupported')),
  metadata jsonb not null default '{}' check (jsonb_typeof(metadata) = 'object'),
  foreign key (parent_document_version_id, document_id) references public.document_versions(id, document_id),
  unique (parent_document_version_id, url)
);
create index document_attachments_document_idx on public.document_attachments(document_id);

-- A -> B -> A reuses immutable A, but still records that a change was observed.
create table public.document_observations (
  id uuid primary key default gen_random_uuid(), document_id uuid not null references public.documents(id),
  document_version_id uuid not null, crawl_run_id uuid not null, source_endpoint_id uuid not null,
  observed_at timestamptz not null,
  outcome text not null check (outcome in ('new_document','new_version','unchanged')),
  foreign key (document_version_id, document_id) references public.document_versions(id, document_id),
  foreign key (crawl_run_id, source_endpoint_id) references public.crawl_runs(id, source_endpoint_id),
  unique (crawl_run_id, document_id)
);
create index document_observations_document_idx on public.document_observations(document_id, observed_at desc);
create index document_observations_version_idx on public.document_observations(document_version_id);
create index document_observations_endpoint_idx on public.document_observations(source_endpoint_id);

create table public.topics (
  id uuid primary key default gen_random_uuid(), key text not null unique check (key ~ '^[a-z][a-z0-9_.-]*$'),
  name text not null, parent_id uuid references public.topics(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check (parent_id <> id)
);
create index topics_parent_idx on public.topics(parent_id);
create table public.entities (
  id uuid primary key default gen_random_uuid(), key text not null unique, name text not null, entity_type text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- JSON is a tagged union, not arbitrary text. Money uses exact decimal strings.
create function public.is_fact_value(value jsonb) returns boolean
language plpgsql immutable strict set search_path = '' as $$
declare kind text := value->>'type';
begin
  if jsonb_typeof(value) <> 'object' then return false; end if;
  return coalesce(case kind
    when 'date' then jsonb_typeof(value->'value') = 'string' and value->>'value' ~ '^\d{4}-\d{2}-\d{2}$' and make_date(split_part(value->>'value', '-', 1)::integer, split_part(value->>'value', '-', 2)::integer, split_part(value->>'value', '-', 3)::integer) is not null
    when 'date_range' then value->>'start' ~ '^\d{4}-\d{2}-\d{2}$' and value->>'end' ~ '^\d{4}-\d{2}-\d{2}$' and make_date(split_part(value->>'start', '-', 1)::integer, split_part(value->>'start', '-', 2)::integer, split_part(value->>'start', '-', 3)::integer) <= make_date(split_part(value->>'end', '-', 1)::integer, split_part(value->>'end', '-', 2)::integer, split_part(value->>'end', '-', 3)::integer)
    when 'money' then jsonb_typeof(value->'amount') = 'string' and value->>'amount' ~ '^-?(0|[1-9][0-9]*)(\.[0-9]+)?$' and value->>'currency' ~ '^[A-Z]{3}$'
    when 'number' then jsonb_typeof(value->'value') = 'number'
    when 'boolean' then jsonb_typeof(value->'value') = 'boolean'
    when 'status' then jsonb_typeof(value->'value') = 'string' and value->>'value' ~ '^[a-z][a-z0-9_.-]*$'
    when 'string' then jsonb_typeof(value->'value') = 'string' and length(value->>'value') > 0
    when 'url' then jsonb_typeof(value->'value') = 'string' and value->>'value' ~ '^https?://'
    when 'json' then value->>'schema_key' ~ '^[a-z][a-z0-9_.-]*$' and jsonb_typeof(value->'value') = 'object'
    else false end, false);
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then return false;
end;
$$;

create table public.facts (
  id uuid primary key default gen_random_uuid(), subject_entity_id uuid not null references public.entities(id),
  predicate text not null check (predicate ~ '^[a-z][a-z0-9_.-]*$'), value jsonb not null check (public.is_fact_value(value)), unit text,
  authority_source_id uuid not null references public.sources(id), topic_id uuid references public.topics(id),
  status text not null default 'draft' check (status in ('draft','verified','published','superseded','expired','revoked','needs_review')),
  published_at timestamptz, effective_at timestamptz, valid_from timestamptz, valid_until timestamptz, verified_at timestamptz,
  superseded_at timestamptz, superseded_by_fact_id uuid references public.facts(id), reference_period text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (valid_until > valid_from), check (superseded_by_fact_id <> id),
  check (status <> 'superseded' or superseded_at is not null),
  check (status not in ('verified','published') or verified_at is not null)
);
comment on column public.facts.valid_until is 'Exclusive boundary: temporal validity is [valid_from, valid_until). Dates in values are separate from claim validity.';
comment on column public.facts.reference_period is 'Explicit cycle such as 2026; a missing cycle does not imply the current year.';
create index facts_subject_predicate_idx on public.facts(subject_entity_id, predicate);
create index facts_authority_idx on public.facts(authority_source_id);
create index facts_topic_idx on public.facts(topic_id);
create index facts_superseded_by_idx on public.facts(superseded_by_fact_id);

create table public.fact_evidence (
  id uuid primary key default gen_random_uuid(), fact_id uuid not null references public.facts(id),
  document_version_id uuid not null references public.document_versions(id),
  evidence_text text not null check (length(evidence_text) > 0),
  evidence_locator jsonb not null check (coalesce(jsonb_typeof(evidence_locator) = 'object' and evidence_locator->>'representation' = 'raw_text', false)),
  created_at timestamptz not null default now()
);
create index fact_evidence_fact_idx on public.fact_evidence(fact_id);
create index fact_evidence_version_idx on public.fact_evidence(document_version_id);

create table public.answer_pages (
  id uuid primary key default gen_random_uuid(), slug text not null unique, topic_id uuid references public.topics(id),
  canonical_question text not null check (length(canonical_question) > 0),
  answer_status text not null default 'unverified' check (answer_status in ('unverified','verified','uncertain','outdated','withdrawn')),
  last_verified_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index answer_pages_topic_idx on public.answer_pages(topic_id);
create table public.answer_facts (
  answer_page_id uuid not null references public.answer_pages(id), fact_id uuid not null references public.facts(id),
  position integer not null check (position >= 0), primary key (answer_page_id, fact_id), unique(answer_page_id, position)
);
create index answer_facts_fact_idx on public.answer_facts(fact_id);
create table public.answer_sources (
  answer_page_id uuid not null references public.answer_pages(id), source_id uuid not null references public.sources(id),
  primary key(answer_page_id, source_id)
);
create index answer_sources_source_idx on public.answer_sources(source_id);

-- Multiple contextual owners may coexist. No global rank or automatic conflict winner.
create table public.authority_rules (
  id uuid primary key default gen_random_uuid(), topic_id uuid not null references public.topics(id),
  predicate text not null, subject_entity_id uuid references public.entities(id), source_id uuid not null references public.sources(id),
  valid_from timestamptz, valid_until timestamptz,
  status text not null default 'candidate' check (status in ('candidate','active','disabled')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check (valid_until > valid_from),
  unique nulls not distinct (topic_id, predicate, subject_entity_id, source_id, valid_from)
);
create index authority_rules_subject_idx on public.authority_rules(subject_entity_id);
create index authority_rules_source_idx on public.authority_rules(source_id);

create function public.reject_history_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'Historical records are immutable; create a new version or transition lifecycle status'; end;
$$;
create trigger document_versions_immutable before update or delete on public.document_versions for each row execute function public.reject_history_mutation();
create trigger document_observations_immutable before update or delete on public.document_observations for each row execute function public.reject_history_mutation();
create trigger fact_evidence_immutable before update or delete on public.fact_evidence for each row execute function public.reject_history_mutation();
create trigger facts_no_delete before delete on public.facts for each row execute function public.reject_history_mutation();

create function public.guard_fact() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and row(new.subject_entity_id, new.predicate, new.value, new.unit, new.authority_source_id, new.topic_id, new.valid_from, new.valid_until, new.effective_at, new.reference_period)
    is distinct from row(old.subject_entity_id, old.predicate, old.value, old.unit, old.authority_source_id, old.topic_id, old.valid_from, old.valid_until, old.effective_at, old.reference_period) then
    raise exception 'Fact claims are immutable; supersede with a new fact';
  end if;
  if new.status = 'published' then
    if new.published_at is null or new.verified_at is null or new.verified_at > now() then raise exception 'Publication requires past verification and a publication timestamp'; end if;
    if not exists (select 1 from public.sources where id = new.authority_source_id and status = 'active') then raise exception 'Publication requires an active authority'; end if;
    if not exists (
      select 1 from public.fact_evidence e join public.document_versions v on v.id = e.document_version_id
      join public.documents d on d.id = v.document_id
      where e.fact_id = new.id and d.source_id = new.authority_source_id and position(e.evidence_text in v.raw_text) > 0
    ) then raise exception 'Publication requires official version-level evidence'; end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger facts_guard before insert or update on public.facts for each row execute function public.guard_fact();

create function public.guard_evidence() returns trigger
language plpgsql set search_path = '' as $$
declare content text; source_id uuid; authority_id uuid;
begin
  select v.raw_text, d.source_id into content, source_id from public.document_versions v join public.documents d on d.id = v.document_id where v.id = new.document_version_id;
  select authority_source_id into authority_id from public.facts where id = new.fact_id;
  if content is null or source_id is distinct from authority_id or position(new.evidence_text in content) = 0 then
    raise exception 'Evidence must quote the authority document version';
  end if;
  return new;
end;
$$;
create trigger evidence_guard before insert on public.fact_evidence for each row execute function public.guard_evidence();

create function public.guard_topic_cycle() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Serialize rare taxonomy edits so concurrent reparents cannot form a cycle.
  perform pg_advisory_xact_lock(7384921);
  if exists (with recursive parents as (
    select id, parent_id from public.topics where id = new.parent_id
    union select t.id, t.parent_id from public.topics t join parents p on t.id = p.parent_id
  ) select 1 from parents where id = new.id) then raise exception 'Topic hierarchy cannot contain cycles'; end if;
  return new;
end;
$$;
create trigger topics_acyclic before insert or update of parent_id on public.topics for each row execute function public.guard_topic_cycle();

-- One invoker-rights RPC provides transactionality across documents, versions,
-- attachments and observations. Row locking serializes concurrent canonical URLs.
create function public.persist_ingested_document(p_input jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  d public.documents%rowtype; prior public.document_observations%rowtype;
  version_id uuid; old_hash text; outcome text; parsed jsonb := p_input->'parsed'; attachment jsonb;
  v_source_id uuid := (p_input->>'source_id')::uuid;
  v_endpoint_id uuid := (p_input->>'source_endpoint_id')::uuid;
  v_run_id uuid := (p_input->>'crawl_run_id')::uuid;
  v_fetched_at timestamptz := (p_input->>'fetched_at')::timestamptz;
begin
  if not exists (select 1 from public.sources s join public.source_endpoints e on e.source_id = s.id
    join public.crawl_runs r on r.source_endpoint_id = e.id
    where s.id = v_source_id and e.id = v_endpoint_id and r.id = v_run_id and s.status = 'active' and e.status = 'active' and r.status = 'running') then
    raise exception 'Ingestion requires an active source, endpoint and running crawl';
  end if;
  insert into public.documents(source_id, source_endpoint_id, canonical_url, external_identifier, title, document_type, first_seen_at, latest_seen_at, published_at)
    values(v_source_id, v_endpoint_id, parsed->>'canonical_url', p_input->>'external_identifier', parsed->>'title', parsed->>'document_type', v_fetched_at, v_fetched_at, (parsed->>'published_at')::timestamptz)
    on conflict (source_id, canonical_url) do nothing;
  select * into strict d from public.documents where documents.source_id = v_source_id and canonical_url = parsed->>'canonical_url' for update;
  select * into prior from public.document_observations where crawl_run_id = v_run_id and document_id = d.id;
  if found then
    return jsonb_build_object('outcome', prior.outcome, 'document_id', d.id, 'version_id', prior.document_version_id);
  end if;
  -- Do not let a delayed concurrent fetch roll the current pointer back in time.
  if v_fetched_at < d.latest_seen_at then raise exception 'Stale observation: a newer fetch has already been persisted'; end if;
  select content_hash into old_hash from public.document_versions where id = d.current_version_id;
  outcome := case when d.current_version_id is null then 'new_document' when old_hash = p_input->>'content_hash' then 'unchanged' else 'new_version' end;
  insert into public.document_versions(document_id, content_hash, normalization_version, title, raw_text, normalized_text, mime_type, fetched_at, published_at, metadata)
    values(d.id, p_input->>'content_hash', p_input->>'normalization_version', parsed->>'title', parsed->>'raw_text', p_input->>'normalized_text', p_input->>'mime_type', v_fetched_at, (parsed->>'published_at')::timestamptz, parsed->'metadata')
    on conflict (document_id, content_hash) do nothing;
  select id into strict version_id from public.document_versions where document_id = d.id and content_hash = p_input->>'content_hash';
  for attachment in select * from jsonb_array_elements(parsed->'attachments') loop
    insert into public.document_attachments(document_id, parent_document_version_id, url, mime_type, filename)
      values(d.id, version_id, attachment->>'url', attachment->>'mime_type', attachment->>'filename')
      on conflict (parent_document_version_id, url) do nothing;
  end loop;
  update public.documents set current_version_id = version_id, latest_seen_at = v_fetched_at,
    title = parsed->>'title', document_type = parsed->>'document_type', published_at = (parsed->>'published_at')::timestamptz where id = d.id;
  insert into public.document_observations(document_id, document_version_id, crawl_run_id, source_endpoint_id, observed_at, outcome)
    values(d.id, version_id, v_run_id, v_endpoint_id, v_fetched_at, outcome);
  return jsonb_build_object('outcome', outcome, 'document_id', d.id, 'version_id', version_id);
end;
$$;

-- The database has no public HTTP data API. A dedicated, non-browser database
-- account is the boundary; Next.js and the worker are the only clients.
