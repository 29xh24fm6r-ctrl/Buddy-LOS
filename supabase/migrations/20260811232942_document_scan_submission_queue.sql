create type public.document_scan_job_status as enum ('queued','submitting','retryable','awaiting_result','completed','failed');

create table public.document_scan_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  document_id uuid not null,
  status public.document_scan_job_status not null default 'queued',
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  max_attempts integer not null default 5 check (max_attempts between 1 and 5),
  next_attempt_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  provider text,
  provider_run_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id),
  unique (provider, provider_run_id),
  foreign key (document_id, organization_id) references public.deal_documents(id, organization_id) on delete restrict
);
create index document_scan_jobs_ready_idx on public.document_scan_jobs (next_attempt_at, created_at)
  where status in ('queued','retryable');
create index document_scan_jobs_expired_lease_idx on public.document_scan_jobs (lease_expires_at)
  where status = 'submitting';
alter table public.document_scan_jobs enable row level security;
revoke all on public.document_scan_jobs from public, anon, authenticated;

create function public.claim_document_scan_job()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_job public.document_scan_jobs%rowtype; v_document public.deal_documents%rowtype;
begin
  if (select auth.jwt()->>'role') is distinct from 'service_role' then raise exception using errcode='42501',message='Trusted scanner worker required.'; end if;
  insert into public.document_scan_jobs (organization_id,document_id)
  select d.organization_id,d.id from public.deal_documents d
  where d.security_status='quarantined' and d.sha256 is not null
  on conflict (document_id) do nothing;
  update public.document_scan_jobs set status='retryable',lease_expires_at=null,next_attempt_at=now(),last_error='Submission lease expired.',updated_at=now()
  where status='submitting' and lease_expires_at<=now() and attempt_count<max_attempts;
  update public.document_scan_jobs set status='failed',lease_expires_at=null,last_error='Submission attempts exhausted after lease expiry.',updated_at=now()
  where status='submitting' and lease_expires_at<=now() and attempt_count>=max_attempts;
  select * into v_job from public.document_scan_jobs j
  where j.status in ('queued','retryable') and j.next_attempt_at<=now() and j.attempt_count<j.max_attempts
  order by j.next_attempt_at,j.created_at limit 1 for update skip locked;
  if not found then return null; end if;
  update public.document_scan_jobs set status='submitting',attempt_count=attempt_count+1,lease_expires_at=now()+interval '2 minutes',last_error=null,updated_at=now()
  where id=v_job.id returning * into v_job;
  select * into v_document from public.deal_documents d where d.id=v_job.document_id and d.organization_id=v_job.organization_id for update;
  if not found or v_document.security_status<>'quarantined' or v_document.sha256 is null then
    update public.document_scan_jobs set status='failed',lease_expires_at=null,last_error='Document is not eligible for scanning.',updated_at=now() where id=v_job.id;
    return null;
  end if;
  update public.deal_documents set security_status='scanning' where id=v_document.id;
  return jsonb_build_object('jobId',v_job.id,'organizationId',v_document.organization_id,'documentId',v_document.id,'bucket',v_document.storage_bucket,'path',v_document.storage_path,'mimeType',v_document.mime_type,'sizeBytes',v_document.size_bytes,'sha256',v_document.sha256,'attempt',v_job.attempt_count);
end; $$;
revoke all on function public.claim_document_scan_job() from public,anon,authenticated,service_role;
grant execute on function public.claim_document_scan_job() to service_role;

