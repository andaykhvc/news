-- Independent open-web research pipeline. No facts/answers/news publication writes.
create table public.intelligence_sources (
 id text primary key, config jsonb not null check(jsonb_typeof(config)='object'),
 status text not null check(status in('active','candidate','disabled')),
 due_at timestamptz not null default now(),lease_token uuid,lease_until timestamptz,
 attempts integer not null default 0,last_successful_check_at timestamptz,last_error text,
 last_stats jsonb not null default '{}',updated_at timestamptz not null default now()
);
create index intelligence_sources_due_idx on public.intelligence_sources(due_at) where status='active';
create table public.intelligence_source_candidates (
 url text primary key, discovered_from text not null,reason text not null,first_seen_at timestamptz not null default now()
);
create table public.intelligence_http_cache (
 source_id text not null references public.intelligence_sources(id),url text not null,
 response jsonb not null check(octet_length(response::text)<=6000000),primary key(source_id,url)
);
create table public.intelligence_reports (
 id text primary key check(length(id)=64),report_key text not null check(length(report_key)=64),
 source_id text not null references public.intelligence_sources(id),canonical_url text not null,
 content_hash text not null check(length(content_hash)=64),published_at timestamptz,discovered_at timestamptz not null,
 official_version_id uuid references public.document_versions(id), report jsonb not null check(octet_length(report::text)<=1000000),
 unique(source_id,canonical_url,content_hash)
);
create index intelligence_reports_key_idx on public.intelligence_reports(report_key);
create index intelligence_reports_time_idx on public.intelligence_reports(discovered_at,id);
create index intelligence_reports_official_idx on public.intelligence_reports(official_version_id) where official_version_id is not null;
create table public.intelligence_namespaces (name text primary key,revision bigint not null default 0,created_at timestamptz not null default now());
insert into public.intelligence_namespaces(name) values('live');
create table public.intelligence_events (
 namespace text not null references public.intelligence_namespaces(name),id text not null,
 kind text not null,created_at timestamptz not null,updated_at timestamptz not null,
 range_start timestamptz not null,range_end timestamptz not null,snapshot jsonb not null,primary key(namespace,id)
);
create index intelligence_events_range_idx on public.intelligence_events(namespace,range_start,range_end);
create index intelligence_events_updated_idx on public.intelligence_events(namespace,updated_at);
create table public.intelligence_event_reports (
 namespace text not null,event_id text not null,report_id text not null references public.intelligence_reports(id),
 primary key(namespace,report_id),foreign key(namespace,event_id) references public.intelligence_events(namespace,id)
);
create index intelligence_event_reports_event_idx on public.intelligence_event_reports(namespace,event_id);
create index intelligence_event_reports_report_idx on public.intelligence_event_reports(report_id);
create table public.intelligence_claims (
 namespace text not null,id text not null,event_id text not null,predicate text not null,scope text not null,value jsonb not null,
 status text not null check(status in('supported','weakly_supported','conflicting','superseded')),
 primary key(namespace,id),foreign key(namespace,event_id) references public.intelligence_events(namespace,id)
);
create index intelligence_claims_event_idx on public.intelligence_claims(namespace,event_id);
create table public.intelligence_evidence (
 namespace text not null,claim_id text not null,report_id text not null references public.intelligence_reports(id),
 start_offset integer not null,end_offset integer not null,quote text not null,
 primary key(namespace,claim_id,report_id,start_offset),foreign key(namespace,claim_id) references public.intelligence_claims(namespace,id)
);
create index intelligence_evidence_report_idx on public.intelligence_evidence(report_id);
create table public.intelligence_updates (
 namespace text not null,id text not null,event_id text not null,report_id text not null references public.intelligence_reports(id),
 at timestamptz not null,update jsonb not null,claims jsonb not null,signals jsonb not null,
 primary key(namespace,id),foreign key(namespace,event_id) references public.intelligence_events(namespace,id)
);
create index intelligence_updates_event_idx on public.intelligence_updates(namespace,event_id,at);
create index intelligence_updates_report_idx on public.intelligence_updates(report_id);
create table public.intelligence_attempts (
 id uuid primary key default gen_random_uuid(),namespace text not null references public.intelligence_namespaces(name),
 report_id text references public.intelligence_reports(id),source_id text references public.intelligence_sources(id),
 at timestamptz not null default now(),status text not null,details jsonb not null
);
create index intelligence_attempts_report_idx on public.intelligence_attempts(namespace,report_id,at);
create index intelligence_attempts_source_idx on public.intelligence_attempts(source_id,at);

