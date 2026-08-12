create function public.claim_underwriting_outbox_event()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_event public.underwriting_outbox_events%rowtype; v_job public.underwriting_jobs%rowtype; v_documents jsonb;
begin
  if (select auth.jwt()->>'role') is distinct from 'service_role' then raise exception using errcode='42501',message='Trusted underwriting worker required.'; end if;
  update public.underwriting_outbox_events set status='pending',lease_expires_at=null,available_at=now()+interval '1 minute',last_error='Worker lease expired.',updated_at=now()
  where status='leased' and lease_expires_at<=now() and attempt_count<5;
  update public.underwriting_outbox_events set status='failed',lease_expires_at=null,last_error='Underwriting attempts exhausted.',updated_at=now()
  where status='leased' and lease_expires_at<=now() and attempt_count>=5;
  update public.underwriting_jobs job set status='failed',failure_code='attempts_exhausted',updated_at=now()
  where exists(select 1 from public.underwriting_outbox_events event where event.job_id=job.id and event.status='failed') and job.status in ('queued','processing');
  select * into v_event from public.underwriting_outbox_events event where event.status='pending' and event.available_at<=now() and event.attempt_count<5
  order by event.available_at,event.created_at limit 1 for update skip locked;
  if not found then return null; end if;
  select * into v_job from public.underwriting_jobs where id=v_event.job_id and organization_id=v_event.organization_id for update;
  if not found or v_job.status not in ('queued','processing') then
    update public.underwriting_outbox_events set status='failed',last_error='Underwriting job is not executable.',updated_at=now() where id=v_event.id;
    return null;
  end if;
  select jsonb_agg(jsonb_build_object('documentId',snapshot.document_id,'documentVersionId',snapshot.document_version_id,'sha256',snapshot.sha256,'mediaType',snapshot.media_type,'bucket',document.storage_bucket,'path',document.storage_path,'sizeBytes',document.size_bytes) order by snapshot.document_version_id)
  into v_documents from public.underwriting_job_documents snapshot join public.deal_documents document on document.id=snapshot.document_id and document.organization_id=snapshot.organization_id
  where snapshot.job_id=v_job.id and document.security_status='clean' and document.sha256=snapshot.sha256 and document.deleted_at is null;
  if v_documents is null or jsonb_array_length(v_documents)<>(select count(*) from public.underwriting_job_documents where job_id=v_job.id) then
    update public.underwriting_outbox_events set status='failed',last_error='Document eligibility changed before underwriting.',updated_at=now() where id=v_event.id;
    update public.underwriting_jobs set status='failed',failure_code='document_ineligible',updated_at=now() where id=v_job.id;
    return null;
  end if;
  update public.underwriting_outbox_events set status='leased',attempt_count=attempt_count+1,lease_expires_at=now()+interval '5 minutes',last_error=null,updated_at=now() where id=v_event.id returning * into v_event;
  update public.underwriting_jobs set status='processing',failure_code=null,updated_at=now() where id=v_job.id;
  return jsonb_build_object('eventId',v_event.id,'attempt',v_event.attempt_count,'contractVersion',v_event.contract_version,'jobId',v_job.id,'organizationId',v_job.organization_id,'dealId',v_job.deal_id,'documents',v_documents);
end; $$;
revoke all on function public.claim_underwriting_outbox_event() from public,anon,authenticated,service_role;
grant execute on function public.claim_underwriting_outbox_event() to service_role;

