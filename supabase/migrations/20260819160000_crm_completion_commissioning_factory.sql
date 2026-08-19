-- CRM completion and commissioning factory.
-- Converges borrower authority, adds first-class people/referral/calendar records,
-- closes lifecycle gaps, and keeps all Data API writes behind governed commands.

create or replace function private.is_valid_timezone(p_timezone text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from pg_catalog.pg_timezone_names() z where z.name = p_timezone);
$$;
revoke all on function private.is_valid_timezone(text) from public, anon, authenticated;

update public.organizations set timezone = 'America/New_York'
where not private.is_valid_timezone(timezone);
alter table public.organizations drop constraint if exists organizations_timezone_valid;
alter table public.organizations add constraint organizations_timezone_valid
  check (private.is_valid_timezone(timezone));

alter table public.borrower_contacts add column if not exists normalized_value text;
alter table public.borrower_contacts add column if not exists archived_at timestamptz;
alter table public.borrower_contacts add column if not exists version integer not null default 1 check (version > 0);

create or replace function private.normalize_crm_contact(p_kind public.contact_kind, p_value text)
returns text language plpgsql immutable set search_path = '' as $$
declare v_value text := trim(coalesce(p_value, ''));
begin
  if p_kind = 'email' then
    v_value := lower(v_value);
    if v_value !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      raise exception using errcode = '22023', message = 'Invalid email contact.';
    end if;
  elsif p_kind = 'website' then
    v_value := lower(regexp_replace(v_value, '/+$', ''));
    if v_value !~ '^https?://[^[:space:]]+$' then
      raise exception using errcode = '22023', message = 'Invalid website contact.';
    end if;
  elsif p_kind = 'phone' then
    v_value := regexp_replace(v_value, '[^0-9+]', '', 'g');
    if v_value !~ '^\+?[0-9]{7,15}$' then
      raise exception using errcode = '22023', message = 'Invalid phone contact.';
    end if;
  elsif char_length(v_value) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'Invalid contact value.';
  end if;
  return v_value;
end;
$$;
revoke all on function private.normalize_crm_contact(public.contact_kind, text) from public, anon, authenticated;

create or replace function private.prepare_borrower_contact()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.value := trim(new.value);
  new.normalized_value := private.normalize_crm_contact(new.contact_kind, new.value);
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.prepare_borrower_contact() from public, anon, authenticated;

update public.borrower_contacts
set normalized_value = case
  when contact_kind = 'email' then lower(trim(value))
  when contact_kind = 'website' then lower(regexp_replace(trim(value), '/+$', ''))
  when contact_kind = 'phone' then regexp_replace(trim(value), '[^0-9+]', '', 'g')
  else trim(value)
end
where normalized_value is null;
drop trigger if exists borrower_contacts_prepare on public.borrower_contacts;
create trigger borrower_contacts_prepare before insert or update of contact_kind, value
on public.borrower_contacts for each row execute function private.prepare_borrower_contact();
create index if not exists borrower_contacts_normalized_idx
on public.borrower_contacts(organization_id, normalized_value) where archived_at is null;
drop index if exists public.borrower_contacts_one_primary_kind_idx;
create unique index borrower_contacts_one_primary_kind_idx
on public.borrower_contacts(organization_id, borrower_id, contact_kind) where is_primary and archived_at is null;

create table public.crm_people (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  first_name text not null check (char_length(trim(first_name)) between 1 and 100),
  middle_name text check (middle_name is null or char_length(trim(middle_name)) between 1 and 100),
  last_name text not null check (char_length(trim(last_name)) between 1 and 100),
  preferred_name text check (preferred_name is null or char_length(trim(preferred_name)) between 1 and 100),
  job_title text check (job_title is null or char_length(trim(job_title)) between 1 and 160),
  notes text check (notes is null or char_length(notes) <= 4000),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  version integer not null default 1 check (version > 0),
  unique (id, organization_id)
);

create table public.crm_person_company_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  person_id uuid not null,
  borrower_id uuid not null,
  role_label text not null check (char_length(trim(role_label)) between 2 and 120),
  ownership_percentage numeric(5,2) check (ownership_percentage is null or ownership_percentage between 0 and 100),
  is_primary boolean not null default false,
  starts_on date,
  ends_on date,
  notes text check (notes is null or char_length(notes) <= 4000),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  unique (id, organization_id),
  check (ends_on is null or starts_on is null or ends_on >= starts_on),
  foreign key (person_id, organization_id) references public.crm_people(id, organization_id) on delete restrict,
  foreign key (borrower_id, organization_id) references public.borrowers(id, organization_id) on delete restrict
);

