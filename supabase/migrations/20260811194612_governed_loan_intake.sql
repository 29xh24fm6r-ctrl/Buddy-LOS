-- Atomic first-lending-loop command. The function is installed without execute
-- permission; a separate commissioning migration must explicitly activate it.

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
declare
  v_actor_user_id uuid := (select auth.uid());
  v_borrower_id uuid;
  v_application_id uuid;
  v_deal_id uuid;
  v_existing_result jsonb;
  v_result jsonb;
begin
  if v_actor_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if p_idempotency_key is null or char_length(trim(p_idempotency_key)) not between 8 and 160 then
    raise exception using errcode = '22023', message = 'A valid idempotency key is required.';
  end if;
  if char_length(trim(coalesce(p_borrower_legal_name, ''))) not between 2 and 200 then
    raise exception using errcode = '22023', message = 'Borrower legal name is invalid.';
  end if;
  if char_length(trim(coalesce(p_deal_name, ''))) not between 2 and 200 then
    raise exception using errcode = '22023', message = 'Deal name is invalid.';
  end if;
  if p_requested_amount is null or p_requested_amount <= 0 then
    raise exception using errcode = '22023', message = 'Requested amount must be positive.';
  end if;

  if not exists (
    select 1
    from public.organization_memberships as membership
    where membership.organization_id = p_organization_id
      and membership.user_id = v_actor_user_id
      and membership.is_active
      and membership.role in ('owner', 'administrator', 'lender')
  ) then
    raise exception using errcode = '42501', message = 'Loan intake permission denied.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_organization_id::text || ':' || trim(p_idempotency_key), 0)
  );

  select event.payload -> 'result'
    into v_existing_result
  from public.audit_events as event
  where event.organization_id = p_organization_id
    and event.idempotency_key = trim(p_idempotency_key);
  if v_existing_result is not null then
    return v_existing_result || jsonb_build_object('replayed', true);
  end if;

  insert into public.borrowers (
    organization_id, legal_name, borrower_kind, email, phone, created_by
  ) values (
    p_organization_id, trim(p_borrower_legal_name), p_borrower_kind,
    nullif(trim(p_borrower_email), ''), nullif(trim(p_borrower_phone), ''), v_actor_user_id
  ) returning id into v_borrower_id;

  if nullif(trim(p_borrower_email), '') is not null then
    insert into public.borrower_contacts (
      organization_id, borrower_id, contact_kind, label, value, is_primary, created_by
    ) values (p_organization_id, v_borrower_id, 'email', 'Primary', trim(p_borrower_email), true, v_actor_user_id);
  end if;
  if nullif(trim(p_borrower_phone), '') is not null then
    insert into public.borrower_contacts (
      organization_id, borrower_id, contact_kind, label, value, is_primary, created_by
    ) values (p_organization_id, v_borrower_id, 'phone', 'Primary', trim(p_borrower_phone), true, v_actor_user_id);
  end if;

  insert into public.loan_applications (
    organization_id, borrower_id, name, requested_amount, status, created_by
  ) values (
    p_organization_id, v_borrower_id, trim(p_deal_name), p_requested_amount, 'draft', v_actor_user_id
  ) returning id into v_application_id;

  insert into public.deals (
    organization_id, borrower_id, application_id, name, product_type, purpose,
    requested_amount, stage, expected_close_date, created_by
  ) values (
    p_organization_id, v_borrower_id, v_application_id, trim(p_deal_name),
    nullif(trim(p_product_type), ''), nullif(trim(p_purpose), ''),
    p_requested_amount, 'intake', p_expected_close_date, v_actor_user_id
  ) returning id into v_deal_id;

  insert into public.deal_assignments (
    organization_id, deal_id, user_id, assignment_role, assigned_by
  ) values (p_organization_id, v_deal_id, v_actor_user_id, 'banker', v_actor_user_id);

  v_result := jsonb_build_object(
    'borrowerId', v_borrower_id,
    'applicationId', v_application_id,
    'dealId', v_deal_id,
    'replayed', false
  );
  insert into public.audit_events (
    organization_id, actor_user_id, event_type, entity_type, entity_id,
    correlation_id, idempotency_key, payload
  ) values (
    p_organization_id, v_actor_user_id, 'loan_intake.created', 'deal', v_deal_id,
    gen_random_uuid(), trim(p_idempotency_key), jsonb_build_object(
      'result', v_result,
      'borrowerLegalName', trim(p_borrower_legal_name),
      'requestedAmount', p_requested_amount
    )
  );
  return v_result;
end;
$$;

revoke all on function public.create_loan_intake(uuid, text, text, public.borrower_kind, text, text, text, text, text, numeric, date) from public;
revoke all on function public.create_loan_intake(uuid, text, text, public.borrower_kind, text, text, text, text, text, numeric, date) from anon;
revoke all on function public.create_loan_intake(uuid, text, text, public.borrower_kind, text, text, text, text, text, numeric, date) from authenticated;

comment on function public.create_loan_intake(uuid, text, text, public.borrower_kind, text, text, text, text, text, numeric, date)
  is 'Atomic tenant-bound loan intake command. Installed default-off; execute must be granted by a later commissioning migration.';
