create function public.get_document_operations_health()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_scan jsonb; v_cleanup jsonb;
begin
  if (select auth.jwt()->>'role') is distinct from 'service_role' then
    raise exception using errcode='42501',message='Trusted document operations authority required.';
  end if;

  select jsonb_build_object(
    'counts',coalesce((select jsonb_object_agg(status,total) from (select status::text,count(*)::integer total from public.document_scan_jobs group by status) s),'{}'::jsonb),
    'readyNow',(select count(*)::integer from public.document_scan_jobs where status in ('queued','retryable') and next_attempt_at<=now()),
    'expiredLeases',(select count(*)::integer from public.document_scan_jobs where status='submitting' and lease_expires_at<=now()),
    'awaitingResultOver15Minutes',(select count(*)::integer from public.document_scan_jobs where status='awaiting_result' and updated_at<=now()-interval '15 minutes'),
    'oldestReadyAgeSeconds',coalesce((select greatest(0,extract(epoch from now()-min(next_attempt_at))::bigint) from public.document_scan_jobs where status in ('queued','retryable') and next_attempt_at<=now()),0)
  ) into v_scan;

  select jsonb_build_object(
    'counts',coalesce((select jsonb_object_agg(status,total) from (select status::text,count(*)::integer total from public.document_cleanup_jobs group by status) c),'{}'::jsonb),
    'readyNow',(select count(*)::integer from public.document_cleanup_jobs where status='pending' and execution_after<=now()),
    'expiredLeases',(select count(*)::integer from public.document_cleanup_jobs where status='leased' and lease_expires_at<=now()),
    'oldestReadyAgeSeconds',coalesce((select greatest(0,extract(epoch from now()-min(execution_after))::bigint) from public.document_cleanup_jobs where status='pending' and execution_after<=now()),0)
  ) into v_cleanup;

  return jsonb_build_object('schemaVersion','buddy-document-operations-health-v1','observedAt',now(),'scan',v_scan,'cleanup',v_cleanup);
end; $$;
revoke all on function public.get_document_operations_health() from public,anon,authenticated,service_role;
grant execute on function public.get_document_operations_health() to service_role;
