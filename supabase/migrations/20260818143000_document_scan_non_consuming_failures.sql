create or replace function public.record_document_scan_submission_failure_v2(
  p_job_id uuid,
  p_error text,
  p_retryable boolean,
  p_consumes_attempt boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.document_scan_jobs%rowtype;
  v_status public.document_scan_job_status;
  v_delay integer;
  v_attempt integer;
begin
  if (select auth.jwt() ->> 'role') is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'Trusted scanner worker required.';
  end if;

  select * into v_job
  from public.document_scan_jobs
  where id = p_job_id
  for update;

  if not found or v_job.status <> 'submitting' then
    raise exception using errcode = '55000', message = 'Scanner submission failure transition is closed.';
  end if;

  v_attempt := case
    when coalesce(p_consumes_attempt, true) then v_job.attempt_count
    else greatest(v_job.attempt_count - 1, 0)
  end;

  v_status := case
    when not coalesce(p_consumes_attempt, true) and coalesce(p_retryable, false) then 'retryable'::public.document_scan_job_status
    when coalesce(p_retryable, false) and v_attempt < v_job.max_attempts then 'retryable'::public.document_scan_job_status
    else 'failed'::public.document_scan_job_status
  end;

  v_delay := least(3600, 30 * power(2, greatest(0, v_attempt - 1))::integer);

  update public.document_scan_jobs
  set attempt_count = v_attempt,
      status = v_status,
      lease_expires_at = null,
      next_attempt_at = case
        when v_status = 'retryable' then now() + make_interval(secs => v_delay)
        else next_attempt_at
      end,
      last_error = left(coalesce(nullif(trim(p_error), ''), 'Scanner submission failed.'), 500),
      updated_at = now()
  where id = p_job_id;

  update public.deal_documents
  set security_status = 'quarantined'
  where id = v_job.document_id
    and organization_id = v_job.organization_id
    and security_status = 'scanning';

  return jsonb_build_object(
    'jobId', p_job_id,
    'status', v_status,
    'attemptCount', v_attempt,
    'attemptConsumed', coalesce(p_consumes_attempt, true),
    'retryAfterSeconds', case when v_status = 'retryable' then v_delay else null end
  );
end;
$$;

revoke all on function public.record_document_scan_submission_failure_v2(uuid, text, boolean, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.record_document_scan_submission_failure_v2(uuid, text, boolean, boolean)
  to service_role;

comment on function public.record_document_scan_submission_failure_v2(uuid, text, boolean, boolean)
is 'Records scanner dispatch failures without spending a retry for identity or configuration faults.';
