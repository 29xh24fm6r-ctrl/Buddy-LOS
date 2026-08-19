-- Complete the native CRM operating loop: durable borrower ownership, relationship
-- commands, and task completion. Direct table writes remain closed.

create table public.borrower_assignments (
  organization_id uuid not null,
  borrower_id uuid not null,
  user_id uuid not null,
  assignment_role public.deal_assignment_role not null default 'relationship_manager',
  assigned_by uuid not null references auth.users(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  primary key (borrower_id, user_id),
  check (ended_at is null or ended_at >= assigned_at),
  foreign key (borrower_id, organization_id) references public.borrowers(id, organization_id) on delete cascade,
  foreign key (organization_id, user_id) references public.organization_memberships(organization_id, user_id) on delete restrict
);
create index borrower_assignments_user_active_idx on public.borrower_assignments(user_id,organization_id,borrower_id) where ended_at is null;
alter table public.borrower_assignments enable row level security;
revoke all on public.borrower_assignments from public,anon,authenticated;
grant select on public.borrower_assignments to authenticated;
create policy borrower_assignments_read_authorized on public.borrower_assignments for select to authenticated using (
  user_id=(select auth.uid()) or exists(select 1 from public.organization_memberships m where m.organization_id=borrower_assignments.organization_id and m.user_id=(select auth.uid()) and m.is_active and m.role in ('owner','administrator','viewer'))
);

create or replace function private.can_read_borrower(p_organization_id uuid,p_borrower_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.organization_memberships m where m.organization_id=p_organization_id and m.user_id=(select auth.uid()) and m.is_active and (
    m.role in ('owner','administrator','viewer') or
    exists(select 1 from public.borrower_assignments a where a.organization_id=p_organization_id and a.borrower_id=p_borrower_id and a.user_id=(select auth.uid()) and a.ended_at is null) or
    exists(select 1 from public.deals d join public.deal_assignments a on a.organization_id=d.organization_id and a.deal_id=d.id where d.organization_id=p_organization_id and d.borrower_id=p_borrower_id and d.archived_at is null and a.user_id=(select auth.uid()) and a.ended_at is null)
  ));
$$;

create or replace function private.require_borrower_operator(p_organization_id uuid,p_borrower_id uuid,p_roles public.organization_role[])
returns public.organization_role language plpgsql security definer set search_path='' as $$
declare v_role public.organization_role;
begin
  select m.role into v_role from public.organization_memberships m where m.organization_id=p_organization_id and m.user_id=(select auth.uid()) and m.is_active;
  if v_role is null or not(v_role=any(p_roles)) then raise exception using errcode='42501',message='Borrower operation permission denied.'; end if;
  if v_role not in ('owner','administrator') and not private.can_read_borrower(p_organization_id,p_borrower_id) then raise exception using errcode='42501',message='Current borrower assignment required.'; end if;
  return v_role;
end; $$;
revoke all on function private.can_read_borrower(uuid,uuid),private.require_borrower_operator(uuid,uuid,public.organization_role[]) from public,anon;
grant execute on function private.can_read_borrower(uuid,uuid) to authenticated;

drop policy if exists borrowers_read_authorized on public.borrowers;
create policy borrowers_read_authorized on public.borrowers for select to authenticated using(private.can_read_borrower(organization_id,id));
drop policy if exists borrower_contacts_read_authorized on public.borrower_contacts;
create policy borrower_contacts_read_authorized on public.borrower_contacts for select to authenticated using(private.can_read_borrower(organization_id,borrower_id));

alter function public.create_crm_company(uuid,text,text,public.borrower_kind,text) rename to create_crm_company_entitled;
revoke all on function public.create_crm_company_entitled(uuid,text,text,public.borrower_kind,text) from public,anon,authenticated;
create function public.create_crm_company(p_organization_id uuid,p_idempotency_key text,p_legal_name text,p_borrower_kind public.borrower_kind,p_external_reference text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb; v_borrower_id uuid; v_actor uuid:=(select auth.uid());
begin
  v_result:=public.create_crm_company_entitled(p_organization_id,p_idempotency_key,p_legal_name,p_borrower_kind,p_external_reference);
  v_borrower_id:=(v_result->>'borrowerId')::uuid;
  if not exists(select 1 from public.audit_events e where e.organization_id=p_organization_id and e.idempotency_key=trim(p_idempotency_key) and e.actor_user_id=v_actor and e.entity_type='borrower' and e.entity_id=v_borrower_id) then raise exception using errcode='42501',message='Company command belongs to another actor.';end if;
  insert into public.borrower_assignments(organization_id,borrower_id,user_id,assignment_role,assigned_by)
  values(p_organization_id,v_borrower_id,v_actor,'relationship_manager',v_actor)
  on conflict(borrower_id,user_id) do update set ended_at=null,assignment_role='relationship_manager',assigned_by=excluded.assigned_by,assigned_at=now();
  return v_result;
end; $$;

create function public.create_crm_relationship(p_organization_id uuid,p_source_borrower_id uuid,p_target_borrower_id uuid,p_idempotency_key text,p_relationship_kind public.relationship_kind,p_role_label text,p_notes text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=(select auth.uid());v_id uuid;v_prior jsonb;v_result jsonb;
begin
  perform public.require_core_operator(p_organization_id);
  perform private.require_borrower_operator(p_organization_id,p_source_borrower_id,array['owner','administrator','lender']::public.organization_role[]);
  perform private.require_borrower_operator(p_organization_id,p_target_borrower_id,array['owner','administrator','lender']::public.organization_role[]);
  if p_source_borrower_id=p_target_borrower_id or char_length(trim(coalesce(p_idempotency_key,''))) not between 8 and 160 or char_length(coalesce(p_role_label,''))>120 or char_length(coalesce(p_notes,''))>4000 then raise exception using errcode='22023',message='Invalid relationship command.';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text||':'||trim(p_idempotency_key),0));
  select e.payload->'result' into v_prior from public.audit_events e where e.organization_id=p_organization_id and e.idempotency_key=trim(p_idempotency_key);
  if v_prior is not null then return v_prior||jsonb_build_object('replayed',true);end if;
  insert into public.borrower_relationships(organization_id,source_borrower_id,target_borrower_id,relationship_kind,role_label,notes,starts_on,created_by)
  values(p_organization_id,p_source_borrower_id,p_target_borrower_id,p_relationship_kind,nullif(trim(p_role_label),''),nullif(trim(p_notes),''),current_date,v_actor) returning id into v_id;
  v_result:=jsonb_build_object('relationshipId',v_id,'replayed',false);
  insert into public.audit_events(organization_id,actor_user_id,event_type,entity_type,entity_id,correlation_id,idempotency_key,payload) values(p_organization_id,v_actor,'crm.relationship_created','borrower_relationship',v_id,gen_random_uuid(),trim(p_idempotency_key),jsonb_build_object('result',v_result,'sourceBorrowerId',p_source_borrower_id,'targetBorrowerId',p_target_borrower_id));
  return v_result;
end; $$;

create function public.complete_deal_task(p_organization_id uuid,p_task_id uuid,p_idempotency_key text,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=(select auth.uid());v_deal_id uuid;v_version integer;v_status public.deal_task_status;v_prior jsonb;v_result jsonb;
begin
  perform public.require_core_operator(p_organization_id);
  if char_length(trim(coalesce(p_idempotency_key,''))) not between 8 and 160 or p_expected_version is null or p_expected_version<1 then raise exception using errcode='22023',message='Invalid task completion command.';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text||':'||trim(p_idempotency_key),0));
  select e.payload->'result' into v_prior from public.audit_events e where e.organization_id=p_organization_id and e.idempotency_key=trim(p_idempotency_key);
  if v_prior is not null then return v_prior||jsonb_build_object('replayed',true);end if;
  select t.deal_id,t.version,t.status into v_deal_id,v_version,v_status from public.deal_tasks t where t.organization_id=p_organization_id and t.id=p_task_id for update;
  if v_deal_id is null then raise exception using errcode='42501',message='Task unavailable.';end if;
  perform private.require_deal_operator(p_organization_id,v_deal_id,array['owner','administrator','lender']::public.organization_role[]);
  if v_version<>p_expected_version then raise exception using errcode='40001',message='Task version conflict.';end if;
  if v_status<>'open' then raise exception using errcode='22023',message='Only open tasks may be completed.';end if;
  update public.deal_tasks set status='completed',completed_at=now(),updated_at=now(),version=version+1 where organization_id=p_organization_id and id=p_task_id returning version into v_version;
  v_result:=jsonb_build_object('taskId',p_task_id,'status','completed','version',v_version,'replayed',false);
  insert into public.audit_events(organization_id,actor_user_id,event_type,entity_type,entity_id,correlation_id,idempotency_key,payload) values(p_organization_id,v_actor,'deal.task_completed','deal_task',p_task_id,gen_random_uuid(),trim(p_idempotency_key),jsonb_build_object('result',v_result,'dealId',v_deal_id));
  return v_result;
end; $$;

revoke all on function public.create_crm_company(uuid,text,text,public.borrower_kind,text),public.create_crm_relationship(uuid,uuid,uuid,text,public.relationship_kind,text,text),public.complete_deal_task(uuid,uuid,text,integer) from public,anon;
grant execute on function public.create_crm_company(uuid,text,text,public.borrower_kind,text),public.create_crm_relationship(uuid,uuid,uuid,text,public.relationship_kind,text,text),public.complete_deal_task(uuid,uuid,text,integer) to authenticated;

comment on table public.borrower_assignments is 'Direct CRM authority for relationship managers, independent of a loan deal.';
