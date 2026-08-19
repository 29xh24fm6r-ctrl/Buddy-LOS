-- CRM operational completion factory.
-- Completes core record lifecycles, closes direct table writes, and adds the
-- covering indexes required by the production CRM access paths.

revoke insert, update, delete on public.borrowers from authenticated;
grant select on public.borrowers to authenticated;

create index if not exists crm_activities_borrower_fk_idx on public.crm_activities(borrower_id, organization_id);
create index if not exists crm_activities_deal_fk_idx on public.crm_activities(deal_id, organization_id) where deal_id is not null;
create index if not exists crm_activities_created_by_idx on public.crm_activities(created_by);
create index if not exists crm_appointments_borrower_fk_idx on public.crm_appointments(borrower_id, organization_id);
create index if not exists crm_appointments_deal_fk_idx on public.crm_appointments(deal_id, organization_id) where deal_id is not null;
create index if not exists crm_appointments_assignee_fk_idx on public.crm_appointments(organization_id, assigned_to) where assigned_to is not null;
create index if not exists crm_appointments_created_by_idx on public.crm_appointments(created_by);
create index if not exists crm_people_created_by_idx on public.crm_people(created_by);
create index if not exists crm_person_roles_borrower_fk_idx on public.crm_person_company_roles(borrower_id, organization_id);
create index if not exists crm_person_roles_person_fk_idx on public.crm_person_company_roles(person_id, organization_id);
create index if not exists crm_person_roles_created_by_idx on public.crm_person_company_roles(created_by);
create index if not exists crm_person_contacts_person_fk_idx on public.crm_person_contacts(person_id, organization_id);
create index if not exists crm_person_contacts_created_by_idx on public.crm_person_contacts(created_by);
create index if not exists crm_referrals_borrower_fk_idx on public.crm_referrals(borrower_id, organization_id);
create index if not exists crm_referrals_source_borrower_fk_idx on public.crm_referrals(source_borrower_id, organization_id) where source_borrower_id is not null;
create index if not exists crm_referrals_source_person_fk_idx on public.crm_referrals(source_person_id, organization_id) where source_person_id is not null;
create index if not exists crm_referrals_deal_fk_idx on public.crm_referrals(deal_id, organization_id) where deal_id is not null;
create index if not exists crm_referrals_created_by_idx on public.crm_referrals(created_by);

create function public.update_crm_person(
  p_organization_id uuid,
  p_person_id uuid,
  p_idempotency_key text,
  p_expected_version integer,
  p_first_name text,
  p_middle_name text,
  p_last_name text,
  p_preferred_name text,
  p_job_title text,
  p_notes text,
  p_archive boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_borrower_id uuid;
  v_version integer;
  v_prior jsonb;
  v_result jsonb;
begin
  perform public.require_core_operator(p_organization_id);
  if char_length(trim(coalesce(p_idempotency_key, ''))) not between 8 and 160
    or p_expected_version is null or p_expected_version < 1
    or char_length(trim(coalesce(p_first_name, ''))) not between 1 and 100
    or char_length(trim(coalesce(p_last_name, ''))) not between 1 and 100
    or char_length(coalesce(p_notes, '')) > 4000 then
    raise exception using errcode = '22023', message = 'Invalid person update.';
  end if;
  select r.borrower_id into v_borrower_id
  from public.crm_person_company_roles r
  where r.organization_id = p_organization_id and r.person_id = p_person_id and r.ends_on is null
  order by r.is_primary desc, r.created_at limit 1;
  if v_borrower_id is null then raise exception using errcode = '42501', message = 'Person unavailable.'; end if;
  perform private.require_borrower_operator(p_organization_id, v_borrower_id, array['owner','administrator','lender']::public.organization_role[]);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text || ':' || trim(p_idempotency_key), 0));
  select e.payload -> 'result' into v_prior from public.audit_events e
  where e.organization_id = p_organization_id and e.idempotency_key = trim(p_idempotency_key);
  if v_prior is not null then return v_prior || jsonb_build_object('replayed', true); end if;
  select p.version into v_version from public.crm_people p
  where p.organization_id = p_organization_id and p.id = p_person_id and p.archived_at is null for update;
  if v_version is null then raise exception using errcode = '42501', message = 'Person unavailable.'; end if;
  if v_version <> p_expected_version then raise exception using errcode = '40001', message = 'Person version conflict.'; end if;
  update public.crm_people set
    first_name = trim(p_first_name), middle_name = nullif(trim(p_middle_name), ''),
    last_name = trim(p_last_name), preferred_name = nullif(trim(p_preferred_name), ''),
    job_title = nullif(trim(p_job_title), ''), notes = nullif(trim(p_notes), ''),
    archived_at = case when p_archive then now() else null end,
    updated_at = now(), version = version + 1
  where organization_id = p_organization_id and id = p_person_id returning version into v_version;
  if p_archive then
    update public.crm_person_company_roles set ends_on = coalesce(ends_on, current_date), updated_at = now(), version = version + 1
    where organization_id = p_organization_id and person_id = p_person_id and ends_on is null;
    update public.crm_person_contacts set archived_at = coalesce(archived_at, now()), is_primary = false, updated_at = now()
    where organization_id = p_organization_id and person_id = p_person_id and archived_at is null;
  end if;
  v_result := jsonb_build_object('personId', p_person_id, 'version', v_version, 'archived', p_archive, 'replayed', false);
  insert into public.audit_events(organization_id, actor_user_id, event_type, entity_type, entity_id, correlation_id, idempotency_key, payload)
  values(p_organization_id, v_actor, case when p_archive then 'crm.person_archived' else 'crm.person_updated' end,
    'crm_person', p_person_id, gen_random_uuid(), trim(p_idempotency_key), jsonb_build_object('result', v_result, 'borrowerId', v_borrower_id));
  return v_result;
