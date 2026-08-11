-- Ordinary lending roles may read only records connected to a current deal
-- assignment. Institution-wide reads are reserved for elevated/read-only roles.

drop policy "deals_read_member" on public.deals;
create policy "deals_read_authorized" on public.deals
  for select to authenticated using (
    exists (
      select 1 from public.organization_memberships membership
      where membership.organization_id = deals.organization_id
        and membership.user_id = (select auth.uid())
        and membership.is_active
        and membership.role in ('owner', 'administrator', 'viewer')
    )
    or exists (
      select 1 from public.deal_assignments assignment
      where assignment.organization_id = deals.organization_id
        and assignment.deal_id = deals.id
        and assignment.user_id = (select auth.uid())
        and assignment.ended_at is null
    )
  );

drop policy "borrowers_read_member" on public.borrowers;
create policy "borrowers_read_authorized" on public.borrowers
  for select to authenticated using (
    exists (
      select 1 from public.organization_memberships membership
      where membership.organization_id = borrowers.organization_id
        and membership.user_id = (select auth.uid())
        and membership.is_active
        and membership.role in ('owner', 'administrator', 'viewer')
    )
    or exists (
      select 1
      from public.deals deal
      join public.deal_assignments assignment
        on assignment.organization_id = deal.organization_id
        and assignment.deal_id = deal.id
      where deal.organization_id = borrowers.organization_id
        and deal.borrower_id = borrowers.id
        and deal.archived_at is null
        and assignment.user_id = (select auth.uid())
        and assignment.ended_at is null
    )
  );

drop policy "borrower_contacts_read_member" on public.borrower_contacts;
create policy "borrower_contacts_read_authorized" on public.borrower_contacts
  for select to authenticated using (
    exists (
      select 1 from public.organization_memberships membership
      where membership.organization_id = borrower_contacts.organization_id
        and membership.user_id = (select auth.uid())
        and membership.is_active
        and membership.role in ('owner', 'administrator', 'viewer')
    )
    or exists (
      select 1
      from public.deals deal
      join public.deal_assignments assignment
        on assignment.organization_id = deal.organization_id
        and assignment.deal_id = deal.id
      where deal.organization_id = borrower_contacts.organization_id
        and deal.borrower_id = borrower_contacts.borrower_id
        and deal.archived_at is null
        and assignment.user_id = (select auth.uid())
        and assignment.ended_at is null
    )
  );