create table public.crm_person_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  person_id uuid not null,
  contact_kind public.contact_kind not null,
  label text check (label is null or char_length(label) <= 80),
  value text not null check (char_length(value) between 1 and 500),
  normalized_value text not null,
  is_primary boolean not null default false,
  is_verified boolean not null default false,
  restricted_use boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  foreign key (person_id, organization_id) references public.crm_people(id, organization_id) on delete cascade
);

create type public.crm_referral_status as enum ('received', 'contacted', 'qualified', 'converted', 'declined', 'lost');
create table public.crm_referrals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  borrower_id uuid not null,
  source_borrower_id uuid,
  source_person_id uuid,
  deal_id uuid,
  status public.crm_referral_status not null default 'received',
  referred_at timestamptz not null,
  estimated_value numeric(16,2) check (estimated_value is null or estimated_value >= 0),
  notes text check (notes is null or char_length(notes) <= 4000),
  outcome text check (outcome is null or char_length(outcome) <= 500),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  unique (id, organization_id),
  check (source_borrower_id is not null or source_person_id is not null),
  foreign key (borrower_id, organization_id) references public.borrowers(id, organization_id) on delete restrict,
  foreign key (source_borrower_id, organization_id) references public.borrowers(id, organization_id) on delete restrict,
  foreign key (source_person_id, organization_id) references public.crm_people(id, organization_id) on delete restrict,
  foreign key (deal_id, organization_id) references public.deals(id, organization_id) on delete restrict
);

create type public.crm_appointment_status as enum ('scheduled', 'completed', 'cancelled');
create table public.crm_appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  borrower_id uuid not null,
  deal_id uuid,
  subject text not null check (char_length(trim(subject)) between 2 and 200),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.crm_appointment_status not null default 'scheduled',
  assigned_to uuid,
  location text check (location is null or char_length(location) <= 500),
  notes text check (notes is null or char_length(notes) <= 4000),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  unique (id, organization_id),
  check (ends_at > starts_at),
  foreign key (borrower_id, organization_id) references public.borrowers(id, organization_id) on delete restrict,
  foreign key (deal_id, organization_id) references public.deals(id, organization_id) on delete restrict,
  foreign key (organization_id, assigned_to) references public.organization_memberships(organization_id, user_id) on delete restrict
);

create index crm_people_org_name_idx on public.crm_people(organization_id, last_name, first_name) where archived_at is null;
create index crm_person_roles_borrower_idx on public.crm_person_company_roles(organization_id, borrower_id) where ends_on is null;
create index crm_person_roles_person_idx on public.crm_person_company_roles(organization_id, person_id) where ends_on is null;
create unique index crm_person_contacts_primary_kind_idx on public.crm_person_contacts(organization_id, person_id, contact_kind) where is_primary and archived_at is null;
create index crm_person_contacts_normalized_idx on public.crm_person_contacts(organization_id, normalized_value) where archived_at is null;
create unique index crm_person_contacts_identity_idx on public.crm_person_contacts(organization_id, contact_kind, normalized_value) where archived_at is null and contact_kind in ('email','phone');
create index crm_referrals_org_status_idx on public.crm_referrals(organization_id, status, referred_at desc);
create index crm_appointments_org_start_idx on public.crm_appointments(organization_id, starts_at) where status = 'scheduled';

alter table public.crm_people enable row level security;
alter table public.crm_person_company_roles enable row level security;
alter table public.crm_person_contacts enable row level security;
alter table public.crm_referrals enable row level security;
alter table public.crm_appointments enable row level security;
revoke all on public.crm_people, public.crm_person_company_roles, public.crm_person_contacts, public.crm_referrals, public.crm_appointments from public, anon, authenticated;
grant select on public.crm_people, public.crm_person_company_roles, public.crm_person_contacts, public.crm_referrals, public.crm_appointments to authenticated;

create policy crm_people_read_authorized on public.crm_people for select to authenticated using (
  exists(select 1 from public.crm_person_company_roles r where r.organization_id = crm_people.organization_id and r.person_id = crm_people.id and r.ends_on is null and private.can_read_borrower(r.organization_id, r.borrower_id))
);
create policy crm_person_roles_read_authorized on public.crm_person_company_roles for select to authenticated using (
  private.can_read_borrower(organization_id, borrower_id)
);
create policy crm_person_contacts_read_authorized on public.crm_person_contacts for select to authenticated using (
  exists(select 1 from public.crm_person_company_roles r where r.organization_id = crm_person_contacts.organization_id and r.person_id = crm_person_contacts.person_id and r.ends_on is null and private.can_read_borrower(r.organization_id, r.borrower_id))
);
create policy crm_referrals_read_authorized on public.crm_referrals for select to authenticated using (
  private.can_read_borrower(organization_id, borrower_id)
  and (source_borrower_id is null or private.can_read_borrower(organization_id, source_borrower_id))
  and (deal_id is null or private.can_read_deal(organization_id, deal_id))
);
create policy crm_appointments_read_authorized on public.crm_appointments for select to authenticated using (
  private.can_read_borrower(organization_id, borrower_id)
  and (deal_id is null or private.can_read_deal(organization_id, deal_id))
);

