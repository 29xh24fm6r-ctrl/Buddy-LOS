-- Enforce activation and assignment boundaries at the database authority.
-- No organization is activated by this migration. Absence remains fail-closed.

create type public.product_capability_key as enum (
  'core_operations',
  'document_operations',
  'underwriting_runtime',
  'golden_loan_factory'
);

create table public.organization_capability_activations (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  capability_key public.product_capability_key not null,
  is_active boolean not null default false,
  activated_at timestamptz,
  activated_by uuid references auth.users(id) on delete restrict,
  evidence_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, capability_key),
  check (
    (not is_active and activated_at is null and activated_by is null)
    or
    (is_active and activated_at is not null and activated_by is not null
      and length(trim(evidence_reference)) between 3 and 500)
  )
);

create index organization_capability_activations_active_idx
  on public.organization_capability_activations (organization_id, capability_key)
  where is_active;

alter table public.organization_capability_activations enable row level security;
revoke all on public.organization_capability_activations from public, anon, authenticated;
grant select on public.organization_capability_activations to authenticated;

create policy "capability_activations_admin_read"
  on public.organization_capability_activations
  for select to authenticated
  using (
    exists (
      select 1 from public.organization_memberships membership
      where membership.organization_id = organization_capability_activations.organization_id
        and membership.user_id = (select auth.uid())
        and membership.is_active
        and membership.role in ('owner', 'administrator')
    )
  );

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create function private.has_active_capability(
  p_organization_id uuid,
  p_capability public.product_capability_key
) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_capability_activations activation
    where activation.organization_id = p_organization_id
      and activation.capability_key = p_capability
      and activation.is_active
  );
$$;

create function private.can_read_deal(p_organization_id uuid, p_deal_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = p_organization_id
      and membership.user_id = (select auth.uid())
      and membership.is_active
      and (
        membership.role in ('owner', 'administrator', 'viewer')
        or exists (
          select 1 from public.deal_assignments assignment
          where assignment.organization_id = p_organization_id
            and assignment.deal_id = p_deal_id
            and assignment.user_id = (select auth.uid())
            and assignment.ended_at is null
        )
      )
  );
$$;

create function private.can_read_borrower(p_organization_id uuid, p_borrower_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = p_organization_id
      and membership.user_id = (select auth.uid())
      and membership.is_active
      and (
        membership.role in ('owner', 'administrator', 'viewer')
        or exists (
          select 1
          from public.deals deal
          join public.deal_assignments assignment
            on assignment.organization_id = deal.organization_id
           and assignment.deal_id = deal.id
          where deal.organization_id = p_organization_id
            and deal.borrower_id = p_borrower_id
            and deal.archived_at is null
            and assignment.user_id = (select auth.uid())
            and assignment.ended_at is null
        )
      )
  );
$$;

grant execute on function private.can_read_deal(uuid, uuid) to authenticated;
grant execute on function private.can_read_borrower(uuid, uuid) to authenticated;
revoke all on function private.has_active_capability(uuid, public.product_capability_key)
  from public, anon, authenticated;

