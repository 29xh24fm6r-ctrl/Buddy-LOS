begin;

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values
('11000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','underwriter-a@example.test','',now(),now()),
('11000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','underwriter-b@example.test','',now(),now());
insert into public.organizations(id,name,slug) values
('21000000-0000-4000-8000-000000000001','Underwriting Bank A','underwriting-bank-a'),
('21000000-0000-4000-8000-000000000002','Underwriting Bank B','underwriting-bank-b');
insert into public.organization_memberships(organization_id,user_id,role) values
('21000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','owner'),
('21000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000002','owner');
insert into public.organization_product_modules(organization_id,module_key,status,activated_by) values
('21000000-0000-4000-8000-000000000001','underwriting','active','11000000-0000-4000-8000-000000000001');
insert into public.borrowers(id,organization_id,legal_name,created_by) values
('31000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','Underwriting Borrower A','11000000-0000-4000-8000-000000000001'),
('31000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000002','Underwriting Borrower B','11000000-0000-4000-8000-000000000002');
insert into public.deals(id,organization_id,borrower_id,name,created_by) values
('41000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','Underwriting Deal A','11000000-0000-4000-8000-000000000001'),
('41000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000002','31000000-0000-4000-8000-000000000002','Underwriting Deal B','11000000-0000-4000-8000-000000000002');
insert into public.deal_documents(id,organization_id,deal_id,logical_document_id,original_file_name,storage_path,mime_type,size_bytes,sha256,security_status,uploaded_by,scanned_at) values
('51000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','financials.pdf','a/financials.pdf','application/pdf',4,repeat('a',64),'clean','11000000-0000-4000-8000-000000000001',now()),
('51000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000002','financials.pdf','b/financials.pdf','application/pdf',4,repeat('b',64),'clean','11000000-0000-4000-8000-000000000002',now());

set local role authenticated;
set local request.jwt.claims='{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}';
do $$ declare first_result jsonb; replay_result jsonb; begin
  first_result := public.request_underwriting_job(
    '21000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000001',
    array['51000000-0000-4000-8000-000000000001'::uuid],
    'underwriting-request-001'
  );
  replay_result := public.request_underwriting_job(
    '21000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000001',
    array['51000000-0000-4000-8000-000000000001'::uuid],
    'underwriting-request-001'
  );
  if (first_result->>'replayed')::boolean or not (replay_result->>'replayed')::boolean or first_result->>'jobId' <> replay_result->>'jobId' then
    raise exception 'underwriting replay contract failed';
  end if;
  begin
    perform public.request_underwriting_job(
      '21000000-0000-4000-8000-000000000002',
      '41000000-0000-4000-8000-000000000002',
      array['51000000-0000-4000-8000-000000000002'::uuid],
      'cross-tenant-underwriting'
    );
    raise exception 'cross-tenant underwriting unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from public.underwriting_outbox_events;
    raise exception 'ordinary user read private underwriting outbox';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

do $$ begin
  if (select count(*) from public.underwriting_jobs) <> 1 then raise exception 'unexpected underwriting job count'; end if;
  if (select count(*) from public.underwriting_outbox_events where status='pending') <> 1 then raise exception 'durable underwriting outbox event missing'; end if;
  if (select count(*) from public.audit_events where event_type='underwriting.requested') <> 1 then raise exception 'underwriting audit evidence missing'; end if;
  if (select sha256 from public.underwriting_job_documents limit 1) <> repeat('a',64) then raise exception 'document hash snapshot missing'; end if;
end $$;

rollback;
