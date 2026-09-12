-- On fresh installs the following registry rows are supplied by seed.sql.
do $$ begin
if exists(select 1 from public.sources where id='00000000-0000-4000-8000-000000000001') then
-- ÖSYM links the placement statistics attachment from its own cdn host. The
-- YKS group archive keeps result announcements discoverable after they leave
-- the general rolling list.
insert into public.allowed_hosts(id,source_id,hostname,include_subdomains,status,created_at)
values('00000000-0000-4000-9000-000000000017','00000000-0000-4000-8000-000000000001','cdn.osym.gov.tr',false,'active','2026-09-11T13:30:00Z')
on conflict(source_id,hostname) do update set status=excluded.status;

insert into public.source_endpoints(id,source_id,slug,name,base_url,endpoint_type,status,poll_interval_seconds,created_at,updated_at)
values('00000000-0000-4000-a000-000000000007','00000000-0000-4000-8000-000000000001','yks-announcements','ÖSYM YKS resmî duyuru arşivi','https://www.osym.gov.tr/SinavGrubu/Menu/314','html_listing','active',3600,'2026-09-11T13:30:00Z','2026-09-11T13:30:00Z')
on conflict(source_id,slug) do update set
  name=excluded.name,
  base_url=excluded.base_url,
  endpoint_type=excluded.endpoint_type,
  status=excluded.status,
  poll_interval_seconds=excluded.poll_interval_seconds,
  updated_at=excluded.updated_at;

end if;
end $$;