drop policy if exists borrower_contacts_read_authorized on public.borrower_contacts;
create policy borrower_contacts_read_authorized on public.borrower_contacts for select to authenticated using (
  archived_at is null and private.can_read_borrower(organization_id, borrower_id)
);
drop policy if exists borrowers_read_authorized on public.borrowers;
create policy borrowers_read_authorized on public.borrowers for select to authenticated using (
  archived_at is null and private.can_read_borrower(organization_id,id)
);
drop policy if exists borrower_relationships_read_authorized on public.borrower_relationships;
create policy borrower_relationships_read_authorized on public.borrower_relationships for select to authenticated using (
  private.can_read_borrower(organization_id, source_borrower_id)
  and (target_borrower_id is null or private.can_read_borrower(organization_id, target_borrower_id))
  and (deal_id is null or private.can_read_deal(organization_id, deal_id))
);

create or replace function public.create_crm_company(p_organization_id uuid,p_idempotency_key text,p_legal_name text,p_borrower_kind public.borrower_kind,p_external_reference text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb; v_prior jsonb; v_borrower_id uuid; v_actor uuid := (select auth.uid()); v_prior_actor uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text||':'||trim(coalesce(p_idempotency_key,'')),0));
  select e.payload->'result', e.actor_user_id into v_prior, v_prior_actor from public.audit_events e
  where e.organization_id=p_organization_id and e.idempotency_key=trim(p_idempotency_key);
  if v_prior is not null then
    if v_prior_actor is distinct from v_actor then raise exception using errcode='42501',message='Company command belongs to another actor.'; end if;
    return v_prior||jsonb_build_object('replayed',true);
  end if;
  v_result:=public.create_crm_company_entitled(p_organization_id,p_idempotency_key,p_legal_name,p_borrower_kind,p_external_reference);
  v_borrower_id:=(v_result->>'borrowerId')::uuid;
  if not exists(select 1 from public.audit_events e where e.organization_id=p_organization_id and e.idempotency_key=trim(p_idempotency_key) and e.actor_user_id=v_actor and e.entity_type='borrower' and e.entity_id=v_borrower_id) then raise exception using errcode='42501',message='Company command belongs to another actor.';end if;
  insert into public.borrower_assignments(organization_id,borrower_id,user_id,assignment_role,assigned_by)
  values(p_organization_id,v_borrower_id,v_actor,'relationship_manager',v_actor)
  on conflict(borrower_id,user_id) do nothing;
  return v_result;
end; $$;

