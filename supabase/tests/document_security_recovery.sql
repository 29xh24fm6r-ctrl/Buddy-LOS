begin;

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values
('10000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-a@example.test','',now(),now()),
('10000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-b@example.test','',now(),now());
insert into public.organizations(id,name,slug) values
('20000000-0000-4000-8000-000000000001','Bank A','security-bank-a'),('20000000-0000-4000-8000-000000000002','Bank B','security-bank-b');
insert into public.organization_memberships(organization_id,user_id,role) values
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','owner'),
('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','owner');
insert into public.borrowers(id,organization_id,legal_name,created_by) values
('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Borrower A','10000000-0000-4000-8000-000000000001'),
('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','Borrower B','10000000-0000-4000-8000-000000000002');
insert into public.deals(id,organization_id,borrower_id,name,created_by) values
('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Deal A','10000000-0000-4000-8000-000000000001'),
('40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','Deal B','10000000-0000-4000-8000-000000000002');
insert into public.deal_documents(id,organization_id,deal_id,logical_document_id,original_file_name,storage_path,mime_type,size_bytes,sha256,security_status,uploaded_by,scanned_at,retained_until,legal_hold) values
('50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','a.pdf','a/doc.pdf','application/pdf',4,repeat('a',64),'rejected','10000000-0000-4000-8000-000000000001',now(),current_date,true),
('50000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000002','b.pdf','b/doc.pdf','application/pdf',4,repeat('b',64),'clean','10000000-0000-4000-8000-000000000002',now(),current_date,false),
('50000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000003','retry.pdf','a/retry.pdf','application/pdf',4,repeat('c',64),'quarantined','10000000-0000-4000-8000-000000000001',null,null,false);

set local role authenticated;
set local request.jwt.claims='{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.deal_documents)<>2 then raise exception 'tenant isolation failed'; end if;
  begin
    perform public.govern_document_retention('20000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002',current_date+1,false,'cross tenant attempt','cross-tenant-retention');
    raise exception 'cross tenant retention unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  perform public.govern_document_retention('20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',current_date+1,false,'extend held record','held-retention-001');
  if not (select legal_hold from public.deal_documents where id='50000000-0000-4000-8000-000000000001') then raise exception 'legal hold was released'; end if;
  begin
    perform public.govern_document_retention('20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',current_date,false,'shorten held record','held-retention-002');
    raise exception 'retention shortening unexpectedly succeeded';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.get_document_operations_health();
    raise exception 'browser document operations health unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

insert into public.document_scan_jobs(id,organization_id,document_id,status,attempt_count,max_attempts,next_attempt_at,lease_expires_at) values
('70000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000003','submitting',1,5,now(),now()-interval '1 second');
set local role service_role;
set local request.jwt.claims='{"role":"service_role"}';
do $$ declare claimed jsonb; begin
  claimed:=public.claim_document_scan_job();
  if claimed->>'documentId'<>'50000000-0000-4000-8000-000000000003' or (claimed->>'attempt')::integer<>2 then raise exception 'scan lease recovery failed'; end if;
  perform public.record_document_scan_submission('70000000-0000-4000-8000-000000000001','test-scanner','test-run-001');
  perform public.record_document_scan_result_v2('20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000003','test-scanner','test-run-001','clean',repeat('c',64),'engine-1','signatures-1','{"threats":0}'::jsonb);
  if not ((public.record_document_scan_result_v2('20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000003','test-scanner','test-run-001','clean',repeat('c',64),'engine-1','signatures-1','{"threats":0}'::jsonb))->>'replayed')::boolean then raise exception 'scan replay was not idempotent'; end if;
  begin
    perform public.record_document_scan_result_v2('20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000003','test-scanner','test-run-001','rejected',repeat('c',64),'engine-1','signatures-1','{}'::jsonb);
    raise exception 'conflicting scan replay unexpectedly succeeded';
  exception when unique_violation then null; end;
  if public.claim_document_cleanup_job() is not null then raise exception 'legal hold cleanup denial failed'; end if;
  if (public.get_document_operations_health()->>'schemaVersion')<>'buddy-document-operations-health-v1' then raise exception 'document operations health contract missing'; end if;
  if public.get_document_operations_health()::text ~ '(a/doc|retry.pdf|test-run|repeat\\(' then raise exception 'document operations health leaked document data'; end if;
end $$;
reset role;

do $$ begin
  if not exists(select 1 from public.audit_events where event_type='document_retention.governed' and organization_id='20000000-0000-4000-8000-000000000001' and entity_id='50000000-0000-4000-8000-000000000001') then raise exception 'retention audit evidence missing'; end if;
end $$;

rollback;
