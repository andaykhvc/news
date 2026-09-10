create or replace function public.is_fact_value(value jsonb) returns boolean
language plpgsql immutable strict set search_path = '' as $$
declare kind text := value->>'type';
begin
  if jsonb_typeof(value) <> 'object' then return false; end if;
  return coalesce(case kind
    when 'datetime' then jsonb_typeof(value->'value')='string' and value->>'value' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' and make_timestamp(substr(value->>'value',1,4)::integer,substr(value->>'value',6,2)::integer,substr(value->>'value',9,2)::integer,substr(value->>'value',12,2)::integer,substr(value->>'value',15,2)::integer,substr(value->>'value',18,2)::double precision) is not null and substr(value->>'value',12,2)::integer<24 and substr(value->>'value',18,2)::integer<60 and value->>'value' ~ '(Z|[+-](0[0-9]|1[0-9]|2[0-3]):[0-5][0-9])$'
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

-- Phase 2: immutable source artifacts, extraction decisions and scoped coverage.
-- Source-specific ontology/registrations live in generated seed data, never generic SQL.
create table public.source_artifacts (
  hash text primary key check(hash ~ '^[a-f0-9]{64}$'), bytes bytea not null,
  byte_length integer generated always as (octet_length(bytes)) stored,
  created_at timestamptz not null default now(), check(octet_length(bytes) between 1 and 10000000),
  check(hash = encode(sha256(bytes),'hex'))
);
create table public.source_responses (
  id uuid primary key default gen_random_uuid(), source_id uuid not null references public.sources(id),
  document_version_id uuid references public.document_versions(id), parent_version_id uuid references public.document_versions(id),
  artifact_hash text not null references public.source_artifacts(hash), requested_url text not null, final_url text not null,
  mime_type text not null, fetched_at timestamptz not null,
  status text not null check(status in ('parsed','needs_review')), reasons jsonb not null check(jsonb_typeof(reasons)='array'),
  unique nulls not distinct(document_version_id,parent_version_id,final_url,artifact_hash)
);
create index source_responses_source_idx on public.source_responses(source_id);
create index source_responses_version_idx on public.source_responses(document_version_id);
create index source_responses_parent_idx on public.source_responses(parent_version_id);
create index source_responses_artifact_idx on public.source_responses(artifact_hash);
create table public.extraction_attempts (
  id uuid primary key default gen_random_uuid(), idempotency_key text not null check(idempotency_key ~ '^[a-f0-9]{64}$'),
  document_version_id uuid not null references public.document_versions(id), provider text not null, model text not null,
  ontology_version text not null, prompt_version text not null default 'facts-v1', validator_version text not null default 'grounding-v1',
  status text not null check(status in ('completed','failed')), error text, created_at timestamptz not null default now()
);
create unique index extraction_completed_identity_idx on public.extraction_attempts(idempotency_key) where status='completed';
create index extraction_attempts_identity_idx on public.extraction_attempts(idempotency_key);
create index extraction_attempts_version_idx on public.extraction_attempts(document_version_id);
create table public.candidate_validations (
  id uuid primary key default gen_random_uuid(), attempt_id uuid not null references public.extraction_attempts(id),
  candidate_index integer not null check(candidate_index>=0), candidate jsonb not null check(jsonb_typeof(candidate)='object'),
  decision jsonb not null check(decision->>'status' in ('verified','needs_review','rejected') and jsonb_array_length(decision->'reasons')>0),
  fact_id uuid references public.facts(id), created_at timestamptz not null default now(), unique(attempt_id,candidate_index)
);
create index candidate_validations_fact_idx on public.candidate_validations(fact_id);
create table public.source_coverage (
  crawl_run_id uuid primary key references public.crawl_runs(id), checked_at timestamptz not null,
  scope text not null check(scope in ('rolling_window','paginated_archive')), complete boolean not null,
  pages jsonb not null check(jsonb_typeof(pages)='array'), discovered integer not null check(discovered>=0),
  reasons jsonb not null check(jsonb_typeof(reasons)='array')
);
alter table public.facts add column claim_hash text unique check(claim_hash ~ '^[a-f0-9]{64}$');
create index facts_context_idx on public.facts(subject_entity_id,topic_id,predicate,reference_period);
alter table public.document_attachments drop constraint document_attachments_status_check;
alter table public.document_attachments add constraint document_attachments_status_check check(status in ('discovered','fetched','parsed','failed','unsupported','needs_review'));
-- New writes deduplicate evidence without rewriting existing history.
create unique index fact_evidence_identity_idx on public.fact_evidence(fact_id,document_version_id,md5(evidence_text),md5(evidence_locator::text));

create function public.trusted_source_url(p_url text,p_source uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select coalesce(p_url ~ '^https://[a-z0-9.-]+(/|$)' and exists(
   select 1 from public.allowed_hosts h join public.sources s on s.id=h.source_id
   where h.source_id=p_source and h.status='active' and s.status='active'
   and (substring(p_url from '^https://([^/?#]+)')=h.hostname or (h.include_subdomains and substring(p_url from '^https://([^/?#]+)') like '%.'||h.hostname))
 ),false)
$$;
-- JS locators use UTF-16 units; PostgreSQL substring uses Unicode code points.
create function public.utf16_slice(p_text text,p_start integer,p_end integer) returns text language plpgsql immutable strict set search_path='' as $$
declare units integer:=0; first_i integer; last_i integer; width integer;
begin
 if p_start<0 or p_end<=p_start then return null; end if;
 for i in 1..length(p_text) loop
   if units=p_start then first_i:=i; end if;
   width:=case when ascii(substr(p_text,i,1))>65535 then 2 else 1 end; units:=units+width;
   if units=p_end then last_i:=i;exit;end if;
   if units>p_end then return null;end if;
 end loop;
 if first_i is null or last_i is null then return null;end if;
 return substr(p_text,first_i,last_i-first_i+1);
end $$;
create function public.archive_source_response(p_input jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare b bytea:=decode(p_input->'response'->>'body_base64','base64'); h text; src uuid:=(p_input->>'source_id')::uuid; v uuid:=(p_input->>'version_id')::uuid; parent uuid:=(p_input->>'parent_version_id')::uuid;
begin
 if not public.trusted_source_url(p_input->'response'->>'requested_url',src) or not public.trusted_source_url(p_input->'response'->>'final_url',src) then raise exception 'Untrusted artifact URL';end if;
 if exists(select 1 from public.document_versions dv join public.documents d on d.id=dv.document_id where dv.id in(v,parent) and d.source_id<>src) then raise exception 'Artifact ownership mismatch';end if;
 h:=encode(sha256(b),'hex');insert into public.source_artifacts(hash,bytes) values(h,b) on conflict do nothing;
 insert into public.source_responses(source_id,document_version_id,parent_version_id,artifact_hash,requested_url,final_url,mime_type,fetched_at,status,reasons)
 values(src,v,parent,h,p_input->'response'->>'requested_url',p_input->'response'->>'final_url',p_input->'response'->>'mime_type',(p_input->'response'->>'fetched_at')::timestamptz,p_input->>'status',p_input->'reasons') on conflict do nothing;
 if parent is not null then update public.document_attachments set status=p_input->>'status',content_hash=h,metadata=jsonb_build_object('parsed_version_id',v,'reasons',p_input->'reasons') where parent_document_version_id=parent and url=p_input->'response'->>'requested_url';end if;
end $$;

create function public.record_extraction(p_input jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare a uuid; v public.document_versions%rowtype; d public.documents%rowtype; entry jsonb;c jsonb;decision jsonb; f uuid;entity uuid;topic uuid;h text;conflict_exists boolean; idx integer:=0;
begin
 select * into strict v from public.document_versions where id=(p_input->>'version_id')::uuid;
 select * into strict d from public.documents where id=v.document_id;
 -- Serialized per extraction identity and per claim context. No latest-crawl winner.
 perform pg_advisory_xact_lock(hashtextextended(p_input->>'key',0));
 if exists(select 1 from public.extraction_attempts where idempotency_key=p_input->>'key' and status='completed') then return;end if;
 insert into public.extraction_attempts(idempotency_key,document_version_id,provider,model,ontology_version,status,error,created_at)
 values(p_input->>'key',v.id,p_input->>'provider',p_input->>'model',p_input->>'ontology_version',p_input->>'status',p_input->>'error',(p_input->>'created_at')::timestamptz) returning id into a;
 for entry in select * from jsonb_array_elements(p_input->'results') loop
   c:=entry->'candidate';decision:=entry->'decision'; f:=null;entity:=null;topic:=null;
   if decision->>'status'='verified' then
     if not public.trusted_source_url(d.canonical_url,d.source_id) or d.current_version_id<>v.id or d.status<>'active' then raise exception 'Verified candidate requires current trusted source';end if;
     if public.utf16_slice(v.raw_text,(c->'evidence'->>'start')::integer,(c->'evidence'->>'end')::integer) is distinct from c->'evidence'->>'quote' then raise exception 'Candidate evidence offsets mismatch';end if;
     if position(c->>'value_text' in c->'evidence'->>'quote')=0 then raise exception 'Candidate value text missing';end if;
     if not exists(select 1 from jsonb_array_elements(v.metadata->'structure'->'blocks') block where (block->>'start')::integer<=(c->'evidence'->>'start')::integer and (block->>'end')::integer>=(c->'evidence'->>'end')::integer and block->'page'=c->'evidence'->'page') then raise exception 'Candidate page locator mismatch';end if;
     if not public.is_fact_value(c->'value') or c->>'reference_period' is null or c->>'correction_of' is not null then raise exception 'Candidate value/period/correction requires review';end if;
     select id into strict entity from public.entities where key=c->>'entity_key';select id into strict topic from public.topics where key=c->>'topic_key';
     if not exists(select 1 from public.authority_rules ar where ar.topic_id=topic and ar.predicate=c->>'predicate' and ar.source_id=d.source_id and (ar.subject_entity_id=entity or ar.subject_entity_id is null) and ar.status='active' and (ar.valid_from is null or ar.valid_from<=now()) and (ar.valid_until is null or ar.valid_until>now())) then raise exception 'No contextual authority rule';end if;
     perform pg_advisory_xact_lock(hashtextextended(jsonb_build_array(entity,topic,c->>'predicate',c->>'reference_period')::text,1));
     h:=encode(sha256(convert_to(jsonb_build_array(entity,topic,c->>'predicate',c->>'reference_period',c->'value',c->'unit',d.source_id)::text,'UTF8')),'hex');
     select exists(select 1 from public.facts other where other.subject_entity_id=entity and other.topic_id=topic and other.predicate=c->>'predicate' and other.reference_period=c->>'reference_period' and other.value<>c->'value' and other.status in('verified','published','needs_review')) into conflict_exists;
     insert into public.facts(subject_entity_id,topic_id,predicate,value,unit,authority_source_id,reference_period,claim_hash)
       values(entity,topic,c->>'predicate',c->'value',c->>'unit',d.source_id,c->>'reference_period',h) on conflict(claim_hash) do nothing;
     select id into strict f from public.facts where claim_hash=h;
     insert into public.fact_evidence(fact_id,document_version_id,evidence_text,evidence_locator)
       values(f,v.id,c->'evidence'->>'quote',jsonb_strip_nulls(jsonb_build_object('representation','raw_text','character_start',c->'evidence'->'start','character_end',c->'evidence'->'end','page_number',c->'evidence'->'page'))) on conflict do nothing;
     if conflict_exists then
       decision:=jsonb_build_object('status','needs_review','validator_version','grounding-v1','reasons',jsonb_build_array('conflicting_authoritative_claims'));
       update public.facts set status='needs_review' where subject_entity_id=entity and topic_id=topic and predicate=c->>'predicate' and reference_period=c->>'reference_period' and status in('draft','verified','published');
     end if;
   end if;
   insert into public.candidate_validations(attempt_id,candidate_index,candidate,decision,fact_id) values(a,idx,c,decision,f);
   if f is not null and decision->>'status'='verified' then update public.facts set status='verified',verified_at=now() where id=f and status in('draft','verified');end if;
   idx:=idx+1;
 end loop;
end $$;
-- Only an explicit, reviewed resolution may retire a claim. Automated candidates cannot call this path.
create table public.fact_resolutions (
 id uuid primary key default gen_random_uuid(), old_fact_id uuid not null references public.facts(id), new_fact_id uuid not null references public.facts(id),
 reason text not null check(length(reason)>10), reviewed_by text not null check(length(reviewed_by)>0), created_at timestamptz not null default now(), check(old_fact_id<>new_fact_id)
);
create index fact_resolutions_old_idx on public.fact_resolutions(old_fact_id);
create index fact_resolutions_new_idx on public.fact_resolutions(new_fact_id);
create function public.resolve_fact_correction(p_old uuid,p_new uuid,p_reason text,p_reviewer text) returns void language plpgsql security invoker set search_path='' as $$
declare old public.facts%rowtype; replacement public.facts%rowtype;
begin
 perform pg_advisory_xact_lock(hashtextextended('fact-resolution',0));
 select * into strict old from public.facts where id=p_old for update;
 select * into strict replacement from public.facts where id=p_new for update;
 if row(old.subject_entity_id,old.topic_id,old.predicate,old.reference_period) is distinct from row(replacement.subject_entity_id,replacement.topic_id,replacement.predicate,replacement.reference_period) then raise exception 'Correction contexts differ';end if;
 if old.status in('superseded','revoked','expired') or replacement.status not in('needs_review','verified') then raise exception 'Invalid correction lifecycle';end if;
 if not exists(select 1 from public.fact_evidence where fact_id=p_new) then raise exception 'Correction needs evidence';end if;
 insert into public.fact_resolutions(old_fact_id,new_fact_id,reason,reviewed_by) values(p_old,p_new,p_reason,p_reviewer);
 update public.facts set status='superseded',superseded_at=now(),superseded_by_fact_id=p_new where id=p_old;
 update public.facts set status='verified',verified_at=now() where id=p_new;
end $$;

create or replace function public.guard_fact() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and row(new.subject_entity_id, new.predicate, new.value, new.unit, new.authority_source_id, new.topic_id, new.valid_from, new.valid_until, new.effective_at, new.reference_period)
    is distinct from row(old.subject_entity_id, old.predicate, old.value, old.unit, old.authority_source_id, old.topic_id, old.valid_from, old.valid_until, old.effective_at, old.reference_period) then
    raise exception 'Fact claims are immutable; supersede with a new fact';
  end if;
  if tg_op='UPDATE' and old.status in('superseded','revoked','expired') and new.status<>old.status then raise exception 'Terminal fact cannot be reactivated';end if;
  if new.status in('verified','published') then
    if exists(select 1 from public.facts other where other.id<>new.id and other.subject_entity_id=new.subject_entity_id and other.topic_id=new.topic_id and other.predicate=new.predicate and other.reference_period is not distinct from new.reference_period and other.value<>new.value and other.status in('verified','published','needs_review')) then raise exception 'Unresolved contextual conflict';end if;
    if not exists(select 1 from public.candidate_validations cv where cv.fact_id=new.id and cv.decision->>'status'='verified') and not exists(select 1 from public.fact_resolutions fr where fr.new_fact_id=new.id) then raise exception 'Verification requires audited deterministic validation or explicit resolution';end if;
    if not exists(select 1 from public.fact_evidence e join public.document_versions v on v.id=e.document_version_id join public.documents d on d.id=v.document_id join public.authority_rules ar on ar.source_id=d.source_id and ar.topic_id=new.topic_id and ar.predicate=new.predicate and (ar.subject_entity_id is null or ar.subject_entity_id=new.subject_entity_id) where e.fact_id=new.id and d.current_version_id=v.id and d.status='active' and public.trusted_source_url(d.canonical_url,d.source_id) and ar.status='active' and (ar.valid_from is null or ar.valid_from<=now()) and (ar.valid_until is null or ar.valid_until>now())) then raise exception 'Verification requires current authoritative evidence';end if;
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
do $$ declare name text;begin
 foreach name in array array['source_artifacts','source_responses','extraction_attempts','candidate_validations','source_coverage','fact_resolutions'] loop
 execute format('create trigger %I before update or delete on public.%I for each row execute function public.reject_history_mutation()',name||'_immutable',name);
 end loop;
end $$;