create function public.assign_crm_company(p_organization_id uuid,p_borrower_id uuid,p_user_id uuid,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid := (select auth.uid()); v_role public.organization_role; v_prior jsonb; v_result jsonb;
begin
  v_role := public.require_core_operator(p_organization_id);
  if v_role not in ('owner','administrator') then raise exception using errcode='42501',message='CRM assignment administration denied.';end if;
  if char_length(trim(coalesce(p_idempotency_key,''))) not between 8 and 160 then raise exception using errcode='22023',message='Invalid assignment command.';end if;
  if not exists(select 1 from public.borrowers b where b.organization_id=p_organization_id and b.id=p_borrower_id and b.archived_at is null)
    or not exists(select 1 from public.organization_memberships m where m.organization_id=p_organization_id and m.user_id=p_user_id and m.is_active and m.role='lender') then
    raise exception using errcode='42501',message='Company or lender unavailable.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text||':'||trim(p_idempotency_key),0));
  select e.payload->'result' into v_prior from public.audit_events e where e.organization_id=p_organization_id and e.idempotency_key=trim(p_idempotency_key);
  if v_prior is not null then return v_prior||jsonb_build_object('replayed',true);end if;
  insert into public.borrower_assignments(organization_id,borrower_id,user_id,assignment_role,assigned_by)
  values(p_organization_id,p_borrower_id,p_user_id,'relationship_manager',v_actor)
  on conflict(borrower_id,user_id) do update set ended_at=null,assigned_at=now(),assigned_by=v_actor,assignment_role='relationship_manager';
  v_result:=jsonb_build_object('borrowerId',p_borrower_id,'userId',p_user_id,'active',true,'replayed',false);
  insert into public.audit_events(organization_id,actor_user_id,event_type,entity_type,entity_id,correlation_id,idempotency_key,payload)
  values(p_organization_id,v_actor,'crm.company_assigned','borrower',p_borrower_id,gen_random_uuid(),trim(p_idempotency_key),jsonb_build_object('result',v_result));
  return v_result;
end; $$;

create function public.end_crm_company_assignment(p_organization_id uuid,p_borrower_id uuid,p_user_id uuid,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid := (select auth.uid()); v_role public.organization_role; v_prior jsonb; v_result jsonb;
begin
  v_role := public.require_core_operator(p_organization_id);
  if v_role not in ('owner','administrator') then raise exception using errcode='42501',message='CRM assignment administration denied.';end if;
  if char_length(trim(coalesce(p_idempotency_key,''))) not between 8 and 160 then raise exception using errcode='22023',message='Invalid assignment command.';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text||':'||trim(p_idempotency_key),0));
  select e.payload->'result' into v_prior from public.audit_events e where e.organization_id=p_organization_id and e.idempotency_key=trim(p_idempotency_key);
  if v_prior is not null then return v_prior||jsonb_build_object('replayed',true);end if;
  update public.borrower_assignments set ended_at=now() where organization_id=p_organization_id and borrower_id=p_borrower_id and user_id=p_user_id and ended_at is null;
  if not found then raise exception using errcode='22023',message='Active company assignment unavailable.';end if;
  v_result:=jsonb_build_object('borrowerId',p_borrower_id,'userId',p_user_id,'active',false,'replayed',false);
  insert into public.audit_events(organization_id,actor_user_id,event_type,entity_type,entity_id,correlation_id,idempotency_key,payload)
  values(p_organization_id,v_actor,'crm.company_assignment_ended','borrower',p_borrower_id,gen_random_uuid(),trim(p_idempotency_key),jsonb_build_object('result',v_result));
  return v_result;
end; $$;

create function public.update_crm_company(p_organization_id uuid,p_borrower_id uuid,p_idempotency_key text,p_expected_version integer,p_legal_name text,p_external_reference text,p_archive boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid := (select auth.uid()); v_prior jsonb; v_version integer; v_result jsonb;
begin
  perform private.require_borrower_operator(p_organization_id,p_borrower_id,array['owner','administrator','lender']::public.organization_role[]);
  if char_length(trim(coalesce(p_idempotency_key,''))) not between 8 and 160 or char_length(trim(coalesce(p_legal_name,''))) not between 2 and 200 or p_expected_version is null or p_expected_version<1 then raise exception using errcode='22023',message='Invalid company update.';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text||':'||trim(p_idempotency_key),0));
  select e.payload->'result' into v_prior from public.audit_events e where e.organization_id=p_organization_id and e.idempotency_key=trim(p_idempotency_key);
  if v_prior is not null then return v_prior||jsonb_build_object('replayed',true);end if;
  update public.borrowers set legal_name=trim(p_legal_name),external_reference=nullif(trim(p_external_reference),''),archived_at=case when p_archive then now() else null end,updated_at=now(),version=version+1
  where organization_id=p_organization_id and id=p_borrower_id and version=p_expected_version returning version into v_version;
  if v_version is null then raise exception using errcode='40001',message='Company version conflict.';end if;
  v_result:=jsonb_build_object('borrowerId',p_borrower_id,'version',v_version,'archived',p_archive,'replayed',false);
  insert into public.audit_events(organization_id,actor_user_id,event_type,entity_type,entity_id,correlation_id,idempotency_key,payload)
  values(p_organization_id,v_actor,case when p_archive then 'crm.company_archived' else 'crm.company_updated' end,'borrower',p_borrower_id,gen_random_uuid(),trim(p_idempotency_key),jsonb_build_object('result',v_result));
  return v_result;
end; $$;

