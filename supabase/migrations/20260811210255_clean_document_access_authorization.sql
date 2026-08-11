-- Authorizes a bounded access request for a clean immutable document version.
-- It intentionally does not create a Storage policy or a signed URL. A trusted
-- server may later exchange a successful authorization for a short-lived URL.

create table public.document_access_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  deal_id uuid not null,
  document_id uuid not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  access_kind text not null check (access_kind in ('download', 'preview')),
  reason text not null check (char_length(reason) between 3 and 500),
  requested_ttl_seconds integer not null check (requested_ttl_seconds between 30 and 300),
  document_sha256 text not null check (document_sha256 ~ '^[0-9a-f]{64}$'),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  correlation_id uuid not null,
  occurred_at timestamptz not null default now(),
  unique (organization_id, idempotency_key),
  foreign key (document_id, organization_id) references public.deal_documents(id, organization_id) on delete restrict,
  foreign key (deal_id, organization_id) references public.deals(id, organization_id) on delete restrict
);

create index document_access_events_document_idx
  on public.document_access_events (organization_id, document_id, occurred_at desc);

alter table public.document_access_events enable row level security;
revoke all on public.document_access_events from anon, authenticated;

create function public.authorize_clean_document_access(
  p_organization_id uuid,
  p_document_id uuid,
  p_access_kind text,
  p_requested_ttl_seconds integer,
  p_reason text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_document public.deal_documents%rowtype;
  v_existing public.document_access_events%rowtype;
  v_correlation_id uuid := gen_random_uuid();
  v_replayed boolean := false;
begin
  if v_actor_user_id is null then
    raise exception using errcode = '42501', message = 'Authenticated user required.';
  end if;
  if p_access_kind not in ('download', 'preview') then
    raise exception using errcode = '22023', message = 'Supported document access kind required.';
  end if;
  if p_requested_ttl_seconds not between 30 and 300 then
    raise exception using errcode = '22023', message = 'Document access TTL must be between 30 and 300 seconds.';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception using errcode = '22023', message = 'Document access reason required.';
  end if;
  if char_length(trim(coalesce(p_idempotency_key, ''))) not between 8 and 200 then
    raise exception using errcode = '22023', message = 'Valid idempotency key required.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':' || trim(p_idempotency_key), 0));
  select * into v_existing
  from public.document_access_events event
  where event.organization_id = p_organization_id
    and event.idempotency_key = trim(p_idempotency_key);

  if found then
    if v_existing.actor_user_id <> v_actor_user_id
      or v_existing.document_id <> p_document_id
      or v_existing.access_kind <> p_access_kind
      or v_existing.requested_ttl_seconds <> p_requested_ttl_seconds
      or v_existing.reason <> trim(p_reason) then
      raise exception using errcode = '23505', message = 'Document access idempotency conflict.';
    end if;
    v_replayed := true;
  end if;

  select document.* into v_document
  from public.deal_documents document
  join public.deals deal
    on deal.id = document.deal_id
    and deal.organization_id = document.organization_id
  where document.id = p_document_id
    and document.organization_id = p_organization_id
    and deal.archived_at is null;

  if not found then
    raise exception using errcode = '22023', message = 'Active deal document not found.';
  end if;
  if v_document.security_status <> 'clean'
    or v_document.sha256 is null
    or v_document.scanned_at is null then
    raise exception using errcode = '42501', message = 'Only scan-verified clean documents may be accessed.';
  end if;

  if not exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = p_organization_id
      and membership.user_id = v_actor_user_id
      and membership.is_active
      and (
        membership.role in ('owner', 'administrator', 'viewer')
        or exists (
          select 1
          from public.deal_assignments assignment
          where assignment.organization_id = p_organization_id
            and assignment.deal_id = v_document.deal_id
            and assignment.user_id = v_actor_user_id
            and assignment.ended_at is null
        )
      )
  ) then
    raise exception using errcode = '42501', message = 'Active deal assignment or elevated organization role required.';
  end if;

  if not v_replayed then
    insert into public.document_access_events (
      organization_id, deal_id, document_id, actor_user_id, access_kind, reason,
      requested_ttl_seconds, document_sha256, idempotency_key, correlation_id
    ) values (
      p_organization_id, v_document.deal_id, p_document_id, v_actor_user_id,
      p_access_kind, trim(p_reason), p_requested_ttl_seconds, v_document.sha256,
      trim(p_idempotency_key), v_correlation_id
    ) returning * into v_existing;

    insert into public.audit_events (
      organization_id, actor_user_id, event_type, entity_type, entity_id,
      correlation_id, idempotency_key, source, payload
    ) values (
      p_organization_id, v_actor_user_id, 'document_access.authorized',
      'deal_document', p_document_id, v_correlation_id,
      'document-access:' || trim(p_idempotency_key), 'buddy-los',
      jsonb_build_object(
        'authorizationId', v_existing.id,
        'dealId', v_document.deal_id,
        'accessKind', p_access_kind,
        'expiresAt', v_existing.occurred_at + make_interval(secs => p_requested_ttl_seconds),
        'sha256', v_document.sha256
      )
    );
  end if;

  return jsonb_build_object(
    'authorizationId', v_existing.id,
    'documentId', p_document_id,
    'bucket', v_document.storage_bucket,
    'path', v_document.storage_path,
    'expiresAt', v_existing.occurred_at + make_interval(secs => v_existing.requested_ttl_seconds),
    'sha256', v_document.sha256,
    'replayed', v_replayed
  );
end;
$$;

revoke all on function public.authorize_clean_document_access(uuid,uuid,text,integer,text,text)
  from public, anon, authenticated, service_role;

comment on function public.authorize_clean_document_access(uuid,uuid,text,integer,text,text)
  is 'Tenant and assignment checked clean-document authorization. Installed default-off and returns instructions, never a signed URL.';
