begin;

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values
('11000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-a@example.test','',now(),now()),
('11000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','lender-assigned@example.test','',now(),now()),
('11000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','lender-unassigned@example.test','',now(),now()),
('11000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','closer-a@example.test','',now(),now()),
('11000000-0000-4000-8000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-b@example.test','',now(),now());

insert into public.organizations(id,name,slug) values
('21000000-0000-4000-8000-000000000001','Authorization Bank A','authorization-bank-a'),
('21000000-0000-4000-8000-000000000002','Authorization Bank B','authorization-bank-b');

insert into public.organization_memberships(organization_id,user_id,role) values
('21000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','owner'),
('21000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002','lender'),
('21000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000003','lender'),
('21000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000004','closer'),
('21000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000005','owner');

insert into public.organization_product_modules(organization_id,module_key,status,activated_by) values
('21000000-0000-4000-8000-000000000001','document_intake','active','11000000-0000-4000-8000-000000000001'),
('21000000-0000-4000-8000-000000000001','underwriting','active','11000000-0000-4000-8000-000000000001');

insert into public.borrowers(id,organization_id,legal_name,created_by) values
('31000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','Assigned Borrower','11000000-0000-4000-8000-000000000001'),
('31000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000001','Unassigned Borrower','11000000-0000-4000-8000-000000000001'),
('31000000-0000-4000-8000-000000000003','21000000-0000-4000-8000-000000000002','Other Bank Borrower','11000000-0000-4000-8000-000000000005');

insert into public.deals(id,organization_id,borrower_id,name,created_by) values
('41000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','Assigned Deal','11000000-0000-4000-8000-000000000001'),
('41000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000002','Unassigned Deal','11000000-0000-4000-8000-000000000001'),
('41000000-0000-4000-8000-000000000003','21000000-0000-4000-8000-000000000002','31000000-0000-4000-8000-000000000003','Other Bank Deal','11000000-0000-4000-8000-000000000005');

insert into public.deal_assignments(organization_id,deal_id,user_id,assignment_role,assigned_by) values
('21000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002','banker','11000000-0000-4000-8000-000000000001'),
('21000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000004','closer','11000000-0000-4000-8000-000000000001');

insert into public.deal_tasks(id,organization_id,deal_id,title,created_by) values
('51000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','Assigned task','11000000-0000-4000-8000-000000000001'),
('51000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000002','Unassigned task','11000000-0000-4000-8000-000000000001'),
('51000000-0000-4000-8000-000000000003','21000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000003','Other bank task','11000000-0000-4000-8000-000000000005');

set local role authenticated;
set local request.jwt.claims='{"sub":"11000000-0000-4000-8000-000000000002","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.deal_tasks) <> 1 then
    raise exception 'assignment-scoped task RLS failed';
  end if;
  begin
    perform public.create_deal_task(
      '21000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001',
      'activation-denied-task','Activation denied task',null,null,null
    );
    raise exception 'inactive core operation unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

insert into public.organization_capability_activations(
  organization_id,capability_key,is_active,activated_at,activated_by,evidence_reference
) values
('21000000-0000-4000-8000-000000000001','core_operations',true,now(),'11000000-0000-4000-8000-000000000001','internal authorization test'),
('21000000-0000-4000-8000-000000000001','golden_loan_factory',true,now(),'11000000-0000-4000-8000-000000000001','internal lifecycle test');