end; $$;

create function public.create_crm_person_contact(
  p_organization_id uuid,
  p_person_id uuid,
  p_idempotency_key text,
  p_contact_kind public.contact_kind,
  p_label text,
  p_value text,
  p_is_primary boolean
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_borrower_id uuid;
  v_id uuid;
  v_prior jsonb;
  v_result jsonb;
begin
  perform public.require_core_operator(p_organization_id);
  if char_length(trim(coalesce(p_idempotency_key, ''))) not between 8 and 160
    or char_length(coalesce(p_label, '')) > 80 then
    raise exception using errcode = '22023', message = 'Invalid person contact command.';
  end if;
  select r.borrower_id into v_borrower_id from public.crm_person_company_roles r
  where r.organization_id = p_organization_id and r.person_id = p_person_id and r.ends_on is null
  order by r.is_primary desc, r.created_at limit 1;
  if v_borrower_id is null then raise exception using errcode = '42501', message = 'Person unavailable.'; end if;
  perform private.require_borrower_operator(p_organization_id, v_borrower_id, array['owner','administrator','lender']::public.organization_role[]);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text || ':' || trim(p_idempotency_key), 0));
  select e.payload -> 'result' into v_prior from public.audit_events e where e.organization_id = p_organization_id and e.idempotency_key = trim(p_idempotency_key);
  if v_prior is not null then return v_prior || jsonb_build_object('replayed', true); end if;
  if p_is_primary then
    update public.crm_person_contacts set is_primary = false, updated_at = now()
    where organization_id = p_organization_id and person_id = p_person_id and contact_kind = p_contact_kind and archived_at is null;
  end if;
  insert into public.crm_person_contacts(organization_id, person_id, contact_kind, label, value, normalized_value, is_primary, created_by)
  values(p_organization_id, p_person_id, p_contact_kind, nullif(trim(p_label), ''), trim(p_value), private.normalize_crm_contact(p_contact_kind, p_value), coalesce(p_is_primary, false), v_actor)
  returning id into v_id;
  v_result := jsonb_build_object('contactId', v_id, 'personId', p_person_id, 'replayed', false);
  insert into public.audit_events(organization_id, actor_user_id, event_type, entity_type, entity_id, correlation_id, idempotency_key, payload)
  values(p_organization_id, v_actor, 'crm.person_contact_created', 'crm_person_contact', v_id, gen_random_uuid(), trim(p_idempotency_key), jsonb_build_object('result', v_result, 'borrowerId', v_borrower_id));
  return v_result;
end; $$;

create function public.update_crm_referral(
  p_organization_id uuid,
  p_referral_id uuid,
  p_idempotency_key text,
  p_expected_version integer,
  p_status public.crm_referral_status,
  p_outcome text,
  p_notes text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid()); v_borrower_id uuid; v_version integer; v_prior jsonb; v_result jsonb;
begin
  perform public.require_core_operator(p_organization_id);
  if char_length(trim(coalesce(p_idempotency_key, ''))) not between 8 and 160 or p_expected_version is null or p_expected_version < 1
    or char_length(coalesce(p_outcome, '')) > 500 or char_length(coalesce(p_notes, '')) > 4000 then
    raise exception using errcode = '22023', message = 'Invalid referral update.';
  end if;
  select r.borrower_id, r.version into v_borrower_id, v_version from public.crm_referrals r
  where r.organization_id = p_organization_id and r.id = p_referral_id for update;
  if v_borrower_id is null then raise exception using errcode = '42501', message = 'Referral unavailable.'; end if;
  perform private.require_borrower_operator(p_organization_id, v_borrower_id, array['owner','administrator','lender']::public.organization_role[]);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text || ':' || trim(p_idempotency_key), 0));
  select e.payload -> 'result' into v_prior from public.audit_events e where e.organization_id = p_organization_id and e.idempotency_key = trim(p_idempotency_key);
  if v_prior is not null then return v_prior || jsonb_build_object('replayed', true); end if;
  if v_version <> p_expected_version then raise exception using errcode = '40001', message = 'Referral version conflict.'; end if;
  update public.crm_referrals set status = p_status, outcome = nullif(trim(p_outcome), ''), notes = nullif(trim(p_notes), ''), updated_at = now(), version = version + 1
  where organization_id = p_organization_id and id = p_referral_id returning version into v_version;
  v_result := jsonb_build_object('referralId', p_referral_id, 'status', p_status, 'version', v_version, 'replayed', false);
  insert into public.audit_events(organization_id, actor_user_id, event_type, entity_type, entity_id, correlation_id, idempotency_key, payload)
  values(p_organization_id, v_actor, 'crm.referral_updated', 'crm_referral', p_referral_id, gen_random_uuid(), trim(p_idempotency_key), jsonb_build_object('result', v_result, 'borrowerId', v_borrower_id));
  return v_result;
