-- Governed native CRM, task, and deal lifecycle operations.
-- Direct Data API writes remain closed; all mutations flow through these commands.

create type public.crm_activity_kind as enum ('call', 'email', 'meeting', 'note', 'referral', 'other');
create type public.deal_task_status as enum ('open', 'completed', 'cancelled');

create table public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  borrower_id uuid not null,
  deal_id uuid,
  activity_kind public.crm_activity_kind not null,
  subject text not null check (char_length(subject) between 2 and 200),
  occurred_at timestamptz not null,
  notes text check (notes is null or char_length(notes) <= 4000),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (borrower_id, organization_id) references public.borrowers(id, organization_id) on delete restrict,
  foreign key (deal_id, organization_id) references public.deals(id, organization_id) on delete cascade
);

create table public.deal_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  deal_id uuid not null,
  title text not null check (char_length(title) between 2 and 200),
  description text check (description is null or char_length(description) <= 4000),
  status public.deal_task_status not null default 'open',
  due_at timestamptz,
  assigned_to uuid,
  completed_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  unique (id, organization_id),
  foreign key (deal_id, organization_id) references public.deals(id, organization_id) on delete cascade,
  foreign key (organization_id, assigned_to) references public.organization_memberships(organization_id, user_id) on delete restrict,
  check ((status = 'completed') = (completed_at is not null))
);

create index crm_activities_borrower_time_idx on public.crm_activities (organization_id, borrower_id, occurred_at desc);
create index crm_activities_deal_time_idx on public.crm_activities (organization_id, deal_id, occurred_at desc) where deal_id is not null;
create index deal_tasks_queue_idx on public.deal_tasks (organization_id, status, due_at) where status = 'open';
create index deal_tasks_assignee_idx on public.deal_tasks (organization_id, assigned_to, status) where assigned_to is not null;

alter table public.crm_activities enable row level security;
alter table public.deal_tasks enable row level security;
revoke all on public.crm_activities, public.deal_tasks from public, anon, authenticated;
grant select on public.crm_activities, public.deal_tasks to authenticated;

create policy "crm_activities_read_member" on public.crm_activities for select to authenticated using (
  exists (select 1 from public.organization_memberships m where m.organization_id = crm_activities.organization_id and m.user_id = (select auth.uid()) and m.is_active)
);
create policy "deal_tasks_read_member" on public.deal_tasks for select to authenticated using (
  exists (select 1 from public.organization_memberships m where m.organization_id = deal_tasks.organization_id and m.user_id = (select auth.uid()) and m.is_active)
);

create function public.require_core_operator(p_organization_id uuid)
returns public.organization_role language plpgsql security definer set search_path = '' as $$
declare v_role public.organization_role;
begin
  select m.role into v_role from public.organization_memberships m
  where m.organization_id = p_organization_id and m.user_id = (select auth.uid()) and m.is_active;
  if v_role is null or v_role not in ('owner', 'administrator', 'lender') then
    raise exception using errcode = '42501', message = 'Core operation permission denied.';
  end if;
  return v_role;
end $$;
revoke all on function public.require_core_operator(uuid) from public, anon, authenticated;

