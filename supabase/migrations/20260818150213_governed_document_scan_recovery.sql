create or replace function public.requeue_failed_document_scan_job(
  p_organization_id uuid,
  p_document_id uuid,
  p_actor_user_id uuid,
  p_reason text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.document_scan_jobs%rowtype;
  v_existing jsonb;
  v_result jsonb;
begin
  if coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Trusted document scan recovery required.';
  end if;
  if length(trim(coalesce(p_reason, ''))) not between 3 and 500
     or length(trim(coalesce(p_idempotency_key, ''))) not between 8 and 160 then
    raise exception using errcode = '22023', message = 'Invalid document scan recovery command.';
  end if;
  if not exists (
    select 1 from public.organization_memberships m
    where m.organization_id = p_organization_id and m.user_id = p_actor_user_id
      and m.is_active and m.role in ('owner', 'administrator')
  ) then
    raise exception using errcode = '42501', message = 'Document scan recovery administrator required.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_organization_id::text || ':' || p_document_id::text || ':' || trim(p_idempotency_key), 0)
  );
  select e.payload -> 'result' into v_existing
  from public.audit_events e
  where e.organization_id = p_organization_id
    and e.idempotency_key = 'document-scan-requeue:' || trim(p_idempotency_key);
  if v_existing is not null then
    return v_existing || jsonb_build_object('replayed', true);
  end if;

  select j.* into v_job
  from public.document_scan_jobs j
  join public.deal_documents d on d.id = j.document_id and d.organization_id = j.organization_id
  where j.organization_id = p_organization_id and j.document_id = p_document_id
    and d.security_status = 'quarantined' and d.sha256 is not null
  for update of j;
  if v_job.id is null then
    raise exception using errcode = 'P0002', message = 'Recoverable document scan job not found.';
  end if;
  if v_job.status <> 'failed' or v_job.attempt_count >= v_job.max_attempts then
    raise exception using errcode = '23514', message = 'Document scan job is not recoverable.';
  end if;

  update public.document_scan_jobs
  set status = 'retryable', next_attempt_at = now(), lease_expires_at = null,
      provider = null, provider_run_id = null, last_error = null, updated_at = now()
  where id = v_job.id;

  v_result := jsonb_build_object(
    'jobId', v_job.id, 'documentId', p_document_id, 'status', 'retryable',
    'priorAttemptCount', v_job.attempt_count, 'maxAttempts', v_job.max_attempts,
    'replayed', false
  );
  insert into public.audit_events(
    organization_id, actor_user_id, event_type, entity_type, entity_id,
    correlation_id, idempotency_key, source, payload
  ) values (
    p_organization_id, p_actor_user_id, 'document_scan.requeued', 'document_scan_job', v_job.id,
    gen_random_uuid(), 'document-scan-requeue:' || trim(p_idempotency_key), 'buddy-los',
    jsonb_build_object(
      'reason', trim(p_reason),
      'priorFailureCategory', case
        when lower(coalesce(v_job.last_error, '')) like '%401%'
          or lower(coalesce(v_job.last_error, '')) like '%unauthorized%' then 'authentication_rejected'
        when lower(coalesce(v_job.last_error, '')) like '%timeout%' then 'timeout'
        when lower(coalesce(v_job.last_error, '')) like '%stored document%' then 'stored_document_verification'
        else 'submission_failed'
      end,
      'result', v_result
    )
  );
  return v_result;
end;
$$;

revoke all on function public.requeue_failed_document_scan_job(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.requeue_failed_document_scan_job(uuid, uuid, uuid, text, text) to service_role;

comment on function public.requeue_failed_document_scan_job(uuid, uuid, uuid, text, text) is
  'Audited, idempotent owner/admin recovery of a terminal failed quarantined document scan. Attempts are preserved.';