set local role authenticated;
set local request.jwt.claims='{"sub":"11000000-0000-4000-8000-000000000002","role":"authenticated"}';
do $$ declare result jsonb; company jsonb; company_id uuid; relationship jsonb; linked_relationship jsonb; completed jsonb; person jsonb; person_updated jsonb; referral jsonb; referral_updated jsonb; appointment jsonb; appointment_updated jsonb; task jsonb; task_updated jsonb; contact_id uuid; search_count integer; begin
  result := public.create_deal_task(
    '21000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001',
    'assigned-task-command','Authorized assigned task',null,null,null
  );
  if result->>'taskId' is null then raise exception 'assigned core command failed'; end if;
  begin
    perform public.create_deal_task(
      '21000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000002',
      'unassigned-task-command','Unauthorized task',null,null,null
    );
    raise exception 'unassigned core command unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  company := public.create_crm_company('21000000-0000-4000-8000-000000000001','crm-company-owned-001','Factory Company','business','FACTORY-001');
  company_id := (company->>'borrowerId')::uuid;
  perform set_config('buddy_test.crm_company_id',company_id::text,true);
  if not exists(select 1 from public.borrowers where id=company_id) then raise exception 'company creator lost read authority'; end if;
  perform public.create_crm_contact('21000000-0000-4000-8000-000000000001',company_id,'crm-contact-primary-001','email','Work','factory@example.test',true);
  if not exists(select 1 from public.borrower_contacts where borrower_id=company_id and is_primary) then raise exception 'primary contact command failed'; end if;
  begin
    perform public.create_crm_contact('21000000-0000-4000-8000-000000000001',company_id,'crm-contact-invalid-001','email','Work','not-an-email',false);
    raise exception 'database contact validation accepted malformed email';
  exception when invalid_parameter_value then null; end;
  person := public.create_crm_person('21000000-0000-4000-8000-000000000001',company_id,'crm-person-001','Jordan',null,'Factory',null,'President','Owner',51,'jordan@example.test','+14045551212',true,null);
  if person->>'personId' is null or not exists(select 1 from public.crm_people where id=(person->>'personId')::uuid) then raise exception 'first-class person command failed'; end if;
  person_updated := public.update_crm_person('21000000-0000-4000-8000-000000000001',(person->>'personId')::uuid,'crm-person-update-001',1,'Jordan','A','Factory','Jordy','Chief Executive','Key relationship',false);
  if person_updated->>'version'<>'2' then raise exception 'person update lifecycle failed'; end if;
  perform public.create_crm_person_contact('21000000-0000-4000-8000-000000000001',(person->>'personId')::uuid,'crm-person-contact-001','website','Profile','https://example.test/jordan',false);
  if not exists(select 1 from public.crm_person_contacts where person_id=(person->>'personId')::uuid and contact_kind='website') then raise exception 'person contact lifecycle failed'; end if;
  perform public.log_crm_activity('21000000-0000-4000-8000-000000000001',company_id,null,'crm-activity-001','call','Factory follow-up',now(),null);
  relationship := public.create_crm_relationship('21000000-0000-4000-8000-000000000001',company_id,'31000000-0000-4000-8000-000000000001','crm-relationship-001','affiliate','Related business',null);
  if relationship->>'relationshipId' is null then raise exception 'relationship command failed'; end if;
  perform public.close_crm_relationship('21000000-0000-4000-8000-000000000001',(relationship->>'relationshipId')::uuid,'crm-relationship-close-001',true);
  perform public.reopen_crm_relationship('21000000-0000-4000-8000-000000000001',(relationship->>'relationshipId')::uuid,'crm-relationship-reopen-001',false);
  if not exists(select 1 from public.borrower_relationships where id=(relationship->>'relationshipId')::uuid and is_active) then raise exception 'relationship reopen lifecycle failed'; end if;
  linked_relationship := public.create_crm_relationship('21000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001',company_id,'crm-relationship-linked-001','affiliate','Private target',null);
  perform set_config('buddy_test.crm_linked_relationship_id',linked_relationship->>'relationshipId',true);
  referral := public.create_crm_referral('21000000-0000-4000-8000-000000000001',company_id,'31000000-0000-4000-8000-000000000001',null,null,'crm-referral-001',now(),250000,'Factory referral');
  if referral->>'referralId' is null then raise exception 'referral command failed'; end if;
  referral_updated := public.update_crm_referral('21000000-0000-4000-8000-000000000001',(referral->>'referralId')::uuid,'crm-referral-update-001',1,'qualified','Qualified by lender','Follow-up complete');
  if referral_updated->>'version'<>'2' or referral_updated->>'status'<>'qualified' then raise exception 'referral update lifecycle failed'; end if;
  appointment := public.create_crm_appointment('21000000-0000-4000-8000-000000000001',company_id,null,'crm-appointment-001','Discovery meeting',now()+interval '1 day',now()+interval '1 day 1 hour','11000000-0000-4000-8000-000000000002','Video',null);
  if appointment->>'appointmentId' is null then raise exception 'appointment command failed'; end if;
  appointment_updated := public.update_crm_appointment('21000000-0000-4000-8000-000000000001',(appointment->>'appointmentId')::uuid,'crm-appointment-update-001',1,'Rescheduled discovery',now()+interval '2 days',now()+interval '2 days 1 hour','scheduled','11000000-0000-4000-8000-000000000002','Conference room','Bring statements');
  if appointment_updated->>'version'<>'2' then raise exception 'appointment update lifecycle failed'; end if;
  task := public.create_deal_task('21000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','crm-task-lifecycle-001','Prepare discovery',null,now()+interval '2 days',null);
  task_updated := public.update_deal_task('21000000-0000-4000-8000-000000000001',(task->>'taskId')::uuid,'crm-task-update-001',1,'Prepare discovery package','Call notes',now()+interval '3 days','11000000-0000-4000-8000-000000000002',false);
  if task_updated->>'version'<>'2' then raise exception 'task assignment lifecycle failed'; end if;
  completed := public.complete_deal_task('21000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001','crm-task-complete-001',1);
  if completed->>'status'<>'completed' then raise exception 'task completion failed'; end if;
  select count(*) into search_count from public.crm_workspace_search_ids('21000000-0000-4000-8000-000000000001','referrals','Assigned Borrower');
  if search_count<1 then raise exception 'authoritative cross-record search failed'; end if;
  select id into contact_id from public.borrower_contacts where borrower_id=company_id and value='factory@example.test';
  perform public.archive_crm_contact('21000000-0000-4000-8000-000000000001',contact_id,'crm-contact-archive-001',1);
  perform public.restore_crm_record('21000000-0000-4000-8000-000000000001','contact',contact_id,'crm-contact-restore-001',2);
  perform public.update_crm_person('21000000-0000-4000-8000-000000000001',(person->>'personId')::uuid,'crm-person-archive-001',2,'Jordan','A','Factory','Jordy','Chief Executive','Key relationship',true);
  perform public.restore_crm_record('21000000-0000-4000-8000-000000000001','person',(person->>'personId')::uuid,'crm-person-restore-001',3);
  perform public.update_crm_company('21000000-0000-4000-8000-000000000001',company_id,'crm-company-archive-001',1,'Factory Company','FACTORY-001',true);
  perform public.restore_crm_record('21000000-0000-4000-8000-000000000001','company',company_id,'crm-company-restore-001',2);
