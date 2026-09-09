-- Product reads use one transaction snapshot; raw tables remain server-only.
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
create table public.query_aliases (
  alias text primary key check(length(alias) between 2 and 160),
  resource_key text not null check(resource_key ~ '^[a-z_]+$'),
  search_vector tsvector generated always as (to_tsvector('simple',alias)) stored
);
create index query_aliases_trgm_idx on public.query_aliases using gin(alias extensions.gin_trgm_ops);
create index query_aliases_search_idx on public.query_aliases using gin(search_vector);
create function public.search_answer_resources(p_query text) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(x),'[]') from (select resource_key,max(extensions.similarity(alias,left(p_query,160))) as score from public.query_aliases
 where length(p_query) between 3 and 240 and (alias operator(extensions.%) left(p_query,160) or search_vector @@ plainto_tsquery('simple',left(p_query,160)))
 group by resource_key order by score desc,resource_key limit 5) x;
$$;
create table public.fact_review_actions (
 id uuid primary key default gen_random_uuid(), fact_id uuid not null references public.facts(id),
 action text not null check(action in ('publish','review','reject')), reason text not null check(length(reason) between 12 and 1000),
 reviewer text not null check(length(reviewer) between 1 and 100), created_at timestamptz not null default now()
);
create index fact_review_actions_fact_idx on public.fact_review_actions(fact_id,created_at desc);
create trigger fact_review_actions_immutable before update or delete on public.fact_review_actions for each row execute function public.reject_history_mutation();
create table public.endpoint_jobs (
 endpoint_id uuid primary key references public.source_endpoints(id), due_at timestamptz not null default now(),
 lease_token uuid, lease_until timestamptz, attempts integer not null default 0 check(attempts between 0 and 3),
 last_finished_at timestamptz, last_success boolean, last_error text,
 check ((lease_token is null) = (lease_until is null))
);
create index endpoint_jobs_due_idx on public.endpoint_jobs(due_at);
create table public.product_events (
 day date not null default current_date, kind text not null check(kind in ('unresolved','helpful','unhelpful')),
 key text not null check(length(key) between 1 and 240), count integer not null default 1 check(count>0), primary key(day,kind,key)
);
create table public.request_limits (
 key text primary key check(length(key)<=160), window_start timestamptz not null, count integer not null check(count>0)
);
create function public.consume_product_limit(p_key text,p_limit integer,p_seconds integer) returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
 declare n integer;
 begin
 if length(p_key)>160 or p_limit not between 1 and 100 or p_seconds not between 1 and 3600 then raise exception 'invalid rate policy'; end if;
 insert into public.request_limits as r values(p_key,now(),1) on conflict(key) do update set
 count=case when r.window_start+make_interval(secs=>p_seconds)<=now() then 1 else r.count+1 end,
 window_start=case when r.window_start+make_interval(secs=>p_seconds)<=now() then now() else r.window_start end returning count into n;
 return n<=p_limit;
 end $$;
create function public.record_product_event(p_kind text,p_key text) returns void language sql security invoker set search_path=public,pg_temp as $$
 insert into public.product_events(day,kind,key) values(current_date,p_kind,p_key) on conflict(day,kind,key) do update set count=product_events.count+1;
$$;
create function public.claim_endpoint_job() returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
 declare j public.endpoint_jobs; token uuid:=gen_random_uuid();
 begin
 insert into public.endpoint_jobs(endpoint_id) select e.id from public.source_endpoints e join public.sources s on s.id=e.source_id where e.status='active' and s.status='active' on conflict do nothing;
 select q.* into j from public.endpoint_jobs q join public.source_endpoints e on e.id=q.endpoint_id join public.sources s on s.id=e.source_id
 where e.status='active' and s.status='active' and q.due_at<=now() and (q.lease_until is null or q.lease_until<=now())
 order by q.due_at,q.endpoint_id for update of q skip locked limit 1;
 if not found then return null; end if;
 -- Child process has a hard 20-minute lifetime. Lease exceeds this by 25 minutes.
 update public.endpoint_jobs set lease_token=token,lease_until=now()+interval '45 minutes',attempts=case when attempts>=3 then 1 else attempts+1 end where endpoint_id=j.endpoint_id;
 return jsonb_build_object('endpoint_id',j.endpoint_id,'token',token);
 end $$;