create function public.archive_crm_contact(p_organization_id uuid,p_contact_id uuid,p_idempotency_key text,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid := (select auth.uid()); v_prior jsonb; v_borrower_id uuid; v_version integer; v_result jsonb;
begin
  if char_length(trim(coalesce(p_idempotency_key,''))) not between 8 and 160 or p_expected_version is null or p_expected_version<1 then raise exception using errcode='22023',message='Invalid contact archive command.';end if;
  select borrower_id,version into v_borrower_id,v_version from public.borrower_contacts where organization_id=p_organization_id and id=p_contact_id and archived_at is null for update;
  if v_borrower_id is null then raise exception using errcode='42501',message='Contact unavailable.';end if;
  perform private.require_borrower_operator(p_organization_id,v_borrower_id,array['owner','administrator','lender']::public.organization_role[]);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text||':'||trim(p_idempotency_key),0));
  select e.payload->'result' into v_prior from public.audit_events e where e.organization_id=p_organization_id and e.idempotency_key=trim(p_idempotency_key);
  if v_prior is not null then return v_prior||jsonb_build_object('replayed',true);end if;
  if v_version<>p_expected_version then raise exception using errcode='40001',message='Contact version conflict.';end if;
  update public.borrower_contacts set archived_at=now(),is_primary=false,updated_at=now(),version=version+1 where organization_id=p_organization_id and id=p_contact_id returning version into v_version;
  v_result:=jsonb_build_object('contactId',p_contact_id,'version',v_version,'archived',true,'replayed',false);
  insert into public.audit_events(organization_id,actor_user_id,event_type,entity_type,entity_id,correlation_id,idempotency_key,payload)
  values(p_organization_id,v_actor,'crm.contact_archived','borrower_contact',p_contact_id,gen_random_uuid(),trim(p_idempotency_key),jsonb_build_object('result',v_result,'borrowerId',v_borrower_id));
  return v_result;
end; $$;

create function public.create_crm_person(p_organization_id uuid,p_borrower_id uuid,p_idempotency_key text,p_first_name text,p_middle_name text,p_last_name text,p_preferred_name text,p_job_title text,p_role_label text,p_ownership_percentage numeric,p_email text,p_phone text,p_is_primary boolean,p_notes text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid := (select auth.uid()); v_prior jsonb; v_person_id uuid; v_role_id uuid; v_result jsonb; v_normalized text;
begin
  perform public.require_core_operator(p_organization_id);
  perform private.require_borrower_operator(p_organization_id,p_borrower_id,array['owner','administrator','lender']::public.organization_role[]);
  if char_length(trim(coalesce(p_idempotency_key,''))) not between 8 and 160 or char_length(trim(coalesce(p_first_name,''))) not between 1 and 100 or char_length(trim(coalesce(p_last_name,''))) not between 1 and 100 or char_length(trim(coalesce(p_role_label,''))) not between 2 and 120 or p_ownership_percentage not between 0 and 100 or char_length(coalesce(p_notes,''))>4000 then raise exception using errcode='22023',message='Invalid person command.';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text||':'||trim(p_idempotency_key),0));
  select e.payload->'result' into v_prior from public.audit_events e where e.organization_id=p_organization_id and e.idempotency_key=trim(p_idempotency_key);
  if v_prior is not null then return v_prior||jsonb_build_object('replayed',true);end if;
  insert into public.crm_people(organization_id,first_name,middle_name,last_name,preferred_name,job_title,notes,created_by)
  values(p_organization_id,trim(p_first_name),nullif(trim(p_middle_name),''),trim(p_last_name),nullif(trim(p_preferred_name),''),nullif(trim(p_job_title),''),nullif(trim(p_notes),''),v_actor) returning id into v_person_id;
  insert into public.crm_person_company_roles(organization_id,person_id,borrower_id,role_label,ownership_percentage,is_primary,starts_on,created_by)
  values(p_organization_id,v_person_id,p_borrower_id,trim(p_role_label),p_ownership_percentage,coalesce(p_is_primary,false),current_date,v_actor) returning id into v_role_id;
  if nullif(trim(p_email),'') is not null then
    v_normalized:=private.normalize_crm_contact('email',p_email);
    insert into public.crm_person_contacts(organization_id,person_id,contact_kind,label,value,normalized_value,is_primary,created_by)
    values(p_organization_id,v_person_id,'email','Work',trim(p_email),v_normalized,true,v_actor);
  end if;
  if nullif(trim(p_phone),'') is not null then
    v_normalized:=private.normalize_crm_contact('phone',p_phone);
    insert into public.crm_person_contacts(organization_id,person_id,contact_kind,label,value,normalized_value,is_primary,created_by)
    values(p_organization_id,v_person_id,'phone','Work',trim(p_phone),v_normalized,true,v_actor);
  end if;
  v_result:=jsonb_build_object('personId',v_person_id,'roleId',v_role_id,'replayed',false);
  insert into public.audit_events(organization_id,actor_user_id,event_type,entity_type,entity_id,correlation_id,idempotency_key,payload)
  values(p_organization_id,v_actor,'crm.person_created','crm_person',v_person_id,gen_random_uuid(),trim(p_idempotency_key),jsonb_build_object('result',v_result,'borrowerId',p_borrower_id));
  return v_result;
end; $$;

