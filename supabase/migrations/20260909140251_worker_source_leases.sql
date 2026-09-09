-- Serialize endpoint jobs per institution, including concurrent claim transactions.
create or replace function public.claim_endpoint_job() returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
 declare j public.endpoint_jobs; token uuid:=gen_random_uuid();
 begin
 insert into public.endpoint_jobs(endpoint_id) select e.id from public.source_endpoints e join public.sources s on s.id=e.source_id where e.status='active' and s.status='active' on conflict do nothing;
 select q.* into j from public.endpoint_jobs q join public.source_endpoints e on e.id=q.endpoint_id join public.sources s on s.id=e.source_id
 where e.status='active' and s.status='active' and q.due_at<=now() and (q.lease_until is null or q.lease_until<=now())
 and not exists(select 1 from public.endpoint_jobs busy join public.source_endpoints be on be.id=busy.endpoint_id where be.source_id=e.source_id and busy.lease_until>now())
 order by q.due_at,q.endpoint_id for update of q,s skip locked limit 1;
 if not found then return null; end if;
 -- Child process has a hard 20-minute lifetime. Lease exceeds this by 25 minutes.
 update public.endpoint_jobs set lease_token=token,lease_until=now()+interval '45 minutes',attempts=case when attempts>=3 then 1 else attempts+1 end where endpoint_id=j.endpoint_id;
 return jsonb_build_object('endpoint_id',j.endpoint_id,'token',token);
 end $$;