do $$ declare t text; begin
 foreach t in array array['intelligence_sources','intelligence_source_candidates','intelligence_http_cache','intelligence_reports','intelligence_namespaces','intelligence_events','intelligence_event_reports','intelligence_claims','intelligence_evidence','intelligence_updates','intelligence_attempts'] loop
 execute format('alter table public.%I enable row level security',t);
 end loop;
 foreach t in array array['intelligence_reports','intelligence_evidence','intelligence_updates','intelligence_attempts','intelligence_event_reports'] loop
 execute format('create trigger %I before update or delete on public.%I for each row execute function public.reject_history_mutation()',t||'_immutable',t);
 end loop;
end $$;

create function public.intelligence_claim_source() returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare s public.intelligence_sources; token uuid:=gen_random_uuid();begin
 -- Tiny scheduling lock also prevents two differently named sources sharing a host.
 perform pg_advisory_xact_lock(9131200);
 select * into s from public.intelligence_sources candidate where status='active' and jsonb_array_length(config->'discovery')>0 and due_at<=now()
 and (lease_until is null or lease_until<now())
 and not exists(select 1 from public.intelligence_sources active where active.lease_until>now()
 and exists(select 1 from jsonb_array_elements_text(active.config->'hosts') h where candidate.config->'hosts' ? h))
 order by due_at,id for update skip locked limit 1;
 if not found then return null;end if;
 update public.intelligence_sources set lease_token=token,lease_until=now()+interval '15 minutes' where id=s.id;
 return jsonb_build_object('sourceId',s.id,'token',token);
end $$;
create function public.intelligence_finish_source(p_source text,p_token uuid,p_success boolean,p_stats jsonb,p_error text) returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 update public.intelligence_sources set lease_token=null,lease_until=null,
 due_at=now()+make_interval(secs=>case when p_success then greatest(300,(config->>'intervalSeconds')::integer) else least(3600,60*power(2,least(attempts+1,6)))::integer end),
 attempts=case when p_success then 0 else attempts+1 end,last_stats=last_stats||p_stats,last_error=left(p_error,500),
 last_successful_check_at=case when p_success then now() else last_successful_check_at end,updated_at=now()
 where id=p_source and lease_token=p_token and lease_until>now();return found;
end $$;

create function public.intelligence_store_report(p jsonb) returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare cfg jsonb;official uuid:=(p->>'officialVersionId')::uuid;begin
 select config into strict cfg from public.intelligence_sources where id=p->>'sourceId' and status='active';
 if p->>'canonicalUrl' !~ '^https://' or not exists(select 1 from jsonb_array_elements_text(cfg->'hosts') host where split_part(split_part(p->>'canonicalUrl','://',2),'/',1)=host)
 then raise exception 'Report URL outside source policy';end if;
 if official is not null and not exists(select 1 from public.document_versions v join public.documents d on d.id=v.document_id
 where v.id=official and d.current_version_id=v.id and d.canonical_url=p->>'canonicalUrl' and v.raw_text=p->>'text'
 and public.trusted_source_url(d.canonical_url,d.source_id) and exists(select 1 from public.source_responses r where r.document_version_id=v.id and r.status='parsed'))
 then raise exception 'Official bridge evidence invalid';end if;
 insert into public.intelligence_reports(id,report_key,source_id,canonical_url,content_hash,published_at,discovered_at,official_version_id,report)
 values(p->>'id',p->>'key',p->>'sourceId',p->>'canonicalUrl',p->>'contentHash',(p->>'publishedAt')::timestamptz,(p->>'discoveredAt')::timestamptz,official,p) on conflict do nothing;
 return found;
end $$;

