alter table public.deal_documents add column deleted_at timestamptz;

create type public.document_cleanup_status as enum ('pending','leased','completed','failed','cancelled');
create table public.document_cleanup_jobs (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, document_id uuid not null,
  status public.document_cleanup_status not null default 'pending', execution_after timestamptz not null,
  attempt_count integer not null default 0 check (attempt_count between 0 and 5), lease_expires_at timestamptz,
  last_error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz,
  unique (document_id), foreign key (document_id,organization_id) references public.deal_documents(id,organization_id) on delete restrict
);
create index document_cleanup_jobs_ready_idx on public.document_cleanup_jobs(execution_after,created_at) where status='pending';
create index document_cleanup_jobs_lease_idx on public.document_cleanup_jobs(lease_expires_at) where status='leased';
alter table public.document_cleanup_jobs enable row level security;
revoke all on public.document_cleanup_jobs from public,anon,authenticated;

create function public.govern_document_retention(
  p_organization_id uuid,p_document_id uuid,p_retained_until date,p_place_legal_hold boolean,p_reason text,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=(select auth.uid()); v_document public.deal_documents%rowtype; v_event public.audit_events%rowtype; v_result jsonb;
begin
  if v_actor is null then raise exception using errcode='42501',message='Authentication required.'; end if;
  if p_retained_until is null or p_retained_until<current_date or char_length(trim(coalesce(p_reason,''))) not between 3 and 500 or char_length(trim(coalesce(p_idempotency_key,''))) not between 8 and 200 then raise exception using errcode='22023',message='Valid retention instruction required.'; end if;
  if not exists(select 1 from public.organization_memberships m where m.organization_id=p_organization_id and m.user_id=v_actor and m.is_active and m.role in ('owner','administrator')) then raise exception using errcode='42501',message='Retention administrator required.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text||':'||trim(p_idempotency_key),0));
  select * into v_event from public.audit_events e where e.organization_id=p_organization_id and e.idempotency_key='document-retention:'||trim(p_idempotency_key);
  if found then
    if v_event.actor_user_id<>v_actor or v_event.entity_id<>p_document_id or v_event.payload->>'retainedUntil'<>p_retained_until::text or (v_event.payload->>'legalHold')::boolean is distinct from coalesce(p_place_legal_hold,false) or v_event.payload->>'reason'<>trim(p_reason) then raise exception using errcode='23505',message='Document retention idempotency conflict.'; end if;
    return (v_event.payload->'result')||jsonb_build_object('replayed',true);
  end if;
  select * into v_document from public.deal_documents d where d.id=p_document_id and d.organization_id=p_organization_id for update;
  if not found or v_document.deleted_at is not null then raise exception using errcode='22023',message='Active document not found.'; end if;
  if v_document.retained_until is not null and p_retained_until<v_document.retained_until then raise exception using errcode='22023',message='Document retention cannot be shortened.'; end if;
  update public.deal_documents set retained_until=p_retained_until,legal_hold=legal_hold or coalesce(p_place_legal_hold,false) where id=p_document_id;
  update public.document_cleanup_jobs set status='cancelled',lease_expires_at=null,last_error='Retention instruction changed before deletion.',updated_at=now() where document_id=p_document_id and status='pending';
  v_result:=jsonb_build_object('documentId',p_document_id,'retainedUntil',p_retained_until,'legalHold',v_document.legal_hold or coalesce(p_place_legal_hold,false));
  insert into public.audit_events(organization_id,actor_user_id,event_type,entity_type,entity_id,correlation_id,idempotency_key,source,payload)
  values(p_organization_id,v_actor,'document_retention.governed','deal_document',p_document_id,gen_random_uuid(),'document-retention:'||trim(p_idempotency_key),'buddy-los',jsonb_build_object('reason',trim(p_reason),'retainedUntil',p_retained_until,'legalHold',coalesce(p_place_legal_hold,false),'result',v_result));
  return v_result||jsonb_build_object('replayed',false);
end; $$;
revoke all on function public.govern_document_retention(uuid,uuid,date,boolean,text,text) from public,anon,authenticated,service_role;
grant execute on function public.govern_document_retention(uuid,uuid,date,boolean,text,text) to authenticated;

create function public.claim_document_cleanup_job() returns jsonb language plpgsql security definer set search_path='' as $$
declare v_job public.document_cleanup_jobs%rowtype; v_document public.deal_documents%rowtype;
begin
  if (select auth.jwt()->>'role') is distinct from 'service_role' then raise exception using errcode='42501',message='Trusted cleanup worker required.'; end if;
  insert into public.document_cleanup_jobs(organization_id,document_id,execution_after)
  select d.organization_id,d.id,now()+interval '24 hours' from public.deal_documents d
  where d.security_status in ('rejected','superseded') and d.retained_until is not null and d.retained_until<=current_date and not d.legal_hold and d.deleted_at is null
  on conflict(document_id) do update set status='pending',execution_after=excluded.execution_after,attempt_count=0,lease_expires_at=null,last_error=null,updated_at=now()
  where document_cleanup_jobs.status='cancelled';
  update public.document_cleanup_jobs set status='pending',lease_expires_at=null,execution_after=now()+interval '5 minutes',last_error='Cleanup lease expired.',updated_at=now()
  where status='leased' and lease_expires_at<=now() and attempt_count<5;
  update public.document_cleanup_jobs set status='failed',lease_expires_at=null,last_error='Cleanup attempts exhausted.',updated_at=now()
  where status='leased' and lease_expires_at<=now() and attempt_count>=5;
  select * into v_job from public.document_cleanup_jobs j where j.status='pending' and j.execution_after<=now() and j.attempt_count<5 order by j.execution_after,j.created_at limit 1 for update skip locked;
  if not found then return null; end if;
  select * into v_document from public.deal_documents d where d.id=v_job.document_id and d.organization_id=v_job.organization_id for update;
  if not found or v_document.deleted_at is not null or v_document.legal_hold or v_document.retained_until is null or v_document.retained_until>current_date or v_document.security_status not in ('rejected','superseded') then
    update public.document_cleanup_jobs set status='cancelled',last_error='Document is no longer eligible for cleanup.',updated_at=now() where id=v_job.id; return null;
  end if;
  update public.document_cleanup_jobs set status='leased',attempt_count=attempt_count+1,lease_expires_at=now()+interval '2 minutes',last_error=null,updated_at=now() where id=v_job.id returning * into v_job;
  return jsonb_build_object('jobId',v_job.id,'organizationId',v_document.organization_id,'documentId',v_document.id,'bucket',v_document.storage_bucket,'path',v_document.storage_path,'disposalPath','_disposal/'||v_document.organization_id::text||'/'||v_document.id::text||'/'||v_job.id::text,'sha256',v_document.sha256,'attempt',v_job.attempt_count);
end; $$;
revoke all on function public.claim_document_cleanup_job() from public,anon,authenticated,service_role;
grant execute on function public.claim_document_cleanup_job() to service_role;

create function public.record_document_cleanup_failure(p_job_id uuid,p_error text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_job public.document_cleanup_jobs%rowtype; v_status public.document_cleanup_status;
begin
  if (select auth.jwt()->>'role') is distinct from 'service_role' then raise exception using errcode='42501',message='Trusted cleanup worker required.'; end if;
  select * into v_job from public.document_cleanup_jobs where id=p_job_id for update;
  if not found or v_job.status<>'leased' then raise exception using errcode='55000',message='Cleanup failure transition is closed.'; end if;
  v_status:=case when v_job.attempt_count<5 then 'pending'::public.document_cleanup_status else 'failed'::public.document_cleanup_status end;
  update public.document_cleanup_jobs set status=v_status,lease_expires_at=null,execution_after=case when v_status='pending' then now()+make_interval(mins=>least(60,5*v_job.attempt_count)) else execution_after end,last_error=left(coalesce(nullif(trim(p_error),''),'Storage deletion failed.'),500),updated_at=now() where id=p_job_id;
  return jsonb_build_object('jobId',p_job_id,'status',v_status,'attempt',v_job.attempt_count);
end; $$;
revoke all on function public.record_document_cleanup_failure(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.record_document_cleanup_failure(uuid,text) to service_role;

create function public.record_document_cleanup_completed(p_job_id uuid,p_disposal_path text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_job public.document_cleanup_jobs%rowtype; v_document public.deal_documents%rowtype;
begin
  if (select auth.jwt()->>'role') is distinct from 'service_role' then raise exception using errcode='42501',message='Trusted cleanup worker required.'; end if;
  select * into v_job from public.document_cleanup_jobs where id=p_job_id for update;
  if not found or v_job.status<>'leased' or v_job.lease_expires_at<=now() then raise exception using errcode='55000',message='Cleanup completion lease is closed.'; end if;
  if p_disposal_path is distinct from '_disposal/'||v_job.organization_id::text||'/'||v_job.document_id::text||'/'||v_job.id::text then raise exception using errcode='22023',message='Invalid disposal path.'; end if;
  select * into v_document from public.deal_documents d where d.id=v_job.document_id and d.organization_id=v_job.organization_id for update;
  if not found or v_document.legal_hold or v_document.retained_until is null or v_document.retained_until>current_date then raise exception using errcode='55000',message='Document retention blocks cleanup completion.'; end if;
  update public.deal_documents set deleted_at=now(),security_status='superseded',storage_path=p_disposal_path where id=v_document.id;
  update public.document_cleanup_jobs set status='completed',lease_expires_at=null,completed_at=now(),updated_at=now() where id=v_job.id;
  insert into public.audit_events(organization_id,event_type,entity_type,entity_id,correlation_id,idempotency_key,source,payload)
  values(v_document.organization_id,'document_cleanup.completed','deal_document',v_document.id,gen_random_uuid(),'document-cleanup:'||v_job.id::text,'buddy-los-cleanup',jsonb_build_object('jobId',v_job.id,'dealId',v_document.deal_id,'sha256',v_document.sha256,'retainedUntil',v_document.retained_until,'originalStoragePath',v_document.storage_path,'disposalPath',p_disposal_path));
  return jsonb_build_object('jobId',v_job.id,'documentId',v_document.id,'status','completed');
end; $$;
revoke all on function public.record_document_cleanup_completed(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.record_document_cleanup_completed(uuid,text) to service_role;
