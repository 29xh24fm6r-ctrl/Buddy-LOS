create type public.organization_role as enum ('owner', 'administrator', 'lender', 'underwriter', 'closer', 'viewer');
create type public.application_status as enum ('draft', 'intake', 'underwriting', 'decision', 'closing', 'funded', 'withdrawn', 'declined');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.organization_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.borrowers (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  legal_name text not null check (char_length(legal_name) between 2 and 200),
  email text,
  phone text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  primary key (id),
  unique (id, organization_id)
);

create table public.loan_applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  borrower_id uuid not null,
  name text not null check (char_length(name) between 2 and 200),
  requested_amount numeric(16,2) check (requested_amount is null or requested_amount > 0),
  status public.application_status not null default 'draft',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  foreign key (borrower_id, organization_id) references public.borrowers(id, organization_id)
);

create index organization_memberships_user_active_idx on public.organization_memberships(user_id, organization_id) where is_active;
create index borrowers_organization_idx on public.borrowers(organization_id, created_at desc);
create index loan_applications_organization_status_idx on public.loan_applications(organization_id, status, created_at desc);

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.borrowers enable row level security;
alter table public.loan_applications enable row level security;

revoke all on public.organizations, public.profiles, public.organization_memberships, public.borrowers, public.loan_applications from anon;
grant select on public.organizations, public.profiles, public.organization_memberships, public.borrowers, public.loan_applications to authenticated;

create policy "profiles_read_self" on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "memberships_read_self" on public.organization_memberships for select to authenticated using ((select auth.uid()) = user_id and is_active);
create policy "organizations_read_member" on public.organizations for select to authenticated using (
  exists (select 1 from public.organization_memberships m where m.organization_id = id and m.user_id = (select auth.uid()) and m.is_active)
);
create policy "borrowers_read_member" on public.borrowers for select to authenticated using (
  exists (select 1 from public.organization_memberships m where m.organization_id = borrowers.organization_id and m.user_id = (select auth.uid()) and m.is_active)
);
create policy "applications_read_member" on public.loan_applications for select to authenticated using (
  exists (select 1 from public.organization_memberships m where m.organization_id = loan_applications.organization_id and m.user_id = (select auth.uid()) and m.is_active)
);

comment on table public.loan_applications is 'Native Buddy LOS loan application record. Writes remain server-gated until workflow policies are commissioned.';
