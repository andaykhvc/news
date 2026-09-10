-- Require audited grounding even after human conflict resolution. Keep inactive history out of evidence payloads.
create or replace function public.product_snapshot(p_entities text[],p_year text) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 with selected_facts as (
 select f.* from public.facts f join public.entities e on e.id=f.subject_entity_id where e.key=any(p_entities) and f.reference_period=p_year
 ), selected_evidence as (select e.* from public.fact_evidence e join selected_facts f on f.id=e.fact_id where f.status in ('published','verified','needs_review')),
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
 'validations',(select coalesce(jsonb_agg(jsonb_build_object('fact_id',cv.fact_id,'version_id',a.document_version_id,'candidate',cv.candidate,'decision',cv.decision)),'[]') from public.candidate_validations cv join public.extraction_attempts a on a.id=cv.attempt_id where cv.fact_id in(select id from selected_facts)),
 'history',(select coalesce(jsonb_agg(jsonb_build_object('fact_id',a.fact_id,'at',a.created_at,'action',a.action,'reason',a.reason)),'[]') from public.fact_review_actions a where a.fact_id in(select id from selected_facts))
 );
$$;

create or replace function public.review_product_fact(p_id uuid,p_expected_updated_at timestamptz,p_action text,p_reason text,p_reviewer text) returns void language plpgsql security invoker set search_path=public,pg_temp as $$
 declare f public.facts;
 begin
 select * into strict f from public.facts where id=p_id for update;
 if f.updated_at is distinct from p_expected_updated_at then raise exception 'fact changed; reload before review'; end if;
 if p_action='publish' then
 if f.status<>'verified' then raise exception 'Only independently verified facts can be published'; end if;
 if not exists(select 1 from public.candidate_validations cv join public.entities en on en.key=cv.candidate->>'entity_key' join public.topics t on t.key=cv.candidate->>'topic_key'
 where cv.fact_id=f.id and en.id=f.subject_entity_id and t.id=f.topic_id and cv.candidate->>'predicate'=f.predicate and cv.candidate->>'reference_period'=f.reference_period and cv.candidate->'value'=f.value
 and (cv.decision->>'status'='verified' or (cv.decision->>'status'='needs_review' and cv.decision->'reasons'='["conflicting_authoritative_claims"]'::jsonb))) then raise exception 'Publication requires a matching grounded candidate audit'; end if;
 if exists(select 1 from public.fact_evidence ev join public.document_versions v on v.id=ev.document_version_id join public.documents d on d.id=v.document_id join public.source_endpoints e on e.id=d.source_endpoint_id
 where ev.fact_id=f.id and (e.status<>'active' or e.last_successful_check_at is null or e.last_successful_check_at<now()-make_interval(secs=>greatest(e.poll_interval_seconds*3,3600)) or not exists(select 1 from public.crawl_runs r join public.source_coverage c on c.crawl_run_id=r.id where r.id=(select rr.id from public.crawl_runs rr where rr.source_endpoint_id=e.id and rr.status not in('running','queued') order by rr.started_at desc limit 1) and r.status='success' and not exists(select 1 from jsonb_array_elements_text(c.reasons) reason where reason not in('document_limit','bounded_or_incomplete_discovery'))) or d.latest_seen_at<now()-make_interval(secs=>greatest(e.poll_interval_seconds*3,3600)))) then raise exception 'Source is stale'; end if;
 update public.facts set status='published',published_at=now(),updated_at=now() where id=p_id;
 elsif p_action='review' and f.status in('verified','published','draft','needs_review') then update public.facts set status='needs_review',updated_at=now() where id=p_id;
 elsif p_action='reject' and f.status in('verified','published','draft','needs_review') then update public.facts set status='revoked',updated_at=now() where id=p_id;
 else raise exception 'Invalid review transition'; end if;
 insert into public.fact_review_actions(fact_id,action,reason,reviewer) values(p_id,p_action,p_reason,p_reviewer);
 end $$;
