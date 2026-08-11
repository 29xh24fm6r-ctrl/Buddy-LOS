create type public.readiness_item_status as enum ('not_started', 'requested', 'received', 'in_review', 'satisfied', 'waived', 'exception');
create type public.readiness_item_category as enum ('application', 'borrower', 'financial', 'collateral', 'legal', 'compliance', 'credit', 'other');

create table public.application_checklist_items (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, deal_id uuid not null,
  application_id uuid not null, category public.readiness_item_category not null, label text not null check (char_length(label) between 2 and 200),
  status public.readiness_item_status not null default 'not_started', is_required boolean not null default true,
  due_date date, satisfied_at timestamptz, satisfied_by uuid references auth.users(id) on delete restrict,
  notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (deal_id, organization_id) references public.deals(id, organization_id) on delete cascade,
  foreign key (application_id, organization_id) references public.loan_applications(id, organization_id) on delete cascade,
  check ((status = 'satisfied' and satisfied_at is not null) or status <> 'satisfied')
);

create table public.deal_document_requirements (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, deal_id uuid not null,
  category public.readiness_item_category not null, document_type text not null check (char_length(document_type) between 2 and 160),
  description text, status public.readiness_item_status not null default 'not_started', is_required boolean not null default true,
  due_date date, received_at timestamptz, reviewed_at timestamptz, reviewed_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id, organization_id), unique (deal_id, document_type),
  foreign key (deal_id, organization_id) references public.deals(id, organization_id) on delete cascade
);

create index application_checklist_deal_status_idx on public.application_checklist_items (organization_id, deal_id, status);
create index document_requirements_deal_status_idx on public.deal_document_requirements (organization_id, deal_id, status);
alter table public.application_checklist_items enable row level security;
alter table public.deal_document_requirements enable row level security;
revoke all on public.application_checklist_items, public.deal_document_requirements from anon;
revoke all on public.application_checklist_items, public.deal_document_requirements from authenticated;
grant select on public.application_checklist_items, public.deal_document_requirements to authenticated;

create policy "application_checklist_read_authorized" on public.application_checklist_items for select to authenticated using (
  exists (select 1 from public.deals deal where deal.id = application_checklist_items.deal_id and deal.organization_id = application_checklist_items.organization_id)
);
create policy "document_requirements_read_authorized" on public.deal_document_requirements for select to authenticated using (
  exists (select 1 from public.deals deal where deal.id = deal_document_requirements.deal_id and deal.organization_id = deal_document_requirements.organization_id)
);

comment on table public.application_checklist_items is 'Application completeness evidence. Writes remain unavailable until governed underwriting commands are commissioned.';
comment on table public.deal_document_requirements is 'Required-document readiness metadata only; file bytes belong in private Supabase Storage after storage controls are commissioned.';