create function public.record_document_scan_submission(p_job_id uuid,p_provider text,p_provider_run_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_job public.document_scan_jobs%rowtype;
begin
  if (select auth.jwt()->>'role') is distinct from 'service_role' then raise exception using errcode='42501',message='Trusted scanner worker required.'; end if;
  if char_length(trim(coalesce(p_provider,''))) not between 2 and 120 or char_length(trim(coalesce(p_provider_run_id,''))) not between 2 and 200 then raise exception using errcode='22023',message='Scanner submission identity required.'; end if;
  select * into v_job from public.document_scan_jobs where id=p_job_id for update;
  if not found or v_job.status<>'submitting' or v_job.lease_expires_at<=now() then raise exception using errcode='55000',message='Scanner submission lease is closed.'; end if;
  update public.document_scan_jobs set status='awaiting_result',provider=trim(p_provider),provider_run_id=trim(p_provider_run_id),lease_expires_at=null,updated_at=now() where id=p_job_id;
  return jsonb_build_object('jobId',p_job_id,'status','awaiting_result','provider',trim(p_provider),'providerRunId',trim(p_provider_run_id));
end; $$;
revoke all on function public.record_document_scan_submission(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.record_document_scan_submission(uuid,text,text) to service_role;

create function public.record_document_scan_submission_failure(p_job_id uuid,p_error text,p_retryable boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_job public.document_scan_jobs%rowtype; v_status public.document_scan_job_status; v_delay integer;
begin
  if (select auth.jwt()->>'role') is distinct from 'service_role' then raise exception using errcode='42501',message='Trusted scanner worker required.'; end if;
  select * into v_job from public.document_scan_jobs where id=p_job_id for update;
  if not found or v_job.status<>'submitting' then raise exception using errcode='55000',message='Scanner submission failure transition is closed.'; end if;
  v_status:=case when p_retryable and v_job.attempt_count<v_job.max_attempts then 'retryable'::public.document_scan_job_status else 'failed'::public.document_scan_job_status end;
  v_delay:=least(3600,30*power(2,greatest(0,v_job.attempt_count-1))::integer);
  update public.document_scan_jobs set status=v_status,lease_expires_at=null,next_attempt_at=case when v_status='retryable' then now()+make_interval(secs=>v_delay) else next_attempt_at end,last_error=left(coalesce(nullif(trim(p_error),''),'Scanner submission failed.'),500),updated_at=now() where id=p_job_id;
  update public.deal_documents set security_status='quarantined' where id=v_job.document_id and organization_id=v_job.organization_id and security_status='scanning';
  return jsonb_build_object('jobId',p_job_id,'status',v_status,'attempt',v_job.attempt_count,'retryAfterSeconds',case when v_status='retryable' then v_delay else null end);
end; $$;
revoke all on function public.record_document_scan_submission_failure(uuid,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.record_document_scan_submission_failure(uuid,text,boolean) to service_role;

create function public.record_document_scan_result_v2(
  p_organization_id uuid,p_document_id uuid,p_scanner_provider text,p_scanner_run_id text,
  p_result public.document_security_status,p_sha256 text,p_engine_version text,p_signature_version text,p_detail jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_job public.document_scan_jobs%rowtype; v_result jsonb;
begin
  if (select auth.jwt()->>'role') is distinct from 'service_role' then raise exception using errcode='42501',message='Trusted scanner authority required.'; end if;
  select * into v_job from public.document_scan_jobs j where j.organization_id=p_organization_id and j.document_id=p_document_id for update;
  if not found or v_job.provider is distinct from trim(p_scanner_provider) or v_job.provider_run_id is distinct from trim(p_scanner_run_id) or v_job.status not in ('awaiting_result','completed') then raise exception using errcode='55000',message='Scanner callback does not match an accepted submission.'; end if;
  v_result:=public.record_document_scan_result(p_organization_id,p_document_id,p_scanner_provider,p_scanner_run_id,p_result,p_sha256,p_engine_version,p_signature_version,p_detail);
  update public.document_scan_jobs set status='completed',lease_expires_at=null,last_error=null,updated_at=now() where id=v_job.id;
  return v_result || jsonb_build_object('jobId',v_job.id);
end; $$;
revoke all on function public.record_document_scan_result_v2(uuid,uuid,text,text,public.document_security_status,text,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.record_document_scan_result_v2(uuid,uuid,text,text,public.document_security_status,text,text,text,jsonb) to service_role;
revoke execute on function public.record_document_scan_result(uuid,uuid,text,text,public.document_security_status,text,text,text,jsonb) from service_role;
