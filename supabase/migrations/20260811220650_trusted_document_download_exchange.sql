-- Commission the user-scoped authorization decision without granting direct
-- Storage access. Only a trusted server credential may record URL issuance.

grant execute on function public.authorize_clean_document_access(uuid,uuid,text,integer,text,text)
  to authenticated;

create function public.record_document_download_issued(
  p_authorization_id bigint,
  p_signed_ttl_seconds integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.document_access_events%rowtype;
begin
  if (select auth.jwt()->>'role') is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'Trusted document server required.';
  end if;
  if p_signed_ttl_seconds not between 1 and 300 then
    raise exception using errcode = '22023', message = 'Valid signed URL TTL required.';
  end if;

  select * into v_event
  from public.document_access_events event
  where event.id = p_authorization_id;

  if not found then
    raise exception using errcode = '22023', message = 'Document authorization not found.';
  end if;
  if v_event.access_kind <> 'download' then
    raise exception using errcode = '42501', message = 'Download authorization required.';
  end if;
  if now() + make_interval(secs => p_signed_ttl_seconds)
    > v_event.occurred_at + make_interval(secs => v_event.requested_ttl_seconds) then
    raise exception using errcode = '22023', message = 'Signed URL exceeds authorization lifetime.';
  end if;

  insert into public.audit_events (
    organization_id, actor_user_id, event_type, entity_type, entity_id,
    correlation_id, idempotency_key, source, payload
  ) values (
    v_event.organization_id, v_event.actor_user_id, 'document_access.url_issued',
    'deal_document', v_event.document_id, v_event.correlation_id,
    'document-url-issued:' || v_event.id::text, 'buddy-los-server',
    jsonb_build_object(
      'authorizationId', v_event.id,
      'dealId', v_event.deal_id,
      'signedTtlSeconds', p_signed_ttl_seconds,
      'sha256', v_event.document_sha256
    )
  ) on conflict (organization_id, idempotency_key) do nothing;

  return jsonb_build_object(
    'authorizationId', v_event.id,
    'documentId', v_event.document_id,
    'recorded', true
  );
end;
$$;

revoke all on function public.record_document_download_issued(bigint,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.record_document_download_issued(bigint,integer)
  to service_role;

comment on function public.record_document_download_issued(bigint,integer)
  is 'Records trusted-server signed URL issuance within the original authorization lifetime.';

-- Deliberately no storage.objects policy. The trusted server signs only after
-- the user-scoped authorization function succeeds.
