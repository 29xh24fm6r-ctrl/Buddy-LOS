-- Core LOS domain spine. This migration is additive and keeps all client writes
-- disabled until governed command functions are commissioned.

create type public.team_membership_role as enum ('manager', 'member', 'observer');
create type public.borrower_kind as enum ('business', 'individual', 'trust', 'government', 'nonprofit', 'other');
create type public.contact_kind as enum ('email', 'phone', 'address', 'website', 'other');
create type public.relationship_kind as enum ('borrower', 'guarantor', 'owner', 'officer', 'advisor', 'vendor', 'affiliate', 'other');
create type public.deal_stage as enum ('prospect', 'intake', 'application', 'underwriting', 'credit_approval', 'commitment', 'closing', 'funding', 'boarding', 'servicing', 'closed', 'withdrawn', 'declined');
create type public.deal_assignment_role as enum ('relationship_manager', 'banker', 'underwriter', 'credit_officer', 'closer', 'servicing_owner', 'portfolio_manager', 'observer');

alter table public.organizations
  add column institution_type text,
  add column legal_name text,
  add column timezone text not null default 'America/New_York',
  add constraint organizations_institution_type_check check (institution_type is null or institution_type in ('bank', 'credit_union', 'other'));

alter table public.borrowers
  add column borrower_kind public.borrower_kind not null default 'business',
  add column tax_identifier_last_four text,
  add column external_reference text,
  add column relationship_start_date date,
  add column archived_at timestamptz,
  add constraint borrowers_tax_identifier_last_four_check check (tax_identifier_last_four is null or tax_identifier_last_four ~ '^[0-9]{4}$');

alter table public.loan_applications
  add constraint loan_applications_id_organization_unique unique (id, organization_id);

create table public.organization_teams (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (char_length(name) between 2 and 120), description text, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id, organization_id), unique (organization_id, name)
);

create table public.team_memberships (
  organization_id uuid not null, team_id uuid not null, user_id uuid not null references auth.users(id) on delete cascade,
  role public.team_membership_role not null default 'member', is_active boolean not null default true, created_at timestamptz not null default now(),
  primary key (team_id, user_id),
  foreign key (team_id, organization_id) references public.organization_teams(id, organization_id) on delete cascade,
  foreign key (organization_id, user_id) references public.organization_memberships(organization_id, user_id) on delete cascade
);

create table public.borrower_contacts (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, borrower_id uuid not null,
  contact_kind public.contact_kind not null, label text, value text not null check (char_length(value) between 1 and 500),
  is_primary boolean not null default false, is_verified boolean not null default false, restricted_use boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (borrower_id, organization_id) references public.borrowers(id, organization_id) on delete cascade
);

create table public.deals (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
  borrower_id uuid not null, application_id uuid, team_id uuid,
  deal_number text, name text not null check (char_length(name) between 2 and 200), product_type text, purpose text,
  requested_amount numeric(16,2) check (requested_amount is null or requested_amount > 0),
  approved_amount numeric(16,2) check (approved_amount is null or approved_amount > 0),
  stage public.deal_stage not null default 'prospect', stage_entered_at timestamptz not null default now(), expected_close_date date,
  created_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  archived_at timestamptz, version integer not null default 1 check (version > 0),
  unique (id, organization_id), unique (organization_id, deal_number),
  foreign key (borrower_id, organization_id) references public.borrowers(id, organization_id) on delete restrict,
  foreign key (application_id, organization_id) references public.loan_applications(id, organization_id) on delete restrict,
  foreign key (team_id, organization_id) references public.organization_teams(id, organization_id) on delete restrict
);

create table public.borrower_relationships (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, source_borrower_id uuid not null,
  target_borrower_id uuid, deal_id uuid, relationship_kind public.relationship_kind not null, role_label text,
  starts_on date, ends_on date, notes text, is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (target_borrower_id is not null or deal_id is not null), check (ends_on is null or starts_on is null or ends_on >= starts_on),
  foreign key (source_borrower_id, organization_id) references public.borrowers(id, organization_id) on delete restrict,
  foreign key (target_borrower_id, organization_id) references public.borrowers(id, organization_id) on delete restrict,
  foreign key (deal_id, organization_id) references public.deals(id, organization_id) on delete cascade
);

create table public.deal_assignments (
  organization_id uuid not null, deal_id uuid not null, user_id uuid not null, assignment_role public.deal_assignment_role not null,
  assigned_by uuid not null references auth.users(id) on delete restrict, assigned_at timestamptz not null default now(), ended_at timestamptz,
  primary key (deal_id, user_id, assignment_role), check (ended_at is null or ended_at >= assigned_at),
  foreign key (deal_id, organization_id) references public.deals(id, organization_id) on delete cascade,
  foreign key (organization_id, user_id) references public.organization_memberships(organization_id, user_id) on delete restrict
);

