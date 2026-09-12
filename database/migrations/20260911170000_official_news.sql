-- News statements are attributed quotations, scoped to one official document
-- version. They never satisfy date/status questions in the typed Answer Engine.
create table public.official_news_editions (
  version_id uuid primary key references public.document_versions(id),
  created_at timestamptz not null default now(),
  actions jsonb not null default '[]' check(jsonb_typeof(actions)='array')
);
create table public.official_news_facts (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.official_news_editions(version_id),
  ordinal integer not null check(ordinal between 0 and 3),
  predicate text not null default 'official_statement' check(predicate='official_statement'),
  quote text not null check(length(quote)>=35),
  character_start integer not null check(character_start>=0),
  character_end integer not null check(character_end>character_start),
  verified_at timestamptz not null default now(),
  unique(version_id,ordinal)
);
alter table public.official_news_editions enable row level security;
alter table public.official_news_facts enable row level security;
create trigger official_news_editions_immutable before update or delete on public.official_news_editions for each row execute function public.reject_history_mutation();
create trigger official_news_facts_immutable before update or delete on public.official_news_facts for each row execute function public.reject_history_mutation();

create function public.publish_official_news(p_version uuid,p_excerpts jsonb,p_actions jsonb)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare v public.document_versions; d public.documents; item jsonb; idx integer:=0;
begin
 select * into strict v from public.document_versions where id=p_version;
 select * into strict d from public.documents where id=v.document_id for share;
 if d.status<>'active' or d.current_version_id<>v.id or v.mime_type<>'text/html'
 or not public.trusted_source_url(d.canonical_url,d.source_id)
 or v.published_at>now() or v.fetched_at>now()
 or not exists(select 1 from public.source_endpoints e where e.id=d.source_endpoint_id and e.status='active')
 or v.metadata->'structure'->'warnings' is distinct from '[]'::jsonb
 or not exists(select 1 from public.source_responses r where r.document_version_id=v.id and r.source_id=d.source_id and r.status='parsed')
 then raise exception 'News requires current archived official evidence'; end if;
 if jsonb_typeof(p_excerpts) is distinct from 'array' or jsonb_array_length(p_excerpts) not between 1 and 4
 or jsonb_typeof(p_actions) is distinct from 'array' or jsonb_array_length(p_actions)>4
 then raise exception 'Invalid news structure'; end if;
 for item in select * from jsonb_array_elements(p_excerpts) loop
   if public.utf16_slice(v.raw_text,(item->>'start')::integer,(item->>'end')::integer) is distinct from item->>'text'
   or not exists(select 1 from jsonb_array_elements(v.metadata->'structure'->'blocks') b
     where b->>'kind' in ('paragraph','list_item') and (b->>'start')::integer<=(item->>'start')::integer and (b->>'end')::integer>=(item->>'end')::integer)
   then raise exception 'News statement evidence mismatch'; end if;
 end loop;
 for item in select * from jsonb_array_elements(p_actions) loop
   if not public.trusted_source_url(item->>'url',d.source_id)
   or not exists(select 1 from jsonb_array_elements(v.metadata->'official_links') link where link->>'url'=item->>'url')
   then raise exception 'News action is not an official document link'; end if;
 end loop;
 insert into public.official_news_editions(version_id,actions) values(v.id,p_actions) on conflict do nothing;
 if not found then return false; end if;
 for item in select * from jsonb_array_elements(p_excerpts) loop
   insert into public.official_news_facts(version_id,ordinal,quote,character_start,character_end)
   values(v.id,idx,item->>'text',(item->>'start')::integer,(item->>'end')::integer);
   idx:=idx+1;
 end loop;
 return true;
end $$;

-- Registered service links found in actual official announcement bodies.
insert into public.allowed_hosts(id,source_id,hostname,include_subdomains,status)
select h.id::uuid,h.source_id::uuid,h.hostname,h.include_subdomains,h.status from (values
('00000000-0000-4000-9000-000000000018','00000000-0000-4000-8000-000000000001','sonuc.osym.gov.tr',false,'active'),
('00000000-0000-4000-9000-000000000019','00000000-0000-4000-8000-000000000001','ais.osym.gov.tr',false,'active'),
('00000000-0000-4000-9000-000000000020','00000000-0000-4000-8000-000000000002','odsgm.meb.gov.tr',false,'active')) h(id,source_id,hostname,include_subdomains,status)
where exists(select 1 from public.sources s where s.id=h.source_id::uuid)
on conflict(source_id,hostname) do nothing;