create function public.create_crm_company(p_organization_id uuid, p_idempotency_key text, p_legal_name text, p_borrower_kind public.borrower_kind, p_external_reference text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_id uuid; v_prior jsonb; v_result jsonb;
begin
  perform public.require_core_operator(p_organization_id);
  if char_length(trim(coalesce(p_idempotency_key,''))) not between 8 and 160 or char_length(trim(coalesce(p_legal_name,''))) not between 2 and 200 then raise exception using errcode='22023', message='Invalid company command.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text||':'||trim(p_idempotency_key),0));
  select e.payload->'result' into v_prior from public.audit_events e where e.organization_id=p_organization_id and e.idempotency_key=trim(p_idempotency_key);
  if v_prior is not null then return v_prior||jsonb_build_object('replayed',true); end if;
  insert into public.borrowers(organization_id,legal_name,borrower_kind,external_reference,relationship_start_date,created_by)
  values(p_organization_id,trim(p_legal_name),p_borrower_kind,nullif(trim(p_external_reference),''),current_date,v_actor) returning id into v_id;
  v_result:=jsonb_build_object('borrowerId',v_id,'replayed',false);
  insert into public.audit_events(organization_id,actor_user_id,event_type,entity_type,entity_id,correlation_id,idempotency_key,payload)
  values(p_organization_id,v_actor,'crm.company_created','borrower',v_id,gen_random_uuid(),trim(p_idempotency_key),jsonb_build_object('result',v_result,'legalName',trim(p_legal_name)));
  return v_result;
end $$;

create function public.create_crm_contact(p_organization_id uuid, p_borrower_id uuid, p_idempotency_key text, p_contact_kind public.contact_kind, p_label text, p_value text, p_is_primary boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_id uuid; v_prior jsonb; v_result jsonb;
begin
  perform public.require_core_operator(p_organization_id);
  if char_length(trim(coalesce(p_idempotency_key,''))) not between 8 and 160 or char_length(trim(coalesce(p_value,''))) not between 1 and 500 then raise exception using errcode='22023', message='Invalid contact command.'; end if;
  if not exists(select 1 from public.borrowers b where b.id=p_borrower_id and b.organization_id=p_organization_id and b.archived_at is null) then raise exception using errcode='42501', message='Borrower unavailable.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text||':'||trim(p_idempotency_key),0));
  select e.payload->'result' into v_prior from public.audit_events e where e.organization_id=p_organization_id and e.idempotency_key=trim(p_idempotency_key);
  if v_prior is not null then return v_prior||jsonb_build_object('replayed',true); end if;
  if p_is_primary then update public.borrower_contacts set is_primary=false,updated_at=now() where organization_id=p_organization_id and borrower_id=p_borrower_id and contact_kind=p_contact_kind and is_primary; end if;
  insert into public.borrower_contacts(organization_id,borrower_id,contact_kind,label,value,is_primary,created_by)
  values(p_organization_id,p_borrower_id,p_contact_kind,nullif(trim(p_label),''),trim(p_value),p_is_primary,v_actor) returning id into v_id;
  v_result:=jsonb_build_object('contactId',v_id,'borrowerId',p_borrower_id,'replayed',false);
  insert into public.audit_events(organization_id,actor_user_id,event_type,entity_type,entity_id,correlation_id,idempotency_key,payload)
  values(p_organization_id,v_actor,'crm.contact_created','borrower',p_borrower_id,gen_random_uuid(),trim(p_idempotency_key),jsonb_build_object('result',v_result,'contactKind',p_contact_kind));
  return v_result;
end $$;

create function public.log_crm_activity(p_organization_id uuid, p_borrower_id uuid, p_deal_id uuid, p_idempotency_key text, p_activity_kind public.crm_activity_kind, p_subject text, p_occurred_at timestamptz, p_notes text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_id uuid; v_prior jsonb; v_result jsonb;
begin
  perform public.require_core_operator(p_organization_id);
  if char_length(trim(coalesce(p_idempotency_key,''))) not between 8 and 160 or char_length(trim(coalesce(p_subject,''))) not between 2 and 200 then raise exception using errcode='22023', message='Invalid activity command.'; end if;
  if not exists(select 1 from public.borrowers b where b.id=p_borrower_id and b.organization_id=p_organization_id and b.archived_at is null) then raise exception using errcode='42501', message='Borrower unavailable.'; end if;
  if p_deal_id is not null and not exists(select 1 from public.deals d where d.id=p_deal_id and d.organization_id=p_organization_id and d.borrower_id=p_borrower_id and d.archived_at is null) then raise exception using errcode='42501', message='Deal unavailable.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text||':'||trim(p_idempotency_key),0));
  select e.payload->'result' into v_prior from public.audit_events e where e.organization_id=p_organization_id and e.idempotency_key=trim(p_idempotency_key);
  if v_prior is not null then return v_prior||jsonb_build_object('replayed',true); end if;
  insert into public.crm_activities(organization_id,borrower_id,deal_id,activity_kind,subject,occurred_at,notes,created_by)
  values(p_organization_id,p_borrower_id,p_deal_id,p_activity_kind,trim(p_subject),p_occurred_at,nullif(trim(p_notes),''),v_actor) returning id into v_id;
  v_result:=jsonb_build_object('activityId',v_id,'replayed',false);
  insert into public.audit_events(organization_id,actor_user_id,event_type,entity_type,entity_id,correlation_id,idempotency_key,payload)
  values(p_organization_id,v_actor,'crm.activity_logged','crm_activity',v_id,gen_random_uuid(),trim(p_idempotency_key),jsonb_build_object('result',v_result,'borrowerId',p_borrower_id,'dealId',p_deal_id));
  return v_result;
end $$;

create function public.create_deal_task(p_organization_id uuid, p_deal_id uuid, p_idempotency_key text, p_title text, p_description text, p_due_at timestamptz, p_assigned_to uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_id uuid; v_prior jsonb; v_result jsonb;
begin
  perform public.require_core_operator(p_organization_id);
  if char_length(trim(coalesce(p_idempotency_key,''))) not between 8 and 160 or char_length(trim(coalesce(p_title,''))) not between 2 and 200 then raise exception using errcode='22023', message='Invalid task command.'; end if;
  if not exists(select 1 from public.deals d where d.id=p_deal_id and d.organization_id=p_organization_id and d.archived_at is null) then raise exception using errcode='42501', message='Deal unavailable.'; end if;
  if p_assigned_to is not null and not exists(select 1 from public.organization_memberships m where m.organization_id=p_organization_id and m.user_id=p_assigned_to and m.is_active) then raise exception using errcode='42501', message='Assignee unavailable.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text||':'||trim(p_idempotency_key),0));
  select e.payload->'result' into v_prior from public.audit_events e where e.organization_id=p_organization_id and e.idempotency_key=trim(p_idempotency_key);
  if v_prior is not null then return v_prior||jsonb_build_object('replayed',true); end if;
  insert into public.deal_tasks(organization_id,deal_id,title,description,due_at,assigned_to,created_by)
  values(p_organization_id,p_deal_id,trim(p_title),nullif(trim(p_description),''),p_due_at,p_assigned_to,v_actor) returning id into v_id;
  v_result:=jsonb_build_object('taskId',v_id,'replayed',false);
  insert into public.audit_events(organization_id,actor_user_id,event_type,entity_type,entity_id,correlation_id,idempotency_key,payload)
  values(p_organization_id,v_actor,'deal.task_created','deal_task',v_id,gen_random_uuid(),trim(p_idempotency_key),jsonb_build_object('result',v_result,'dealId',p_deal_id));
  return v_result;
end $$;

create function public.transition_deal_stage(p_organization_id uuid, p_deal_id uuid, p_idempotency_key text, p_expected_version integer, p_target_stage public.deal_stage)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_current public.deal_stage; v_version integer; v_prior jsonb; v_result jsonb;
begin
  perform public.require_core_operator(p_organization_id);
  if char_length(trim(coalesce(p_idempotency_key,''))) not between 8 and 160 or p_expected_version is null or p_expected_version < 1 then raise exception using errcode='22023', message='Invalid transition command.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text||':'||trim(p_idempotency_key),0));
  select e.payload->'result' into v_prior from public.audit_events e where e.organization_id=p_organization_id and e.idempotency_key=trim(p_idempotency_key);
  if v_prior is not null then return v_prior||jsonb_build_object('replayed',true); end if;
  select d.stage,d.version into v_current,v_version from public.deals d where d.id=p_deal_id and d.organization_id=p_organization_id and d.archived_at is null for update;
  if v_current is null then raise exception using errcode='42501', message='Deal unavailable.'; end if;
  if v_version <> p_expected_version then raise exception using errcode='40001', message='Deal version conflict.'; end if;
  if not ((v_current='prospect' and p_target_stage='intake') or (v_current='intake' and p_target_stage='application') or (v_current='application' and p_target_stage='underwriting') or p_target_stage in ('withdrawn','declined')) then raise exception using errcode='22023', message='Stage transition is not permitted in core operations.'; end if;
  update public.deals set stage=p_target_stage,stage_entered_at=now(),updated_at=now(),version=version+1 where id=p_deal_id and organization_id=p_organization_id returning version into v_version;
  v_result:=jsonb_build_object('dealId',p_deal_id,'stage',p_target_stage,'version',v_version,'replayed',false);
  insert into public.audit_events(organization_id,actor_user_id,event_type,entity_type,entity_id,correlation_id,idempotency_key,payload)
  values(p_organization_id,v_actor,'deal.stage_transitioned','deal',p_deal_id,gen_random_uuid(),trim(p_idempotency_key),jsonb_build_object('result',v_result,'from',v_current,'to',p_target_stage));
  return v_result;
end $$;

revoke all on function public.create_crm_company(uuid,text,text,public.borrower_kind,text) from public,anon;
revoke all on function public.create_crm_contact(uuid,uuid,text,public.contact_kind,text,text,boolean) from public,anon;
revoke all on function public.log_crm_activity(uuid,uuid,uuid,text,public.crm_activity_kind,text,timestamptz,text) from public,anon;
revoke all on function public.create_deal_task(uuid,uuid,text,text,text,timestamptz,uuid) from public,anon;
revoke all on function public.transition_deal_stage(uuid,uuid,text,integer,public.deal_stage) from public,anon;
grant execute on function public.create_crm_company(uuid,text,text,public.borrower_kind,text) to authenticated;
grant execute on function public.create_crm_contact(uuid,uuid,text,public.contact_kind,text,text,boolean) to authenticated;
grant execute on function public.log_crm_activity(uuid,uuid,uuid,text,public.crm_activity_kind,text,timestamptz,text) to authenticated;
grant execute on function public.create_deal_task(uuid,uuid,text,text,text,timestamptz,uuid) to authenticated;
grant execute on function public.transition_deal_stage(uuid,uuid,text,integer,public.deal_stage) to authenticated;

comment on table public.crm_activities is 'Tenant-bound CRM interaction ledger; writes are governed by server-invoked commands.';
comment on table public.deal_tasks is 'Tenant-bound operating work queue with optimistic concurrency.';