create table public.audit_events (
  id bigint generated always as identity primary key, organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete restrict, event_type text not null check (char_length(event_type) between 3 and 120),
  entity_type text not null check (char_length(entity_type) between 2 and 80), entity_id uuid, correlation_id uuid not null,
  idempotency_key text, occurred_at timestamptz not null default now(), source text not null default 'buddy-los', payload jsonb not null default '{}'::jsonb,
  unique (organization_id, idempotency_key)
);

create index organization_teams_org_active_idx on public.organization_teams (organization_id, name) where is_active;
create index team_memberships_user_active_idx on public.team_memberships (user_id, organization_id, team_id) where is_active;
create index borrower_contacts_borrower_idx on public.borrower_contacts (organization_id, borrower_id, contact_kind);
create unique index borrower_contacts_one_primary_kind_idx on public.borrower_contacts (organization_id, borrower_id, contact_kind) where is_primary;
create index borrowers_org_active_name_idx on public.borrowers (organization_id, legal_name) where archived_at is null;
create index deals_org_stage_updated_idx on public.deals (organization_id, stage, updated_at desc) where archived_at is null;
create index deals_borrower_idx on public.deals (borrower_id, organization_id);
create index deals_team_idx on public.deals (team_id, organization_id) where team_id is not null;
create index borrower_relationships_source_idx on public.borrower_relationships (source_borrower_id, organization_id) where is_active;
create index borrower_relationships_target_idx on public.borrower_relationships (target_borrower_id, organization_id) where target_borrower_id is not null and is_active;
create index borrower_relationships_deal_idx on public.borrower_relationships (deal_id, organization_id) where deal_id is not null;
create index deal_assignments_user_active_idx on public.deal_assignments (user_id, organization_id, deal_id) where ended_at is null;
create index audit_events_entity_idx on public.audit_events (organization_id, entity_type, entity_id, occurred_at desc);
create index audit_events_correlation_idx on public.audit_events (organization_id, correlation_id);
create index audit_events_payload_idx on public.audit_events using gin (payload);

alter table public.organization_teams enable row level security;
alter table public.team_memberships enable row level security;
alter table public.borrower_contacts enable row level security;
alter table public.deals enable row level security;
alter table public.borrower_relationships enable row level security;
alter table public.deal_assignments enable row level security;
alter table public.audit_events enable row level security;

revoke all on public.organization_teams, public.team_memberships, public.borrower_contacts, public.deals, public.borrower_relationships, public.deal_assignments, public.audit_events from anon;
revoke all on public.organization_teams, public.team_memberships, public.borrower_contacts, public.deals, public.borrower_relationships, public.deal_assignments, public.audit_events from authenticated;
grant select on public.organization_teams, public.team_memberships, public.borrower_contacts, public.deals, public.borrower_relationships, public.deal_assignments, public.audit_events to authenticated;

create policy "organization_teams_read_member" on public.organization_teams for select to authenticated using (exists (select 1 from public.organization_memberships membership where membership.organization_id = organization_teams.organization_id and membership.user_id = (select auth.uid()) and membership.is_active));
create policy "team_memberships_read_member" on public.team_memberships for select to authenticated using (exists (select 1 from public.organization_memberships membership where membership.organization_id = team_memberships.organization_id and membership.user_id = (select auth.uid()) and membership.is_active));
create policy "borrower_contacts_read_member" on public.borrower_contacts for select to authenticated using (exists (select 1 from public.organization_memberships membership where membership.organization_id = borrower_contacts.organization_id and membership.user_id = (select auth.uid()) and membership.is_active));
create policy "deals_read_member" on public.deals for select to authenticated using (exists (select 1 from public.organization_memberships membership where membership.organization_id = deals.organization_id and membership.user_id = (select auth.uid()) and membership.is_active));
create policy "borrower_relationships_read_member" on public.borrower_relationships for select to authenticated using (exists (select 1 from public.organization_memberships membership where membership.organization_id = borrower_relationships.organization_id and membership.user_id = (select auth.uid()) and membership.is_active));
create policy "deal_assignments_read_member" on public.deal_assignments for select to authenticated using (exists (select 1 from public.organization_memberships membership where membership.organization_id = deal_assignments.organization_id and membership.user_id = (select auth.uid()) and membership.is_active));
create policy "audit_events_read_member" on public.audit_events for select to authenticated using (exists (select 1 from public.organization_memberships membership where membership.organization_id = audit_events.organization_id and membership.user_id = (select auth.uid()) and membership.is_active));

comment on table public.deals is 'Canonical native Buddy LOS deal record. Direct Data API writes remain disabled.';
comment on table public.audit_events is 'Append-only organization audit evidence. Inserts are reserved for governed server commands.';