create function public.finish_endpoint_job(p_endpoint uuid,p_token uuid,p_success boolean,p_error text) returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
 declare n integer;
 begin
 update public.endpoint_jobs j set due_at=now()+make_interval(secs=>case when p_success or j.attempts>=3 then greatest(e.poll_interval_seconds,60) else least(900,60*(2^j.attempts)::integer) end),
 lease_token=null,lease_until=null,last_finished_at=now(),last_success=p_success,last_error=left(p_error,500),attempts=case when p_success then 0 else j.attempts end
 from public.source_endpoints e where j.endpoint_id=p_endpoint and e.id=j.endpoint_id and j.lease_token=p_token and j.lease_until>now();
 get diagnostics n=row_count;
 return n=1;
 end $$;
create function public.product_snapshot(p_entities text[],p_year text) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 with selected_facts as (
 select f.* from public.facts f join public.entities e on e.id=f.subject_entity_id where e.key=any(p_entities) and f.reference_period=p_year
 ), selected_evidence as (select e.* from public.fact_evidence e join selected_facts f on f.id=e.fact_id),
 selected_versions as (select v.* from public.document_versions v where v.id in (select document_version_id from selected_evidence)),
 selected_documents as (select d.* from public.documents d where d.id in (select document_id from selected_versions)),
 checks as (
 select e.id as endpoint_id,e.last_successful_check_at as successful_at,c.checked_at,coalesce(r.status,'unknown') as status,
 coalesce(c.scope,'unknown') as scope,coalesce(c.complete,false) as complete,coalesce(c.pages,'[]') as pages,coalesce(c.reasons,'["coverage_unknown"]') as reasons,
 -- Successful discovery alone cannot support a negative result. Every observed version must have a completed current-ontology extraction and no unresolved decisions.
 (r.status='success' and c.reasons='[]'::jsonb and r.documents_discovered>0 and
 exists(select 1 from public.document_observations o where o.crawl_run_id=r.id) and
 not exists(select 1 from public.document_observations o where o.crawl_run_id=r.id and not exists(
 select 1 from public.extraction_attempts a where a.document_version_id=o.document_version_id and a.status='completed' and a.ontology_version='education-v3'
 and not exists(select 1 from public.candidate_validations v where v.attempt_id=a.id and v.decision->>'status'<>'verified')))) is true as extraction_complete
 from public.source_endpoints e
 left join lateral(select * from public.crawl_runs r where r.source_endpoint_id=e.id and r.status not in('running','queued') order by r.started_at desc limit 1) r on true
 left join public.source_coverage c on c.crawl_run_id=r.id
 )
 select jsonb_build_object(
 'sources',(select coalesce(jsonb_agg(s),'[]') from public.sources s),
 'hosts',(select coalesce(jsonb_agg(h),'[]') from public.allowed_hosts h),
 'endpoints',(select coalesce(jsonb_agg(e),'[]') from public.source_endpoints e),
 'entities',(select coalesce(jsonb_agg(e),'[]') from public.entities e),
 'topics',(select coalesce(jsonb_agg(t),'[]') from public.topics t),
 'rules',(select coalesce(jsonb_agg(r),'[]') from public.authority_rules r where subject_entity_id is null or subject_entity_id in(select id from public.entities where key=any(p_entities))),
 'facts',(select coalesce(jsonb_agg(f),'[]') from selected_facts f),
 'evidence',(select coalesce(jsonb_agg(e),'[]') from selected_evidence e),
 'versions',(select coalesce(jsonb_agg(v),'[]') from selected_versions v),
 'documents',(select coalesce(jsonb_agg(d),'[]') from selected_documents d),
 'checks',(select coalesce(jsonb_agg(c),'[]') from checks c),
 'history',(select coalesce(jsonb_agg(jsonb_build_object('fact_id',a.fact_id,'at',a.created_at,'action',a.action,'reason',a.reason)),'[]') from public.fact_review_actions a where a.fact_id in(select id from selected_facts))
 );
