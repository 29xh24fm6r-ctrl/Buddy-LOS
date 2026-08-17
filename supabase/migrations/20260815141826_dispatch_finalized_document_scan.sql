create function public.claim_document_scan_job_for_document(p_document_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_job public.document_scan_jobs%rowtype; v_document public.deal_documents%rowtype;
begin
  if (select auth.jwt()->>'role') is distinct from 'service_role' then raise exception using errcode='42501',message='Trusted scanner worker required.'; end if;
  select * into v_document from public.deal_documents d where d.id=p_document_id for update;
  if not found or v_document.security_status<>'quarantined' or v_document.sha256 is null then return null; end if;
  insert into public.document_scan_jobs (organization_id,document_id)
  values (v_document.organization_id,v_document.id)
  on conflict (document_id) do nothing;
  update public.document_scan_jobs set status='retryable',lease_expires_at=null,next_attempt_at=now(),last_error='Submission lease expired.',updated_at=now()
  where document_id=p_document_id and status='submitting' and lease_expires_at<=now() and attempt_count<max_attempts;
  update public.document_scan_jobs set status='failed',lease_expires_at=null,last_error='Submission attempts exhausted after lease expiry.',updated_at=now()
  where document_id=p_document_id and status='submitting' and lease_expires_at<=now() and attempt_count>=max_attempts;
  select * into v_job from public.document_scan_jobs j
  where j.document_id=p_document_id and j.status in ('queued','retryable') and j.next_attempt_at<=now() and j.attempt_count<j.max_attempts
  for update skip locked;
  if not found then return null; end if;
  update public.document_scan_jobs set status='submitting',attempt_count=attempt_count+1,lease_expires_at=now()+interval '2 minutes',last_error=null,updated_at=now()
  where id=v_job.id returning * into v_job;
  update public.deal_documents set security_status='scanning' where id=v_document.id;
  return jsonb_build_object('jobId',v_job.id,'organizationId',v_document.organization_id,'documentId',v_document.id,'bucket',v_document.storage_bucket,'path',v_document.storage_path,'mimeType',v_document.mime_type,'sizeBytes',v_document.size_bytes,'sha256',v_document.sha256,'attempt',v_job.attempt_count);
end; $$;
revoke all on function public.claim_document_scan_job_for_document(uuid) from public,anon,authenticated,service_role;
grant execute on function public.claim_document_scan_job_for_document(uuid) to service_role;