end; $$;

create function public.update_crm_appointment(
  p_organization_id uuid,
  p_appointment_id uuid,
  p_idempotency_key text,
  p_expected_version integer,
  p_subject text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_status public.crm_appointment_status,
  p_assigned_to uuid,
  p_location text,
  p_notes text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid()); v_borrower_id uuid; v_version integer; v_prior jsonb; v_result jsonb;
begin
  perform public.require_core_operator(p_organization_id);
  if char_length(trim(coalesce(p_idempotency_key, ''))) not between 8 and 160 or p_expected_version is null or p_expected_version < 1
    or char_length(trim(coalesce(p_subject, ''))) not between 2 and 200 or p_starts_at is null or p_ends_at <= p_starts_at
    or char_length(coalesce(p_location, '')) > 500 or char_length(coalesce(p_notes, '')) > 4000 then
    raise exception using errcode = '22023', message = 'Invalid appointment update.';
  end if;
  if p_assigned_to is not null and not exists(select 1 from public.organization_memberships m where m.organization_id = p_organization_id and m.user_id = p_assigned_to and m.is_active and m.role in ('owner','administrator','lender')) then
    raise exception using errcode = '42501', message = 'Appointment assignee unavailable.';
  end if;
  select a.borrower_id, a.version into v_borrower_id, v_version from public.crm_appointments a
  where a.organization_id = p_organization_id and a.id = p_appointment_id for update;
  if v_borrower_id is null then raise exception using errcode = '42501', message = 'Appointment unavailable.'; end if;
  perform private.require_borrower_operator(p_organization_id, v_borrower_id, array['owner','administrator','lender']::public.organization_role[]);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text || ':' || trim(p_idempotency_key), 0));
  select e.payload -> 'result' into v_prior from public.audit_events e where e.organization_id = p_organization_id and e.idempotency_key = trim(p_idempotency_key);
  if v_prior is not null then return v_prior || jsonb_build_object('replayed', true); end if;
  if v_version <> p_expected_version then raise exception using errcode = '40001', message = 'Appointment version conflict.'; end if;
  update public.crm_appointments set subject = trim(p_subject), starts_at = p_starts_at, ends_at = p_ends_at, status = p_status,
    assigned_to = p_assigned_to, location = nullif(trim(p_location), ''), notes = nullif(trim(p_notes), ''), updated_at = now(), version = version + 1
  where organization_id = p_organization_id and id = p_appointment_id returning version into v_version;
  v_result := jsonb_build_object('appointmentId', p_appointment_id, 'status', p_status, 'version', v_version, 'replayed', false);
  insert into public.audit_events(organization_id, actor_user_id, event_type, entity_type, entity_id, correlation_id, idempotency_key, payload)
  values(p_organization_id, v_actor, 'crm.appointment_updated', 'crm_appointment', p_appointment_id, gen_random_uuid(), trim(p_idempotency_key), jsonb_build_object('result', v_result, 'borrowerId', v_borrower_id));
  return v_result;
end; $$;

revoke all on function public.update_crm_person(uuid,uuid,text,integer,text,text,text,text,text,text,boolean),
  public.create_crm_person_contact(uuid,uuid,text,public.contact_kind,text,text,boolean),
  public.update_crm_referral(uuid,uuid,text,integer,public.crm_referral_status,text,text),
  public.update_crm_appointment(uuid,uuid,text,integer,text,timestamptz,timestamptz,public.crm_appointment_status,uuid,text,text)
from public, anon;
grant execute on function public.update_crm_person(uuid,uuid,text,integer,text,text,text,text,text,text,boolean),
  public.create_crm_person_contact(uuid,uuid,text,public.contact_kind,text,text,boolean),
  public.update_crm_referral(uuid,uuid,text,integer,public.crm_referral_status,text,text),
  public.update_crm_appointment(uuid,uuid,text,integer,text,timestamptz,timestamptz,public.crm_appointment_status,uuid,text,text)
to authenticated;

comment on function public.update_crm_person(uuid,uuid,text,integer,text,text,text,text,text,text,boolean) is 'Governed CRM person edit/archive lifecycle command.';
comment on function public.create_crm_person_contact(uuid,uuid,text,public.contact_kind,text,text,boolean) is 'Governed first-class person contact command.';
comment on function public.update_crm_referral(uuid,uuid,text,integer,public.crm_referral_status,text,text) is 'Governed referral pipeline transition command.';
comment on function public.update_crm_appointment(uuid,uuid,text,integer,text,timestamptz,timestamptz,public.crm_appointment_status,uuid,text,text) is 'Governed appointment reschedule and disposition command.';