$$;
create function public.review_product_fact(p_id uuid,p_expected_updated_at timestamptz,p_action text,p_reason text,p_reviewer text) returns void language plpgsql security invoker set search_path=public,pg_temp as $$
 declare f public.facts;
 begin
 select * into strict f from public.facts where id=p_id for update;
 if f.updated_at is distinct from p_expected_updated_at then raise exception 'fact changed; reload before review'; end if;
 if p_action='publish' then
 if f.status<>'verified' then raise exception 'Only independently verified facts can be published'; end if;
 if exists(select 1 from public.fact_evidence ev join public.document_versions v on v.id=ev.document_version_id join public.documents d on d.id=v.document_id join public.source_endpoints e on e.id=d.source_endpoint_id
 where ev.fact_id=f.id and (e.status<>'active' or e.last_successful_check_at is null or e.last_successful_check_at<now()-make_interval(secs=>greatest(e.poll_interval_seconds*3,3600)) or d.latest_seen_at<now()-make_interval(secs=>greatest(e.poll_interval_seconds*3,3600)))) then raise exception 'Source is stale'; end if;
 update public.facts set status='published',published_at=now(),updated_at=now() where id=p_id;
 elsif p_action='review' and f.status in('verified','published','draft','needs_review') then update public.facts set status='needs_review',updated_at=now() where id=p_id;
 elsif p_action='reject' and f.status in('verified','published','draft','needs_review') then update public.facts set status='revoked',updated_at=now() where id=p_id;
 else raise exception 'Invalid review transition'; end if;
 insert into public.fact_review_actions(fact_id,action,reason,reviewer) values(p_id,p_action,p_reason,p_reviewer);
 end $$;
create function public.product_maintenance() returns void language plpgsql security invoker set search_path=public,pg_temp as $$
 begin
 delete from public.product_events where day<current_date-30;
 delete from public.request_limits where window_start<now()-interval '1 day';
 end $$;
-- Audited correction and ingestion history are preserved; only anonymous aggregates expire.
do $$ declare name text; begin
 foreach name in array array['query_aliases','fact_review_actions','endpoint_jobs','product_events','request_limits'] loop
 execute format('alter table public.%I enable row level security',name);
 execute format('revoke all on public.%I from anon,authenticated',name);
 execute format('grant select,insert,update on public.%I to service_role',name);
 end loop;
end $$;
revoke update on public.fact_review_actions from service_role;
grant delete on public.product_events,public.request_limits to service_role;
revoke all on function public.search_answer_resources(text),public.consume_product_limit(text,integer,integer),public.record_product_event(text,text),public.claim_endpoint_job(),public.finish_endpoint_job(uuid,uuid,boolean,text),public.product_snapshot(text[],text),public.review_product_fact(uuid,timestamptz,text,text,text),public.product_maintenance() from public,anon,authenticated;
grant execute on function public.search_answer_resources(text),public.consume_product_limit(text,integer,integer),public.record_product_event(text,text),public.claim_endpoint_job(),public.finish_endpoint_job(uuid,uuid,boolean,text),public.product_snapshot(text[],text),public.review_product_fact(uuid,timestamptz,text,text,text),public.product_maintenance() to service_role;
create function public.product_admin_snapshot(p_before timestamptz) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object(
 'jobs',(select coalesce(jsonb_agg(x),'[]') from (select * from public.endpoint_jobs order by due_at limit 100) x),
 'documents',(select coalesce(jsonb_agg(x),'[]') from (select id,title,canonical_url,current_version_id,latest_seen_at from public.documents where latest_seen_at<p_before order by latest_seen_at desc limit 50) x),
 'runs',(select coalesce(jsonb_agg(x),'[]') from (select * from public.crawl_runs where started_at<p_before order by started_at desc limit 50) x),
 'errors',(select coalesce(jsonb_agg(x),'[]') from (select * from public.crawl_errors where created_at<p_before order by created_at desc limit 50) x),
 'extractions',(select coalesce(jsonb_agg(x),'[]') from (select * from public.extraction_attempts where created_at<p_before order by created_at desc limit 50) x),
 'candidates',(select coalesce(jsonb_agg(x),'[]') from (select * from public.candidate_validations where created_at<p_before order by created_at desc limit 50) x),
 'facts',(select coalesce(jsonb_agg(x),'[]') from (select f.*,e.key as entity_key from public.facts f join public.entities e on e.id=f.subject_entity_id where f.updated_at<p_before order by f.updated_at desc limit 50) x),
 'feedback',(select coalesce(jsonb_agg(x),'[]') from (select * from public.product_events order by day desc,count desc limit 100) x)
 );
$$;
revoke all on function public.product_admin_snapshot(timestamptz) from public,anon,authenticated;
grant execute on function public.product_admin_snapshot(timestamptz) to service_role;