create function private.require_capability(
  p_organization_id uuid,
  p_capability public.product_capability_key
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.has_active_capability(p_organization_id, p_capability) then
    raise exception using errcode = '42501', message = 'Product capability is not active for this organization.';
  end if;
end;
$$;

create function private.require_deal_operator(
  p_organization_id uuid,
  p_deal_id uuid,
  p_roles public.organization_role[]
) returns public.organization_role
language plpgsql security definer set search_path = ''
as $$
declare v_role public.organization_role;
begin
  select membership.role into v_role
  from public.organization_memberships membership
  where membership.organization_id = p_organization_id
    and membership.user_id = (select auth.uid())
    and membership.is_active;

  if v_role is null or not (v_role = any(p_roles)) then
    raise exception using errcode = '42501', message = 'Deal operation permission denied.';
  end if;
  if v_role not in ('owner', 'administrator') and not exists (
    select 1 from public.deal_assignments assignment
    where assignment.organization_id = p_organization_id
      and assignment.deal_id = p_deal_id
      and assignment.user_id = (select auth.uid())
      and assignment.ended_at is null
  ) then
    raise exception using errcode = '42501', message = 'Current deal assignment required.';
  end if;
  return v_role;
end;
$$;

create function private.require_borrower_operator(
  p_organization_id uuid,
  p_borrower_id uuid,
  p_roles public.organization_role[]
) returns public.organization_role
language plpgsql security definer set search_path = ''
as $$
declare v_role public.organization_role;
begin
  select membership.role into v_role
  from public.organization_memberships membership
  where membership.organization_id = p_organization_id
    and membership.user_id = (select auth.uid())
    and membership.is_active;
  if v_role is null or not (v_role = any(p_roles)) then
    raise exception using errcode = '42501', message = 'Borrower operation permission denied.';
  end if;
  if v_role not in ('owner', 'administrator') and not exists (
    select 1
    from public.deals deal
    join public.deal_assignments assignment
      on assignment.organization_id = deal.organization_id
     and assignment.deal_id = deal.id
    where deal.organization_id = p_organization_id
      and deal.borrower_id = p_borrower_id
      and deal.archived_at is null
      and assignment.user_id = (select auth.uid())
      and assignment.ended_at is null
  ) then
    raise exception using errcode = '42501', message = 'Current borrower assignment required.';
  end if;
  return v_role;
end;
$$;

revoke all on function private.require_capability(uuid, public.product_capability_key),
  private.require_deal_operator(uuid, uuid, public.organization_role[]),
  private.require_borrower_operator(uuid, uuid, public.organization_role[])
  from public, anon, authenticated;

-- Replace membership-wide downstream reads with the canonical deal authority.
drop policy if exists "crm_activities_read_member" on public.crm_activities;
create policy "crm_activities_read_authorized" on public.crm_activities
  for select to authenticated using (
    case when deal_id is not null
      then private.can_read_deal(organization_id, deal_id)
      else private.can_read_borrower(organization_id, borrower_id)
    end
  );

drop policy if exists "deal_tasks_read_member" on public.deal_tasks;
create policy "deal_tasks_read_authorized" on public.deal_tasks
  for select to authenticated using (private.can_read_deal(organization_id, deal_id));

drop policy if exists "borrower_relationships_read_member" on public.borrower_relationships;
create policy "borrower_relationships_read_authorized" on public.borrower_relationships
  for select to authenticated using (private.can_read_borrower(organization_id, source_borrower_id));

drop policy if exists "deal_assignments_read_member" on public.deal_assignments;
create policy "deal_assignments_read_authorized" on public.deal_assignments
  for select to authenticated using (private.can_read_deal(organization_id, deal_id));

drop policy if exists "audit_events_read_member" on public.audit_events;
create policy "audit_events_read_elevated" on public.audit_events
  for select to authenticated using (
    exists (
      select 1 from public.organization_memberships membership
      where membership.organization_id = audit_events.organization_id
        and membership.user_id = (select auth.uid())
        and membership.is_active
        and membership.role in ('owner', 'administrator', 'viewer')
    )
  );

drop policy if exists "applications_read_member" on public.loan_applications;
create policy "applications_read_authorized" on public.loan_applications
  for select to authenticated using (
    exists (
      select 1 from public.deals deal
      where deal.organization_id = loan_applications.organization_id
        and deal.application_id = loan_applications.id
        and private.can_read_deal(deal.organization_id, deal.id)
    )
  );

drop policy if exists "credit_memos_read" on public.credit_memos;
create policy "credit_memos_read_authorized" on public.credit_memos
  for select to authenticated using (private.can_read_deal(organization_id, deal_id));
drop policy if exists "credit_conditions_read" on public.credit_conditions;
create policy "credit_conditions_read_authorized" on public.credit_conditions
  for select to authenticated using (private.can_read_deal(organization_id, deal_id));
drop policy if exists "credit_committee_votes_read" on public.credit_committee_votes;
create policy "credit_committee_votes_read_authorized" on public.credit_committee_votes
  for select to authenticated using (private.can_read_deal(organization_id, deal_id));
drop policy if exists "credit_decisions_read" on public.credit_decisions;
create policy "credit_decisions_read_authorized" on public.credit_decisions
  for select to authenticated using (private.can_read_deal(organization_id, deal_id));

drop policy if exists closing_read_member on public.closing_requirements;
create policy closing_read_authorized on public.closing_requirements
  for select to authenticated using (private.can_read_deal(organization_id, deal_id));
drop policy if exists funding_read_member on public.funding_authorizations;
create policy funding_read_authorized on public.funding_authorizations
  for select to authenticated using (private.can_read_deal(organization_id, deal_id));
drop policy if exists servicing_read_member on public.servicing_accounts;
create policy servicing_read_authorized on public.servicing_accounts
  for select to authenticated using (private.can_read_deal(organization_id, deal_id));
drop policy if exists covenant_read_member on public.portfolio_covenants;
create policy covenant_read_authorized on public.portfolio_covenants
  for select to authenticated using (
    exists (
      select 1 from public.servicing_accounts account
      where account.id = portfolio_covenants.servicing_account_id
        and account.organization_id = portfolio_covenants.organization_id
        and private.can_read_deal(account.organization_id, account.deal_id)
    )
  );
drop policy if exists risk_read_member on public.portfolio_risk_history;
create policy risk_read_authorized on public.portfolio_risk_history
  for select to authenticated using (
    exists (
      select 1 from public.servicing_accounts account
      where account.id = portfolio_risk_history.servicing_account_id
        and account.organization_id = portfolio_risk_history.organization_id
        and private.can_read_deal(account.organization_id, account.deal_id)
    )
  );

-- Core commands require both entitlement and explicit runtime activation.
create or replace function public.require_core_operator(p_organization_id uuid)
returns public.organization_role
language plpgsql security definer set search_path = ''
as $$
declare v_role public.organization_role;
begin
  perform public.require_core_operations_entitlement(p_organization_id);
  perform private.require_capability(p_organization_id, 'core_operations');
  select membership.role into v_role
  from public.organization_memberships membership
  where membership.organization_id = p_organization_id
    and membership.user_id = (select auth.uid()) and membership.is_active;
  if v_role is null or v_role not in ('owner', 'administrator', 'lender') then
    raise exception using errcode = '42501', message = 'Core operation permission denied.';
  end if;
  return v_role;
end;
$$;

alter function public.create_crm_contact(uuid,uuid,text,public.contact_kind,text,text,boolean)
  rename to create_crm_contact_entitled;
revoke all on function public.create_crm_contact_entitled(uuid,uuid,text,public.contact_kind,text,text,boolean)
  from public, anon, authenticated;
create function public.create_crm_contact(p_organization_id uuid,p_borrower_id uuid,p_idempotency_key text,p_contact_kind public.contact_kind,p_label text,p_value text,p_is_primary boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_borrower_operator(p_organization_id,p_borrower_id,array['owner','administrator','lender']::public.organization_role[]);
  return public.create_crm_contact_entitled(p_organization_id,p_borrower_id,p_idempotency_key,p_contact_kind,p_label,p_value,p_is_primary);
end; $$;

alter function public.log_crm_activity(uuid,uuid,uuid,text,public.crm_activity_kind,text,timestamptz,text)
  rename to log_crm_activity_entitled;
revoke all on function public.log_crm_activity_entitled(uuid,uuid,uuid,text,public.crm_activity_kind,text,timestamptz,text)
  from public, anon, authenticated;
create function public.log_crm_activity(p_organization_id uuid,p_borrower_id uuid,p_deal_id uuid,p_idempotency_key text,p_activity_kind public.crm_activity_kind,p_subject text,p_occurred_at timestamptz,p_notes text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_deal_id is null then
    perform private.require_borrower_operator(p_organization_id,p_borrower_id,array['owner','administrator','lender']::public.organization_role[]);
  else
    perform private.require_deal_operator(p_organization_id,p_deal_id,array['owner','administrator','lender']::public.organization_role[]);
  end if;
  return public.log_crm_activity_entitled(p_organization_id,p_borrower_id,p_deal_id,p_idempotency_key,p_activity_kind,p_subject,p_occurred_at,p_notes);
end; $$;

alter function public.create_deal_task(uuid,uuid,text,text,text,timestamptz,uuid)
  rename to create_deal_task_entitled;
revoke all on function public.create_deal_task_entitled(uuid,uuid,text,text,text,timestamptz,uuid)
  from public, anon, authenticated;
create function public.create_deal_task(p_organization_id uuid,p_deal_id uuid,p_idempotency_key text,p_title text,p_description text,p_due_at timestamptz,p_assigned_to uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_deal_operator(p_organization_id,p_deal_id,array['owner','administrator','lender']::public.organization_role[]);
  return public.create_deal_task_entitled(p_organization_id,p_deal_id,p_idempotency_key,p_title,p_description,p_due_at,p_assigned_to);
end; $$;

alter function public.transition_deal_stage(uuid,uuid,text,integer,public.deal_stage)
  rename to transition_deal_stage_entitled;
revoke all on function public.transition_deal_stage_entitled(uuid,uuid,text,integer,public.deal_stage)
  from public, anon, authenticated;
create function public.transition_deal_stage(p_organization_id uuid,p_deal_id uuid,p_idempotency_key text,p_expected_version integer,p_target_stage public.deal_stage)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_deal_operator(p_organization_id,p_deal_id,array['owner','administrator','lender']::public.organization_role[]);
  return public.transition_deal_stage_entitled(p_organization_id,p_deal_id,p_idempotency_key,p_expected_version,p_target_stage);
end; $$;

revoke all on function public.create_crm_contact(uuid,uuid,text,public.contact_kind,text,text,boolean),
  public.log_crm_activity(uuid,uuid,uuid,text,public.crm_activity_kind,text,timestamptz,text),
  public.create_deal_task(uuid,uuid,text,text,text,timestamptz,uuid),
  public.transition_deal_stage(uuid,uuid,text,integer,public.deal_stage)
  from public, anon, authenticated;
grant execute on function public.create_crm_contact(uuid,uuid,text,public.contact_kind,text,text,boolean),
  public.log_crm_activity(uuid,uuid,uuid,text,public.crm_activity_kind,text,timestamptz,text),
  public.create_deal_task(uuid,uuid,text,text,text,timestamptz,uuid),
  public.transition_deal_stage(uuid,uuid,text,integer,public.deal_stage)
  to authenticated;

alter function public.create_loan_intake(uuid,text,text,public.borrower_kind,text,text,text,text,text,numeric,date)
  rename to create_loan_intake_entitled;
revoke all on function public.create_loan_intake_entitled(uuid,text,text,public.borrower_kind,text,text,text,text,text,numeric,date)
  from public, anon, authenticated;
create function public.create_loan_intake(p_organization_id uuid,p_idempotency_key text,p_borrower_legal_name text,p_borrower_kind public.borrower_kind,p_borrower_email text,p_borrower_phone text,p_deal_name text,p_product_type text,p_purpose text,p_requested_amount numeric,p_expected_close_date date)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_capability(p_organization_id,'core_operations');
  return public.create_loan_intake_entitled(p_organization_id,p_idempotency_key,p_borrower_legal_name,p_borrower_kind,p_borrower_email,p_borrower_phone,p_deal_name,p_product_type,p_purpose,p_requested_amount,p_expected_close_date);
end; $$;
revoke all on function public.create_loan_intake(uuid,text,text,public.borrower_kind,text,text,text,text,text,numeric,date) from public,anon,authenticated;
grant execute on function public.create_loan_intake(uuid,text,text,public.borrower_kind,text,text,text,text,text,numeric,date) to authenticated;

-- Document and underwriting RPCs cannot bypass the database activation state.
alter function public.prepare_document_upload_v2(uuid,uuid,uuid,uuid,text,text,bigint,text)
  rename to prepare_document_upload_v2_entitled;
revoke all on function public.prepare_document_upload_v2_entitled(uuid,uuid,uuid,uuid,text,text,bigint,text) from public,anon,authenticated;
create function public.prepare_document_upload_v2(p_organization_id uuid,p_deal_id uuid,p_requirement_id uuid,p_logical_document_id uuid,p_original_file_name text,p_mime_type text,p_size_bytes bigint,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$begin
  perform private.require_capability(p_organization_id,'document_operations');
  return public.prepare_document_upload_v2_entitled(p_organization_id,p_deal_id,p_requirement_id,p_logical_document_id,p_original_file_name,p_mime_type,p_size_bytes,p_idempotency_key);
end$$;

alter function public.authorize_pending_document_finalize(uuid,uuid)
  rename to authorize_pending_document_finalize_entitled;
revoke all on function public.authorize_pending_document_finalize_entitled(uuid,uuid) from public,anon,authenticated;
create function public.authorize_pending_document_finalize(p_organization_id uuid,p_document_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$begin
  perform private.require_capability(p_organization_id,'document_operations');
  return public.authorize_pending_document_finalize_entitled(p_organization_id,p_document_id);
end$$;

alter function public.authorize_clean_document_access(uuid,uuid,text,integer,text,text)
  rename to authorize_clean_document_access_entitled;
revoke all on function public.authorize_clean_document_access_entitled(uuid,uuid,text,integer,text,text) from public,anon,authenticated;
create function public.authorize_clean_document_access(p_organization_id uuid,p_document_id uuid,p_access_kind text,p_requested_ttl_seconds integer,p_reason text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$begin
  perform private.require_capability(p_organization_id,'document_operations');
  return public.authorize_clean_document_access_entitled(p_organization_id,p_document_id,p_access_kind,p_requested_ttl_seconds,p_reason,p_idempotency_key);
end$$;

alter function public.govern_document_retention(uuid,uuid,date,boolean,text,text)
  rename to govern_document_retention_entitled;
revoke all on function public.govern_document_retention_entitled(uuid,uuid,date,boolean,text,text) from public,anon,authenticated;
create function public.govern_document_retention(p_organization_id uuid,p_document_id uuid,p_retained_until date,p_legal_hold boolean,p_reason text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$begin
  perform private.require_capability(p_organization_id,'document_operations');
  return public.govern_document_retention_entitled(p_organization_id,p_document_id,p_retained_until,p_legal_hold,p_reason,p_idempotency_key);
end$$;

revoke all on function public.prepare_document_upload_v2(uuid,uuid,uuid,uuid,text,text,bigint,text),
  public.authorize_pending_document_finalize(uuid,uuid),
  public.authorize_clean_document_access(uuid,uuid,text,integer,text,text),
  public.govern_document_retention(uuid,uuid,date,boolean,text,text)
  from public, anon, authenticated;
grant execute on function public.prepare_document_upload_v2(uuid,uuid,uuid,uuid,text,text,bigint,text),
  public.authorize_pending_document_finalize(uuid,uuid),
  public.authorize_clean_document_access(uuid,uuid,text,integer,text,text),
  public.govern_document_retention(uuid,uuid,date,boolean,text,text)
  to authenticated;

alter function public.request_underwriting_job(uuid,uuid,uuid[],text)
  rename to request_underwriting_job_entitled;
revoke all on function public.request_underwriting_job_entitled(uuid,uuid,uuid[],text) from public,anon,authenticated;
create function public.request_underwriting_job(p_organization_id uuid,p_deal_id uuid,p_document_ids uuid[],p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$begin
  perform private.require_capability(p_organization_id,'underwriting_runtime');
  return public.request_underwriting_job_entitled(p_organization_id,p_deal_id,p_document_ids,p_idempotency_key);
end$$;
revoke all on function public.request_underwriting_job(uuid,uuid,uuid[],text) from public,anon,authenticated;
grant execute on function public.request_underwriting_job(uuid,uuid,uuid[],text) to authenticated;

-- The internal golden-loan factory requires explicit database activation.
create or replace function public.require_golden_loan_operator(p_organization_id uuid,p_roles public.organization_role[])
returns public.organization_role language plpgsql security definer set search_path='' as $$
declare v_role public.organization_role;
begin
  perform private.require_capability(p_organization_id,'golden_loan_factory');
  select membership.role into v_role from public.organization_memberships membership
  where membership.organization_id=p_organization_id and membership.user_id=(select auth.uid()) and membership.is_active;
  if v_role is null or not(v_role=any(p_roles)) then raise exception using errcode='42501',message='Golden-loan operation permission denied.'; end if;
  if not exists(select 1 from public.organization_product_modules module where module.organization_id=p_organization_id and module.module_key='underwriting' and module.status in('trial','active') and module.starts_at<=now() and(module.ends_at is null or module.ends_at>now())) then raise exception using errcode='42501',message='Underwriting entitlement required.'; end if;
  return v_role;
end$$;

create or replace function public.require_lifecycle_operator(p_organization_id uuid,p_roles public.organization_role[])
returns public.organization_role language plpgsql security definer set search_path='' as $$
declare v_role public.organization_role;
begin
  perform private.require_capability(p_organization_id,'golden_loan_factory');
  select membership.role into v_role from public.organization_memberships membership where membership.organization_id=p_organization_id and membership.user_id=(select auth.uid()) and membership.is_active;
  if v_role is null or not(v_role=any(p_roles)) then raise exception using errcode='42501',message='Lifecycle operation permission denied.'; end if;
  return v_role;
end$$;

-- Prevent the previously public lower-level funding path from bypassing the factory wrapper.
revoke execute on function public.authorize_deal_funding(uuid,uuid,uuid,numeric,text,text),
  public.board_funded_deal(uuid,uuid,text,date,text) from authenticated;

-- Correct closing prerequisites and make resolution retry-safe.
alter function public.create_closing_requirement(uuid,uuid,text,timestamptz,boolean,text)
  rename to create_closing_requirement_legacy;
revoke all on function public.create_closing_requirement_legacy(uuid,uuid,text,timestamptz,boolean,text) from public,anon,authenticated;
create function public.create_closing_requirement(p_organization_id uuid,p_deal_id uuid,p_title text,p_due_at timestamptz,p_required boolean,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=(select auth.uid());v_id uuid;v_result jsonb;v_stage public.deal_stage;
begin
  perform public.require_golden_loan_operator(p_organization_id,array['owner','administrator','closer']::public.organization_role[]);
  perform private.require_deal_operator(p_organization_id,p_deal_id,array['owner','administrator','closer']::public.organization_role[]);
  if length(trim(coalesce(p_title,''))) not between 2 and 200 or length(trim(coalesce(p_idempotency_key,''))) not between 8 and 160 then raise exception using errcode='22023',message='Invalid closing requirement.';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text||':'||trim(p_idempotency_key),0));
  select event.payload->'result' into v_result from public.audit_events event where event.organization_id=p_organization_id and event.idempotency_key='closing-create:'||trim(p_idempotency_key);
  if v_result is not null then return v_result||jsonb_build_object('replayed',true);end if;
  select deal.stage into v_stage from public.deals deal where deal.id=p_deal_id and deal.organization_id=p_organization_id and deal.archived_at is null for update;
  if v_stage is null then raise exception using errcode='42501',message='Deal unavailable.';end if;
  if v_stage not in('credit_approval','commitment','closing') then raise exception using errcode='23514',message='Approved credit or commitment stage required for closing.';end if;
  insert into public.closing_requirements(organization_id,deal_id,title,due_at,is_required,created_by) values(p_organization_id,p_deal_id,trim(p_title),p_due_at,p_required,v_actor) returning id into v_id;
  update public.deals set stage='closing',updated_at=now(),version=version+1 where id=p_deal_id and organization_id=p_organization_id;
  v_result:=jsonb_build_object('requirementId',v_id,'dealId',p_deal_id,'replayed',false);
  insert into public.audit_events(organization_id,actor_user_id,event_type,entity_type,entity_id,correlation_id,idempotency_key,payload) values(p_organization_id,v_actor,'closing.requirement_created','closing_requirement',v_id,gen_random_uuid(),'closing-create:'||trim(p_idempotency_key),jsonb_build_object('result',v_result));
  return v_result;
end$$;

alter function public.resolve_closing_requirement(uuid,uuid,public.lifecycle_item_status,text,text)
  rename to resolve_closing_requirement_legacy;
revoke all on function public.resolve_closing_requirement_legacy(uuid,uuid,public.lifecycle_item_status,text,text) from public,anon,authenticated;
create function public.resolve_closing_requirement(p_organization_id uuid,p_requirement_id uuid,p_status public.lifecycle_item_status,p_rationale text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=(select auth.uid());v_deal uuid;v_result jsonb;
begin
  perform public.require_golden_loan_operator(p_organization_id,array['owner','administrator','closer']::public.organization_role[]);
  if p_status='open' or length(trim(coalesce(p_rationale,'')))<3 or length(trim(coalesce(p_idempotency_key,''))) not between 8 and 160 then raise exception using errcode='22023',message='Invalid closing resolution.';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text||':'||trim(p_idempotency_key),0));
  select event.payload->'result' into v_result from public.audit_events event where event.organization_id=p_organization_id and event.idempotency_key='closing-resolve:'||trim(p_idempotency_key);
  if v_result is not null then return v_result||jsonb_build_object('replayed',true);end if;
  select requirement.deal_id into v_deal from public.closing_requirements requirement where requirement.id=p_requirement_id and requirement.organization_id=p_organization_id and requirement.status='open' for update;
  if v_deal is null then raise exception using errcode='23514',message='Open closing requirement required.';end if;
  perform private.require_deal_operator(p_organization_id,v_deal,array['owner','administrator','closer']::public.organization_role[]);
  update public.closing_requirements set status=p_status,resolution_rationale=trim(p_rationale),resolved_by=v_actor,resolved_at=now() where id=p_requirement_id and organization_id=p_organization_id;
  v_result:=jsonb_build_object('requirementId',p_requirement_id,'dealId',v_deal,'status',p_status,'replayed',false);
  insert into public.audit_events(organization_id,actor_user_id,event_type,entity_type,entity_id,correlation_id,idempotency_key,payload) values(p_organization_id,v_actor,'closing.requirement_resolved','closing_requirement',p_requirement_id,gen_random_uuid(),'closing-resolve:'||trim(p_idempotency_key),jsonb_build_object('result',v_result,'rationale',trim(p_rationale)));
  return v_result;
end$$;

revoke all on function public.create_closing_requirement(uuid,uuid,text,timestamptz,boolean,text),
  public.resolve_closing_requirement(uuid,uuid,public.lifecycle_item_status,text,text)
  from public, anon, authenticated;
grant execute on function public.create_closing_requirement(uuid,uuid,text,timestamptz,boolean,text),
  public.resolve_closing_requirement(uuid,uuid,public.lifecycle_item_status,text,text) to authenticated;

-- Existing golden-loan commands are SECURITY DEFINER. Wrap every deal-scoped
-- command so its object reference is authorized before the legacy body runs.
alter function public.certify_credit_memo(uuid,uuid,uuid,text,text) rename to certify_credit_memo_entitled;
alter function public.record_credit_committee_vote(uuid,uuid,uuid,text,text) rename to record_credit_committee_vote_entitled;
alter function public.record_human_credit_decision(uuid,uuid,uuid,public.credit_decision_type,text,text) rename to record_human_credit_decision_entitled;
alter function public.create_credit_condition(uuid,uuid,uuid,text,timestamptz,text) rename to create_credit_condition_entitled;
alter function public.create_portfolio_covenant(uuid,uuid,text,date,text) rename to create_portfolio_covenant_entitled;
alter function public.golden_authorize_deal_funding(uuid,uuid,uuid,numeric,text,text) rename to golden_authorize_deal_funding_entitled;
alter function public.golden_board_funded_deal(uuid,uuid,text,date,text) rename to golden_board_funded_deal_entitled;

revoke all on function public.certify_credit_memo_entitled(uuid,uuid,uuid,text,text),
  public.record_credit_committee_vote_entitled(uuid,uuid,uuid,text,text),
  public.record_human_credit_decision_entitled(uuid,uuid,uuid,public.credit_decision_type,text,text),
  public.create_credit_condition_entitled(uuid,uuid,uuid,text,timestamptz,text),
  public.create_portfolio_covenant_entitled(uuid,uuid,text,date,text),
  public.golden_authorize_deal_funding_entitled(uuid,uuid,uuid,numeric,text,text),
  public.golden_board_funded_deal_entitled(uuid,uuid,text,date,text) from public,anon,authenticated;

create function public.certify_credit_memo(p_organization_id uuid,p_deal_id uuid,p_memo_id uuid,p_statement text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$ begin
  perform private.require_deal_operator(p_organization_id,p_deal_id,array['owner','administrator','underwriter']::public.organization_role[]);
  return public.certify_credit_memo_entitled(p_organization_id,p_deal_id,p_memo_id,p_statement,p_idempotency_key);
end $$;
create function public.record_credit_committee_vote(p_organization_id uuid,p_deal_id uuid,p_memo_id uuid,p_vote text,p_rationale text)
returns jsonb language plpgsql security definer set search_path='' as $$ begin
  perform private.require_deal_operator(p_organization_id,p_deal_id,array['owner','administrator','underwriter']::public.organization_role[]);
  return public.record_credit_committee_vote_entitled(p_organization_id,p_deal_id,p_memo_id,p_vote,p_rationale);
end $$;
create function public.record_human_credit_decision(p_organization_id uuid,p_deal_id uuid,p_memo_id uuid,p_decision public.credit_decision_type,p_rationale text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$ begin
  perform private.require_deal_operator(p_organization_id,p_deal_id,array['owner','administrator','underwriter']::public.organization_role[]);
  return public.record_human_credit_decision_entitled(p_organization_id,p_deal_id,p_memo_id,p_decision,p_rationale,p_idempotency_key);
end $$;
create function public.create_credit_condition(p_organization_id uuid,p_deal_id uuid,p_memo_id uuid,p_description text,p_due_at timestamptz,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$ begin
  perform private.require_deal_operator(p_organization_id,p_deal_id,array['owner','administrator','underwriter']::public.organization_role[]);
  return public.create_credit_condition_entitled(p_organization_id,p_deal_id,p_memo_id,p_description,p_due_at,p_idempotency_key);
end $$;
create function public.create_portfolio_covenant(p_organization_id uuid,p_servicing_account_id uuid,p_title text,p_due_date date,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_deal_id uuid;
begin
  select s.deal_id into v_deal_id from public.servicing_accounts s
  where s.id=p_servicing_account_id and s.organization_id=p_organization_id;
  if v_deal_id is null then raise exception using errcode='42501',message='Assigned servicing account required.'; end if;
  perform private.require_deal_operator(p_organization_id,v_deal_id,array['owner','administrator','lender','underwriter']::public.organization_role[]);
  return public.create_portfolio_covenant_entitled(p_organization_id,p_servicing_account_id,p_title,p_due_date,p_idempotency_key);
end $$;
create function public.golden_authorize_deal_funding(p_organization_id uuid,p_deal_id uuid,p_decision_id uuid,p_amount numeric,p_evidence_reference text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$ begin
  perform private.require_deal_operator(p_organization_id,p_deal_id,array['owner','administrator','closer']::public.organization_role[]);
  return public.golden_authorize_deal_funding_entitled(p_organization_id,p_deal_id,p_decision_id,p_amount,p_evidence_reference,p_idempotency_key);
end $$;
create function public.golden_board_funded_deal(p_organization_id uuid,p_deal_id uuid,p_account_number text,p_next_review_date date,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$ begin
  perform private.require_deal_operator(p_organization_id,p_deal_id,array['owner','administrator','closer']::public.organization_role[]);
  return public.golden_board_funded_deal_entitled(p_organization_id,p_deal_id,p_account_number,p_next_review_date,p_idempotency_key);
end $$;

revoke all on function public.certify_credit_memo(uuid,uuid,uuid,text,text),
  public.record_credit_committee_vote(uuid,uuid,uuid,text,text),
  public.record_human_credit_decision(uuid,uuid,uuid,public.credit_decision_type,text,text),
  public.create_credit_condition(uuid,uuid,uuid,text,timestamptz,text),
  public.create_portfolio_covenant(uuid,uuid,text,date,text),
  public.golden_authorize_deal_funding(uuid,uuid,uuid,numeric,text,text),
  public.golden_board_funded_deal(uuid,uuid,text,date,text) from public,anon,authenticated;
grant execute on function public.certify_credit_memo(uuid,uuid,uuid,text,text),
  public.record_credit_committee_vote(uuid,uuid,uuid,text,text),
  public.record_human_credit_decision(uuid,uuid,uuid,public.credit_decision_type,text,text),
  public.create_credit_condition(uuid,uuid,uuid,text,timestamptz,text),
  public.create_portfolio_covenant(uuid,uuid,text,date,text),
  public.golden_authorize_deal_funding(uuid,uuid,uuid,numeric,text,text),
  public.golden_board_funded_deal(uuid,uuid,text,date,text) to authenticated;

comment on table public.organization_capability_activations is
  'Database-authoritative runtime activation. Entitlement or deployment alone never implies active customer use.';
