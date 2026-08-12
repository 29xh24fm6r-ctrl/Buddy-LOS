begin;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values('12000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','runtime@example.test','',now(),now());
insert into public.organizations(id,name,slug) values('22000000-0000-4000-8000-000000000001','Runtime Bank','runtime-bank');
insert into public.organization_memberships(organization_id,user_id,role) values('22000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001','owner');
insert into public.organization_product_modules(organization_id,module_key,status,activated_by) values('22000000-0000-4000-8000-000000000001','underwriting','active','12000000-0000-4000-8000-000000000001');
insert into public.borrowers(id,organization_id,legal_name,created_by) values('32000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','Runtime Borrower','12000000-0000-4000-8000-000000000001');
insert into public.deals(id,organization_id,borrower_id,name,created_by) values('42000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000001','Runtime Deal','12000000-0000-4000-8000-000000000001');
insert into public.deal_documents(id,organization_id,deal_id,logical_document_id,original_file_name,storage_path,mime_type,size_bytes,sha256,security_status,uploaded_by,scanned_at) values('52000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000001','runtime.pdf','runtime/runtime.pdf','application/pdf',4,repeat('a',64),'clean','12000000-0000-4000-8000-000000000001',now());
set local role authenticated; set local request.jwt.claims='{"sub":"12000000-0000-4000-8000-000000000001","role":"authenticated"}';
select public.request_underwriting_job('22000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001',array['52000000-0000-4000-8000-000000000001'::uuid],'runtime-request-001');
do $$ begin begin perform public.claim_underwriting_outbox_event(); raise exception 'browser claimed underwriting work'; exception when insufficient_privilege then null; end; end $$;
reset role; set local role service_role; set local request.jwt.claims='{"role":"service_role"}';
do $$ declare claim jsonb; result jsonb; begin
 claim:=public.claim_underwriting_outbox_event();
 if claim->>'organizationId'<>'22000000-0000-4000-8000-000000000001' or claim->'documents'->0->>'sha256'<>repeat('a',64) then raise exception 'runtime claim lost authority or hash'; end if;
 result:=jsonb_build_object('contractVersion','buddy-document-intelligence.v1','jobId',claim->>'jobId','organizationId',claim->>'organizationId','dealId',claim->>'dealId','documentId','52000000-0000-4000-8000-000000000001','documentVersionId','52000000-0000-4000-8000-000000000001','sha256',repeat('a',64),'provider','test-provider','model','test-model','engineVersion','engine-1','classification',jsonb_build_object('canonicalType','business_tax_return','confidence',0.97,'tier','ai_assist','classifierVersion','classifier-1','reason','test','requiresHumanReview',true,'evidence','[]'::jsonb),'fields','[]'::jsonb,'tables','[]'::jsonb,'completedAt',now());
 perform public.record_document_intelligence_artifact((claim->>'eventId')::uuid,result);
 perform public.complete_underwriting_document_intelligence((claim->>'eventId')::uuid);
end $$; reset role;
do $$ begin
 if (select count(*) from public.underwriting_jobs where status='needs_review')<>1 then raise exception 'runtime did not enter review'; end if;
 if (select count(*) from public.document_intelligence_artifacts where review_status='needs_review')<>1 then raise exception 'AI result bypassed review'; end if;
 if (select count(*) from public.underwriting_outbox_events where status='dispatched')<>1 then raise exception 'runtime outbox did not complete'; end if;
end $$; rollback;