end $$;
reset role;

set local role authenticated;
set local request.jwt.claims='{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}';
do $$ declare company_id uuid := current_setting('buddy_test.crm_company_id')::uuid; begin
  perform public.end_crm_company_assignment('21000000-0000-4000-8000-000000000001',company_id,'11000000-0000-4000-8000-000000000002','crm-assignment-end-001');
end $$;
reset role;

set local role authenticated;
set local request.jwt.claims='{"sub":"11000000-0000-4000-8000-000000000002","role":"authenticated"}';
do $$ declare company_id uuid := current_setting('buddy_test.crm_company_id')::uuid; replayed jsonb; begin
  replayed := public.create_crm_company('21000000-0000-4000-8000-000000000001','crm-company-owned-001','Factory Company','business','FACTORY-001');
  if not coalesce((replayed->>'replayed')::boolean,false) then raise exception 'company replay did not report replay'; end if;
  if exists(select 1 from public.borrowers where id=company_id) then raise exception 'company replay restored revoked authority'; end if;
  if exists(select 1 from public.borrower_relationships where id=current_setting('buddy_test.crm_linked_relationship_id')::uuid) then raise exception 'relationship RLS leaked inaccessible target metadata'; end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claims='{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}';
do $$ declare company_id uuid := current_setting('buddy_test.crm_company_id')::uuid; begin
  perform public.assign_crm_company('21000000-0000-4000-8000-000000000001',company_id,'11000000-0000-4000-8000-000000000002','crm-assignment-restore-001');
end $$;
reset role;

set local role authenticated;
set local request.jwt.claims='{"sub":"11000000-0000-4000-8000-000000000002","role":"authenticated"}';
do $$ declare company_id uuid := current_setting('buddy_test.crm_company_id')::uuid; metrics jsonb; begin
  if not exists(select 1 from public.borrowers where id=company_id) then raise exception 'explicit assignment did not restore authority'; end if;
  metrics := public.crm_dashboard_metrics('21000000-0000-4000-8000-000000000001');
  if (metrics->>'companies')::integer < 2 or (metrics->>'people')::integer <> 1 then raise exception 'RLS-aware CRM metrics are inaccurate'; end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claims='{"sub":"11000000-0000-4000-8000-000000000003","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.borrowers)<>0 then raise exception 'unassigned lender can read CRM companies'; end if;
  if (select count(*) from public.borrower_assignments)<>0 then raise exception 'unassigned lender can read CRM assignments'; end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claims='{"sub":"11000000-0000-4000-8000-000000000004","role":"authenticated"}';
do $$ begin
  begin
    perform public.create_closing_requirement(
      '21000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001',
      'Premature closing requirement',null,true,'premature-closing-001'
    );
    raise exception 'premature closing requirement unexpectedly succeeded';
  exception when check_violation then null; end;
end $$;
reset role;

update public.deals set stage='credit_approval' where id='41000000-0000-4000-8000-000000000001';

set local role authenticated;
set local request.jwt.claims='{"sub":"11000000-0000-4000-8000-000000000004","role":"authenticated"}';
do $$ declare created jsonb; replayed jsonb; resolved jsonb; resolved_replay jsonb; begin
  created := public.create_closing_requirement(
    '21000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001',
    'Final closing package',null,true,'closing-create-001'
  );
  replayed := public.create_closing_requirement(
    '21000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001',
    'Final closing package',null,true,'closing-create-001'
  );
  if not coalesce((replayed->>'replayed')::boolean,false) then raise exception 'closing create replay failed'; end if;
  resolved := public.resolve_closing_requirement(
    '21000000-0000-4000-8000-000000000001',(created->>'requirementId')::uuid,
    'satisfied','Verified complete','closing-resolve-001'
  );
  resolved_replay := public.resolve_closing_requirement(
    '21000000-0000-4000-8000-000000000001',(created->>'requirementId')::uuid,
    'satisfied','Verified complete','closing-resolve-001'
  );
  if not coalesce((resolved_replay->>'replayed')::boolean,false) then raise exception 'closing resolution replay failed'; end if;
  if resolved->>'status' <> 'satisfied' then raise exception 'closing resolution failed'; end if;
end $$;
reset role;

rollback;
