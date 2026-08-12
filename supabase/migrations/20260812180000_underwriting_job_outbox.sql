create type public.underwriting_job_status as enum ('queued', 'processing', 'needs_review', 'completed', 'failed', 'cancelled');
create type public.underwriting_outbox_status as enum ('pending', 'leased', 'dispatched', 'failed');

create table public.underwriting_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  deal_id uuid not null,
  requested_by uuid not null references auth.users(id) on delete restrict,
  contract_version text not null default 'buddy-underwriting.v1' check (contract_version = 'buddy-underwriting.v1'),
  status public.underwriting_job_status not null default 'queued',
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  correlation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  failure_code text,
  unique (id, organization_id),
  unique (organization_id, idempotency_key),
  foreign key (deal_id, organization_id) references public.deals(id, organization_id) on delete restrict
);

create table public.underwriting_job_documents (
  organization_id uuid not null,
  job_id uuid not null,
  document_id uuid not null,
  document_version_id uuid not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  media_type text not null,
  created_at timestamptz not null default now(),
  primary key (job_id, document_version_id),
  foreign key (job_id, organization_id) references public.underwriting_jobs(id, organization_id) on delete cascade,
  foreign key (document_id, organization_id) references public.deal_documents(id, organization_id) on delete restrict,
  check (document_id = document_version_id)
);

create table public.underwriting_outbox_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  job_id uuid not null,
  event_type text not null default 'underwriting.requested' check (event_type = 'underwriting.requested'),
  contract_version text not null default 'buddy-underwriting.v1' check (contract_version = 'buddy-underwriting.v1'),
  status public.underwriting_outbox_status not null default 'pending',
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  available_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, event_type),
  foreign key (job_id, organization_id) references public.underwriting_jobs(id, organization_id) on delete cascade
);

create index underwriting_jobs_deal_status_idx on public.underwriting_jobs (organization_id, deal_id, status, created_at desc);
create index underwriting_outbox_ready_idx on public.underwriting_outbox_events (available_at, created_at) where status = 'pending';
create index underwriting_outbox_lease_idx on public.underwriting_outbox_events (lease_expires_at) where status = 'leased';

alter table public.underwriting_jobs enable row level security;
alter table public.underwriting_job_documents enable row level security;
alter table public.underwriting_outbox_events enable row level security;
revoke all on public.underwriting_jobs, public.underwriting_job_documents, public.underwriting_outbox_events from public, anon, authenticated;
grant select on public.underwriting_jobs, public.underwriting_job_documents to authenticated;

create policy "underwriting_jobs_read_authorized" on public.underwriting_jobs for select to authenticated using (
  exists (
    select 1 from public.deals deal
    where deal.id = underwriting_jobs.deal_id
      and deal.organization_id = underwriting_jobs.organization_id
  )
);

create policy "underwriting_job_documents_read_authorized" on public.underwriting_job_documents for select to authenticated using (
  exists (
    select 1 from public.underwriting_jobs job
    where job.id = underwriting_job_documents.job_id
      and job.organization_id = underwriting_job_documents.organization_id
  )
);