create function public.close_crm_relationship(p_organization_id uuid,p_relationship_id uuid,p_idempotency_key text,p_expected_active boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid := (select auth.uid()); v_prior jsonb; v_source uuid; v_active boolean; v_result jsonb;
begin
  perform public.require_core_operator(p_organization_id);
  if char_length(trim(coalesce(p_idempotency_key,''))) not between 8 and 160 then raise exception using errcode='22023',message='Invalid relationship close command.';end if;
  select source_borrower_id,is_active into v_source,v_active from public.borrower_relationships where organization_id=p_organization_id and id=p_relationship_id for update;
  if v_source is null then raise exception using errcode='42501',message='Relationship unavailable.';end if;
  perform private.require_borrower_operator(p_organization_id,v_source,array['owner','administrator','lender']::public.organization_role[]);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text||':'||trim(p_idempotency_key),0));
  select e.payload->'result' into v_prior from public.audit_events e where e.organization_id=p_organization_id and e.idempotency_key=trim(p_idempotency_key);
  if v_prior is not null then return v_prior||jsonb_build_object('replayed',true);end if;
  if v_active is distinct from p_expected_active or not v_active then raise exception using errcode='40001',message='Relationship state conflict.';end if;
  update public.borrower_relationships set is_active=false,ends_on=current_date,updated_at=now() where organization_id=p_organization_id and id=p_relationship_id;
  v_result:=jsonb_build_object('relationshipId',p_relationship_id,'active',false,'replayed',false);
  insert into public.audit_events(organization_id,actor_user_id,event_type,entity_type,entity_id,correlation_id,idempotency_key,payload)
  values(p_organization_id,v_actor,'crm.relationship_closed','borrower_relationship',p_relationship_id,gen_random_uuid(),trim(p_idempotency_key),jsonb_build_object('result',v_result));
  return v_result;
end; $$;

create function public.update_deal_task(p_organization_id uuid,p_task_id uuid,p_idempotency_key text,p_expected_version integer,p_title text,p_description text,p_due_at timestamptz,p_assigned_to uuid,p_cancel boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid := (select auth.uid()); v_prior jsonb; v_deal_id uuid; v_status public.deal_task_status; v_version integer; v_result jsonb;
begin
  perform public.require_core_operator(p_organization_id);
  if char_length(trim(coalesce(p_idempotency_key,''))) not between 8 and 160 or char_length(trim(coalesce(p_title,''))) not between 2 and 200 or p_expected_version is null or p_expected_version<1 then raise exception using errcode='22023',message='Invalid task update.';end if;
  if p_assigned_to is not null and not exists(select 1 from public.organization_memberships m where m.organization_id=p_organization_id and m.user_id=p_assigned_to and m.is_active and m.role in ('owner','administrator','lender')) then raise exception using errcode='42501',message='Assignee unavailable.';end if;
  select deal_id,status,version into v_deal_id,v_status,v_version from public.deal_tasks where organization_id=p_organization_id and id=p_task_id for update;
  if v_deal_id is null then raise exception using errcode='42501',message='Task unavailable.';end if;
  perform private.require_deal_operator(p_organization_id,v_deal_id,array['owner','administrator','lender']::public.organization_role[]);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text||':'||trim(p_idempotency_key),0));
  select e.payload->'result' into v_prior from public.audit_events e where e.organization_id=p_organization_id and e.idempotency_key=trim(p_idempotency_key);
  if v_prior is not null then return v_prior||jsonb_build_object('replayed',true);end if;
  if v_version<>p_expected_version or v_status<>'open' then raise exception using errcode='40001',message='Task state conflict.';end if;
  update public.deal_tasks set title=trim(p_title),description=nullif(trim(p_description),''),due_at=p_due_at,assigned_to=p_assigned_to,status=case when p_cancel then 'cancelled'::public.deal_task_status else status end,updated_at=now(),version=version+1
  where organization_id=p_organization_id and id=p_task_id returning version,status into v_version,v_status;
  v_result:=jsonb_build_object('taskId',p_task_id,'status',v_status,'version',v_version,'replayed',false);
  insert into public.audit_events(organization_id,actor_user_id,event_type,entity_type,entity_id,correlation_id,idempotency_key,payload)
  values(p_organization_id,v_actor,case when p_cancel then 'deal.task_cancelled' else 'deal.task_updated' end,'deal_task',p_task_id,gen_random_uuid(),trim(p_idempotency_key),jsonb_build_object('result',v_result,'dealId',v_deal_id));
  return v_result;
end; $$;

