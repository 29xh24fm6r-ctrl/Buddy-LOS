create type public.product_module_key as enum ('document_intake', 'underwriting', 'sba');
create type public.product_module_status as enum ('trial', 'active', 'suspended', 'expired');

create table public.organization_product_modules (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  module_key public.product_module_key not null,
  status public.product_module_status not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  configuration jsonb not null default '{}'::jsonb check (jsonb_typeof(configuration) = 'object'),
  activated_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, module_key),
  check (ends_at is null or ends_at > starts_at)
);

create index organization_product_modules_active_idx
  on public.organization_product_modules (organization_id, module_key, status, ends_at);

alter table public.organization_product_modules enable row level security;
revoke all on public.organization_product_modules from anon;
revoke all on public.organization_product_modules from authenticated;
grant select on public.organization_product_modules to authenticated;

create policy "product_modules_read_member"
  on public.organization_product_modules
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.organization_memberships membership
      where membership.organization_id = organization_product_modules.organization_id
        and membership.user_id = (select auth.uid())
        and membership.is_active
    )
  );

comment on table public.organization_product_modules is
  'Trusted tenant module entitlements. Absence means disabled; writes remain server-gated until subscription administration is commissioned.';
