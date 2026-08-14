-- Commission core CRM and loan-intake commands behind a tenant entitlement.
-- No organization is entitled by this migration; absence remains disabled.

create function public.require_core_operations_entitlement(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.organization_product_modules as module
    where module.organization_id = p_organization_id
      and module.module_key = 'document_intake'
      and module.status in ('trial', 'active')
      and module.starts_at <= now()
      and (module.ends_at is null or module.ends_at > now())
  ) then
    raise exception using errcode = '42501', message = 'Core operations are not entitled for this organization.';
  end if;
end;
$$;

revoke all on function public.require_core_operations_entitlement(uuid) from public, anon, authenticated;

create or replace function public.require_core_operator(p_organization_id uuid)
returns public.organization_role
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.organization_role;
begin
  perform public.require_core_operations_entitlement(p_organization_id);

  select membership.role
    into v_role
  from public.organization_memberships as membership
  where membership.organization_id = p_organization_id
    and membership.user_id = (select auth.uid())
    and membership.is_active;

  if v_role is null or v_role not in ('owner', 'administrator', 'lender') then
    raise exception using errcode = '42501', message = 'Core operation permission denied.';
  end if;

  return v_role;
end;
$$;

revoke all on function public.require_core_operator(uuid) from public, anon, authenticated;

alter function public.create_loan_intake(
  uuid, text, text, public.borrower_kind, text, text, text, text, text, numeric, date
) rename to create_loan_intake_uncommissioned;

revoke all on function public.create_loan_intake_uncommissioned(
  uuid, text, text, public.borrower_kind, text, text, text, text, text, numeric, date
) from public, anon, authenticated;

create function public.create_loan_intake(
  p_organization_id uuid,
  p_idempotency_key text,
  p_borrower_legal_name text,
  p_borrower_kind public.borrower_kind,
  p_borrower_email text,
  p_borrower_phone text,
  p_deal_name text,
  p_product_type text,
  p_purpose text,
  p_requested_amount numeric,
  p_expected_close_date date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_core_operations_entitlement(p_organization_id);

  return public.create_loan_intake_uncommissioned(
    p_organization_id,
    p_idempotency_key,
    p_borrower_legal_name,
    p_borrower_kind,
    p_borrower_email,
    p_borrower_phone,
    p_deal_name,
    p_product_type,
    p_purpose,
    p_requested_amount,
    p_expected_close_date
  );
end;
$$;

revoke all on function public.create_loan_intake(
  uuid, text, text, public.borrower_kind, text, text, text, text, text, numeric, date
) from public, anon;

grant execute on function public.create_loan_intake(
  uuid, text, text, public.borrower_kind, text, text, text, text, text, numeric, date
) to authenticated;

comment on function public.require_core_operations_entitlement(uuid) is
  'Fail-closed tenant entitlement gate for commissioned CRM and lending operations.';

comment on function public.create_loan_intake(
  uuid, text, text, public.borrower_kind, text, text, text, text, text, numeric, date
) is
  'Tenant-entitled wrapper for the atomic loan-intake command; direct access to the implementation remains revoked.';
