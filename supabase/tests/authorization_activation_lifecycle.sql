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
do $$ declare result jsonb; begin
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