create function public.create_crm_referral(p_organization_id uuid,p_borrower_id uuid,p_source_borrower_id uuid,p_source_person_id uuid,p_deal_id uuid,p_idempotency_key text,p_referred_at timestamptz,p_estimated_value numeric,p_notes text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid := (select auth.uid()); v_prior jsonb; v_id uuid; v_result jsonb;
begin
  perform public.require_core_operator(p_organization_id);
  perform private.require_borrower_operator(p_organization_id,p_borrower_id,array['owner','administrator','lender']::public.organization_role[]);
  if p_source_borrower_id is null and p_source_person_id is null or char_length(trim(coalesce(p_idempotency_key,''))) not between 8 and 160 or p_referred_at is null or p_estimated_value<0 or char_length(coalesce(p_notes,''))>4000 then raise exception using errcode='22023',message='Invalid referral command.';end if;
  if p_source_borrower_id is not null then perform private.require_borrower_operator(p_organization_id,p_source_borrower_id,array['owner','administrator','lender']::public.organization_role[]);end if;
  if p_source_person_id is not null and not exists(select 1 from public.crm_person_company_roles r where r.organization_id=p_organization_id and r.person_id=p_source_person_id and r.ends_on is null and private.can_read_borrower(r.organization_id,r.borrower_id)) then raise exception using errcode='42501',message='Referral source unavailable.';end if;
  if p_deal_id is not null and not exists(select 1 from public.deals d where d.organization_id=p_organization_id and d.id=p_deal_id and d.borrower_id=p_borrower_id and d.archived_at is null and private.can_read_deal(d.organization_id,d.id)) then raise exception using errcode='42501',message='Referral deal unavailable.';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text||':'||trim(p_idempotency_key),0));
  select e.payload->'result' into v_prior from public.audit_events e where e.organization_id=p_organization_id and e.idempotency_key=trim(p_idempotency_key);
  if v_prior is not null then return v_prior||jsonb_build_object('replayed',true);end if;
  insert into public.crm_referrals(organization_id,borrower_id,source_borrower_id,source_person_id,deal_id,referred_at,estimated_value,notes,created_by)
  values(p_organization_id,p_borrower_id,p_source_borrower_id,p_source_person_id,p_deal_id,p_referred_at,p_estimated_value,nullif(trim(p_notes),''),v_actor) returning id into v_id;
  v_result:=jsonb_build_object('referralId',v_id,'replayed',false);
  insert into public.audit_events(organization_id,actor_user_id,event_type,entity_type,entity_id,correlation_id,idempotency_key,payload)
  values(p_organization_id,v_actor,'crm.referral_created','crm_referral',v_id,gen_random_uuid(),trim(p_idempotency_key),jsonb_build_object('result',v_result,'borrowerId',p_borrower_id));
  return v_result;
end; $$;

create function public.create_crm_appointment(p_organization_id uuid,p_borrower_id uuid,p_deal_id uuid,p_idempotency_key text,p_subject text,p_starts_at timestamptz,p_ends_at timestamptz,p_assigned_to uuid,p_location text,p_notes text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid := (select auth.uid()); v_prior jsonb; v_id uuid; v_result jsonb;
begin
  perform public.require_core_operator(p_organization_id);
  perform private.require_borrower_operator(p_organization_id,p_borrower_id,array['owner','administrator','lender']::public.organization_role[]);
  if char_length(trim(coalesce(p_idempotency_key,''))) not between 8 and 160 or char_length(trim(coalesce(p_subject,''))) not between 2 and 200 or p_starts_at is null or p_ends_at<=p_starts_at or char_length(coalesce(p_location,''))>500 or char_length(coalesce(p_notes,''))>4000 then raise exception using errcode='22023',message='Invalid appointment command.';end if;
  if p_deal_id is not null and not exists(select 1 from public.deals d where d.organization_id=p_organization_id and d.id=p_deal_id and d.borrower_id=p_borrower_id and d.archived_at is null and private.can_read_deal(d.organization_id,d.id)) then raise exception using errcode='42501',message='Appointment deal unavailable.';end if;
  if p_assigned_to is not null and not exists(select 1 from public.organization_memberships m where m.organization_id=p_organization_id and m.user_id=p_assigned_to and m.is_active and m.role in ('owner','administrator','lender')) then raise exception using errcode='42501',message='Appointment assignee unavailable.';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text||':'||trim(p_idempotency_key),0));
  select e.payload->'result' into v_prior from public.audit_events e where e.organization_id=p_organization_id and e.idempotency_key=trim(p_idempotency_key);
  if v_prior is not null then return v_prior||jsonb_build_object('replayed',true);end if;
  insert into public.crm_appointments(organization_id,borrower_id,deal_id,subject,starts_at,ends_at,assigned_to,location,notes,created_by)
  values(p_organization_id,p_borrower_id,p_deal_id,trim(p_subject),p_starts_at,p_ends_at,p_assigned_to,nullif(trim(p_location),''),nullif(trim(p_notes),''),v_actor) returning id into v_id;
  v_result:=jsonb_build_object('appointmentId',v_id,'replayed',false);
  insert into public.audit_events(organization_id,actor_user_id,event_type,entity_type,entity_id,correlation_id,idempotency_key,payload)
  values(p_organization_id,v_actor,'crm.appointment_created','crm_appointment',v_id,gen_random_uuid(),trim(p_idempotency_key),jsonb_build_object('result',v_result,'borrowerId',p_borrower_id,'dealId',p_deal_id));
  return v_result;