create function public.request_underwriting_job(
  p_organization_id uuid,
  p_deal_id uuid,
  p_document_ids uuid[],
  p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_job public.underwriting_jobs%rowtype;
  v_document_count integer;
  v_requested_count integer;
  v_result jsonb;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'Authentication required.'; end if;
  if char_length(trim(coalesce(p_idempotency_key, ''))) not between 8 and 200 then
    raise exception using errcode = '22023', message = 'Valid underwriting idempotency key required.';
  end if;
  v_requested_count := coalesce(array_length(p_document_ids, 1), 0);
  if v_requested_count not between 1 and 100 or v_requested_count <> (select count(distinct value) from unnest(p_document_ids) value) then
    raise exception using errcode = '22023', message = 'One to one hundred unique document versions required.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text || ':' || trim(p_idempotency_key), 0));
  select * into v_job from public.underwriting_jobs job
  where job.organization_id = p_organization_id and job.idempotency_key = trim(p_idempotency_key);
  if found then
    select count(*) into v_document_count from public.underwriting_job_documents document
    where document.job_id = v_job.id and document.document_version_id = any(p_document_ids);
    if v_job.deal_id <> p_deal_id or v_job.requested_by <> v_actor or v_document_count <> v_requested_count then
      raise exception using errcode = '23505', message = 'Underwriting idempotency conflict.';
    end if;
    return jsonb_build_object('jobId', v_job.id, 'status', v_job.status, 'correlationId', v_job.correlation_id, 'replayed', true);
  end if;

  if not exists (
    select 1 from public.organization_product_modules module
    where module.organization_id = p_organization_id and module.module_key = 'underwriting'
      and module.status in ('active', 'trial') and module.starts_at <= now()
      and (module.ends_at is null or module.ends_at > now())
  ) then raise exception using errcode = '42501', message = 'Buddy Underwriter entitlement required.'; end if;

  if not exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = p_organization_id and membership.user_id = v_actor and membership.is_active
      and membership.role in ('owner', 'administrator', 'underwriter')
  ) then raise exception using errcode = '42501', message = 'Underwriting role required.'; end if;

  if not exists (
    select 1 from public.deals deal
    where deal.id = p_deal_id and deal.organization_id = p_organization_id and deal.archived_at is null
      and (
        exists (select 1 from public.organization_memberships membership where membership.organization_id = p_organization_id and membership.user_id = v_actor and membership.is_active and membership.role in ('owner', 'administrator'))
        or exists (select 1 from public.deal_assignments assignment where assignment.organization_id = p_organization_id and assignment.deal_id = p_deal_id and assignment.user_id = v_actor and assignment.ended_at is null)
      )
  ) then raise exception using errcode = '42501', message = 'Underwriting deal permission denied.'; end if;

  select count(*) into v_document_count from public.deal_documents document
  where document.id = any(p_document_ids) and document.organization_id = p_organization_id
    and document.deal_id = p_deal_id and document.security_status = 'clean'
    and document.sha256 is not null and document.deleted_at is null;
  if v_document_count <> v_requested_count then
    raise exception using errcode = '22023', message = 'Every underwriting document must be clean, current, and deal-bound.';
  end if;

  insert into public.underwriting_jobs (organization_id, deal_id, requested_by, idempotency_key)
  values (p_organization_id, p_deal_id, v_actor, trim(p_idempotency_key)) returning * into v_job;

  insert into public.underwriting_job_documents (organization_id, job_id, document_id, document_version_id, sha256, media_type)
  select document.organization_id, v_job.id, document.id, document.id, document.sha256, document.mime_type
  from public.deal_documents document where document.id = any(p_document_ids) and document.organization_id = p_organization_id;

  insert into public.underwriting_outbox_events (organization_id, job_id, payload)
  values (
    p_organization_id,
    v_job.id,
    jsonb_build_object(
      'contractVersion', v_job.contract_version,
      'jobId', v_job.id,
      'idempotencyKey', v_job.idempotency_key,
      'correlationId', v_job.correlation_id,
      'organizationId', v_job.organization_id,
      'dealId', v_job.deal_id,
      'requestedBy', v_job.requested_by,
      'requestedAt', v_job.created_at,
      'documents', (
        select jsonb_agg(jsonb_build_object('documentId', document.document_id, 'documentVersionId', document.document_version_id, 'sha256', document.sha256, 'mediaType', document.media_type) order by document.document_version_id)
        from public.underwriting_job_documents document where document.job_id = v_job.id
      )
    )
  );

  v_result := jsonb_build_object('jobId', v_job.id, 'status', v_job.status, 'correlationId', v_job.correlation_id);
  insert into public.audit_events (organization_id, actor_user_id, event_type, entity_type, entity_id, correlation_id, idempotency_key, source, payload)
  values (p_organization_id, v_actor, 'underwriting.requested', 'underwriting_job', v_job.id, v_job.correlation_id, 'underwriting-request:' || trim(p_idempotency_key), 'buddy-los', jsonb_build_object('dealId', p_deal_id, 'documentCount', v_requested_count, 'contractVersion', v_job.contract_version, 'result', v_result));
  return v_result || jsonb_build_object('replayed', false);
end; $$;

revoke all on function public.request_underwriting_job(uuid, uuid, uuid[], text) from public, anon, authenticated, service_role;
grant execute on function public.request_underwriting_job(uuid, uuid, uuid[], text) to authenticated;

comment on table public.underwriting_jobs is 'Tenant-bound Buddy Underwriter requests. Execution remains unavailable until a separately commissioned worker exists.';
comment on table public.underwriting_outbox_events is 'Durable private dispatch boundary. No claim or dispatch function exists in this default-off slice.';