create function public.record_document_intelligence_artifact(p_event_id uuid,p_result jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_event public.underwriting_outbox_events%rowtype; v_job public.underwriting_jobs%rowtype; v_snapshot public.underwriting_job_documents%rowtype; v_id uuid; v_tier text; v_review public.document_intelligence_review_status;
begin
  if (select auth.jwt()->>'role') is distinct from 'service_role' then raise exception using errcode='42501',message='Trusted underwriting worker required.'; end if;
  select * into v_event from public.underwriting_outbox_events where id=p_event_id for update;
  if not found or v_event.status<>'leased' or v_event.lease_expires_at<=now() then raise exception using errcode='55000',message='Underwriting worker lease is closed.'; end if;
  select * into v_job from public.underwriting_jobs where id=v_event.job_id and organization_id=v_event.organization_id;
  if p_result->>'contractVersion'<>'buddy-document-intelligence.v1' or p_result->>'jobId'<>v_job.id::text or p_result->>'organizationId'<>v_job.organization_id::text or p_result->>'dealId'<>v_job.deal_id::text then raise exception using errcode='22023',message='Document intelligence authority mismatch.'; end if;
  select * into v_snapshot from public.underwriting_job_documents where job_id=v_job.id and document_id=(p_result->>'documentId')::uuid and document_version_id=(p_result->>'documentVersionId')::uuid;
  if not found or v_snapshot.sha256<>p_result->>'sha256' then raise exception using errcode='22023',message='Document intelligence evidence mismatch.'; end if;
  v_tier:=p_result->'classification'->>'tier'; v_review:=case when v_tier='ai_assist' or coalesce((p_result->'classification'->>'requiresHumanReview')::boolean,false) then 'needs_review'::public.document_intelligence_review_status else 'needs_review'::public.document_intelligence_review_status end;
  insert into public.document_intelligence_artifacts(organization_id,job_id,deal_id,document_id,document_version_id,document_sha256,contract_version,provider,model,engine_version,classifier_version,canonical_type,classification_tier,classification_confidence,review_status,artifact)
  values(v_job.organization_id,v_job.id,v_job.deal_id,v_snapshot.document_id,v_snapshot.document_version_id,v_snapshot.sha256,p_result->>'contractVersion',p_result->>'provider',nullif(p_result->>'model',''),p_result->>'engineVersion',p_result->'classification'->>'classifierVersion',p_result->'classification'->>'canonicalType',v_tier,(p_result->'classification'->>'confidence')::numeric,v_review,p_result)
  on conflict(job_id,document_version_id,engine_version) do update set artifact=excluded.artifact,classification_confidence=excluded.classification_confidence,review_status='needs_review'
  returning id into v_id;
  return jsonb_build_object('artifactId',v_id,'reviewStatus',v_review);
end; $$;
revoke all on function public.record_document_intelligence_artifact(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.record_document_intelligence_artifact(uuid,jsonb) to service_role;

create function public.complete_underwriting_document_intelligence(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_event public.underwriting_outbox_events%rowtype; v_expected integer; v_recorded integer;
begin
  if (select auth.jwt()->>'role') is distinct from 'service_role' then raise exception using errcode='42501',message='Trusted underwriting worker required.'; end if;
  select * into v_event from public.underwriting_outbox_events where id=p_event_id for update;
  if not found or v_event.status<>'leased' or v_event.lease_expires_at<=now() then raise exception using errcode='55000',message='Underwriting worker lease is closed.'; end if;
  select count(*) into v_expected from public.underwriting_job_documents where job_id=v_event.job_id;
  select count(*) into v_recorded from public.document_intelligence_artifacts where job_id=v_event.job_id and review_status<>'superseded';
  if v_expected=0 or v_recorded<>v_expected then raise exception using errcode='55000',message='Document intelligence result set is incomplete.'; end if;
  update public.underwriting_outbox_events set status='dispatched',lease_expires_at=null,last_error=null,updated_at=now() where id=v_event.id;
  update public.underwriting_jobs set status='needs_review',updated_at=now() where id=v_event.job_id;
  return jsonb_build_object('jobId',v_event.job_id,'status','needs_review','artifactCount',v_recorded);
end; $$;
revoke all on function public.complete_underwriting_document_intelligence(uuid) from public,anon,authenticated,service_role;
grant execute on function public.complete_underwriting_document_intelligence(uuid) to service_role;

create function public.fail_underwriting_runtime(p_event_id uuid,p_error text,p_retryable boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_event public.underwriting_outbox_events%rowtype; v_retry boolean; v_delay integer;
begin
  if (select auth.jwt()->>'role') is distinct from 'service_role' then raise exception using errcode='42501',message='Trusted underwriting worker required.'; end if;
  select * into v_event from public.underwriting_outbox_events where id=p_event_id for update;
  if not found or v_event.status<>'leased' then raise exception using errcode='55000',message='Underwriting failure transition is closed.'; end if;
  v_retry:=p_retryable and v_event.attempt_count<5; v_delay:=least(3600,30*power(2,greatest(0,v_event.attempt_count-1))::integer);
  update public.underwriting_outbox_events set status=case when v_retry then 'pending'::public.underwriting_outbox_status else 'failed'::public.underwriting_outbox_status end,lease_expires_at=null,available_at=case when v_retry then now()+make_interval(secs=>v_delay) else available_at end,last_error=left(coalesce(nullif(trim(p_error),''),'Underwriting runtime failed.'),500),updated_at=now() where id=v_event.id;
  update public.underwriting_jobs set status=case when v_retry then 'queued'::public.underwriting_job_status else 'failed'::public.underwriting_job_status end,failure_code=case when v_retry then null else 'runtime_failed' end,updated_at=now() where id=v_event.job_id;
  return jsonb_build_object('jobId',v_event.job_id,'status',case when v_retry then 'queued' else 'failed' end,'retryAfterSeconds',case when v_retry then v_delay else null end);
end; $$;
revoke all on function public.fail_underwriting_runtime(uuid,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.fail_underwriting_runtime(uuid,text,boolean) to service_role;