end; $$;

create function public.crm_dashboard_metrics(p_organization_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'companies',(select count(*) from public.borrowers b where b.organization_id=p_organization_id and b.archived_at is null),
    'people',(select count(*) from public.crm_people p where p.organization_id=p_organization_id and p.archived_at is null),
    'contactPoints',(select count(*) from public.borrower_contacts c where c.organization_id=p_organization_id and c.archived_at is null)+(select count(*) from public.crm_person_contacts c where c.organization_id=p_organization_id and c.archived_at is null),
    'relationships',(select count(*) from public.borrower_relationships r where r.organization_id=p_organization_id and r.is_active),
    'activities',(select count(*) from public.crm_activities a where a.organization_id=p_organization_id),
    'referrals',(select count(*) from public.crm_referrals r where r.organization_id=p_organization_id),
    'appointments',(select count(*) from public.crm_appointments a where a.organization_id=p_organization_id and a.status='scheduled'),
    'openTasks',(select count(*) from public.deal_tasks t where t.organization_id=p_organization_id and t.status='open'),
    'tasks',(select count(*) from public.deal_tasks t where t.organization_id=p_organization_id),
    'openOpportunities',(select count(*) from public.deals d where d.organization_id=p_organization_id and d.archived_at is null and d.stage not in ('closed','withdrawn','declined')),
    'opportunities',(select count(*) from public.deals d where d.organization_id=p_organization_id and d.archived_at is null),
    'activeExposure',(select coalesce(sum(coalesce(d.approved_amount,d.requested_amount,0)),0) from public.deals d where d.organization_id=p_organization_id and d.archived_at is null and d.stage not in ('closed','withdrawn','declined'))
  );
$$;

revoke all on function public.create_crm_company(uuid,text,text,public.borrower_kind,text), public.assign_crm_company(uuid,uuid,uuid,text), public.end_crm_company_assignment(uuid,uuid,uuid,text), public.update_crm_company(uuid,uuid,text,integer,text,text,boolean), public.archive_crm_contact(uuid,uuid,text,integer), public.create_crm_person(uuid,uuid,text,text,text,text,text,text,text,numeric,text,text,boolean,text), public.close_crm_relationship(uuid,uuid,text,boolean), public.update_deal_task(uuid,uuid,text,integer,text,text,timestamptz,uuid,boolean), public.create_crm_referral(uuid,uuid,uuid,uuid,uuid,text,timestamptz,numeric,text), public.create_crm_appointment(uuid,uuid,uuid,text,text,timestamptz,timestamptz,uuid,text,text), public.crm_dashboard_metrics(uuid) from public, anon;
grant execute on function public.create_crm_company(uuid,text,text,public.borrower_kind,text), public.assign_crm_company(uuid,uuid,uuid,text), public.end_crm_company_assignment(uuid,uuid,uuid,text), public.update_crm_company(uuid,uuid,text,integer,text,text,boolean), public.archive_crm_contact(uuid,uuid,text,integer), public.create_crm_person(uuid,uuid,text,text,text,text,text,text,text,numeric,text,text,boolean,text), public.close_crm_relationship(uuid,uuid,text,boolean), public.update_deal_task(uuid,uuid,text,integer,text,text,timestamptz,uuid,boolean), public.create_crm_referral(uuid,uuid,uuid,uuid,uuid,text,timestamptz,numeric,text), public.create_crm_appointment(uuid,uuid,uuid,text,text,timestamptz,timestamptz,uuid,text,text), public.crm_dashboard_metrics(uuid) to authenticated;

comment on table public.crm_people is 'First-class CRM people, distinct from company contact points.';
comment on table public.crm_referrals is 'Governed referral pipeline with attribution, status, value, and outcome.';
comment on table public.crm_appointments is 'Governed CRM schedule; completed appointments may produce immutable CRM activities.';