create function public.intelligence_save_event(p_namespace text,p_revision bigint,p_report text,p_event jsonb) returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare current_revision bigint; c jsonb;e jsonb;r jsonb;u jsonb;original jsonb;prior jsonb;begin
 select n.revision into strict current_revision from public.intelligence_namespaces n where name=p_namespace for update;
 if current_revision<>p_revision then return false;end if;
 if exists(select 1 from public.intelligence_event_reports where namespace=p_namespace and report_id=p_report) then return true;end if;
 if not exists(select 1 from jsonb_array_elements(p_event->'reports') x where x->>'id'=p_report) then raise exception 'Processed report missing from event';end if;
 select snapshot into prior from public.intelligence_events where namespace=p_namespace and id=p_event->>'id';
 if prior is not null and (not ((p_event->'reports') @> (prior->'reports')) or not ((p_event->'timeline') @> (prior->'timeline')) or p_event->>'kind' is distinct from prior->>'kind' or p_event->>'createdAt' is distinct from prior->>'createdAt') then raise exception 'Event history cannot be removed or changed';end if;
 for r in select * from jsonb_array_elements(p_event->'reports') loop
  select report into strict original from public.intelligence_reports where id=r->>'id';
  if original->>'key' is distinct from r->>'key' or original->>'sourceId' is distinct from r->>'sourceId' or original->>'officialVersionId' is distinct from r->>'officialVersionId' or (original-'text'-'metadata') is distinct from (r-'analysis'-'tokens'-'bodyTokens'-'method')
  then raise exception 'Event report identity mismatch';end if;
  if exists(select 1 from public.intelligence_event_reports where namespace=p_namespace and report_id=r->>'id' and event_id<>p_event->>'id') then raise exception 'Report already belongs to another event';end if;
 end loop;
 for c in select * from jsonb_array_elements(p_event->'claims') loop
  for e in select * from jsonb_array_elements(c->'evidence') loop
   select report into strict original from public.intelligence_reports where id=e->>'reportId';
   if not exists(select 1 from jsonb_array_elements(p_event->'reports') x where x->>'id'=e->>'reportId') or original->>'officialVersionId' is distinct from e->>'officialVersionId' then raise exception 'Evidence report identity mismatch';end if;
   if public.utf16_slice(original->>'text',(e->>'start')::integer,(e->>'end')::integer) is distinct from e->>'quote'
   then raise exception 'Claim evidence mismatch';end if;
  end loop;
 end loop;
 insert into public.intelligence_events(namespace,id,kind,created_at,updated_at,range_start,range_end,snapshot)
 values(p_namespace,p_event->>'id',p_event->>'kind',(p_event->>'createdAt')::timestamptz,(p_event->>'updatedAt')::timestamptz,
 (select min(coalesce(x->'analysis'->>'occurredAt',x->>'publishedAt',x->>'discoveredAt')::timestamptz) from jsonb_array_elements(p_event->'reports') x),
 (select max(coalesce(x->'analysis'->>'occurredAt',x->>'publishedAt',x->>'discoveredAt')::timestamptz) from jsonb_array_elements(p_event->'reports') x),p_event)
 on conflict(namespace,id) do update set updated_at=excluded.updated_at,range_start=excluded.range_start,range_end=excluded.range_end,snapshot=excluded.snapshot;
 for r in select * from jsonb_array_elements(p_event->'reports') loop
 insert into public.intelligence_event_reports values(p_namespace,p_event->>'id',r->>'id') on conflict do nothing;
 end loop;
 for c in select * from jsonb_array_elements(p_event->'claims') loop
 insert into public.intelligence_claims values(p_namespace,c->>'id',p_event->>'id',c->>'predicate',c->>'scope',c->'value',c->>'status')
 on conflict(namespace,id) do update set status=excluded.status;
 for e in select * from jsonb_array_elements(c->'evidence') loop
 insert into public.intelligence_evidence values(p_namespace,c->>'id',e->>'reportId',(e->>'start')::integer,(e->>'end')::integer,e->>'quote') on conflict do nothing;
 end loop;end loop;
 u=p_event->'timeline'->-1;
 if u->>'reportId' is distinct from p_report then raise exception 'Update report mismatch';end if;
 insert into public.intelligence_updates values(p_namespace,u->>'id',p_event->>'id',p_report,(u->>'at')::timestamptz,u,p_event->'claims',p_event->'signals');
 update public.intelligence_namespaces set revision=current_revision+1 where name=p_namespace;
 return true;
end $$;
