create type public.document_intelligence_review_status as enum ('needs_review', 'reviewed', 'superseded');

create table public.document_intelligence_artifacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  job_id uuid not null,
  deal_id uuid not null,
  document_id uuid not null,
  document_version_id uuid not null,
  document_sha256 text not null check (document_sha256 ~ '^[0-9a-f]{64}$'),
  contract_version text not null check (contract_version = 'buddy-document-intelligence.v1'),
  provider text not null check (char_length(provider) between 2 and 120),
  model text,
  engine_version text not null check (char_length(engine_version) between 1 and 120),
  classifier_version text not null check (char_length(classifier_version) between 1 and 120),
  canonical_type text not null check (char_length(canonical_type) between 2 and 160),
  classification_tier text not null check (classification_tier in ('deterministic_anchor','deterministic_structural','ai_assist','unclassified')),
  classification_confidence numeric(5,4) not null check (classification_confidence between 0 and 1),
  review_status public.document_intelligence_review_status not null,
  artifact jsonb not null check (jsonb_typeof(artifact) = 'object'),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete restrict,
  unique (job_id, document_version_id, engine_version),
  foreign key (job_id, organization_id) references public.underwriting_jobs(id, organization_id) on delete restrict,
  foreign key (deal_id, organization_id) references public.deals(id, organization_id) on delete restrict,
  foreign key (document_id, organization_id) references public.deal_documents(id, organization_id) on delete restrict,
  check (document_id = document_version_id),
  check ((review_status = 'reviewed' and reviewed_at is not null and reviewed_by is not null) or review_status <> 'reviewed'),
  check (classification_tier <> 'ai_assist' or review_status = 'needs_review')
);

create index document_intelligence_artifacts_deal_idx on public.document_intelligence_artifacts (organization_id, deal_id, created_at desc);
alter table public.document_intelligence_artifacts enable row level security;
revoke all on public.document_intelligence_artifacts from public, anon, authenticated;
grant select on public.document_intelligence_artifacts to authenticated;
create policy "document_intelligence_artifacts_read_authorized" on public.document_intelligence_artifacts for select to authenticated using (
  exists (select 1 from public.deals deal where deal.id = document_intelligence_artifacts.deal_id and deal.organization_id = document_intelligence_artifacts.organization_id)
);

comment on table public.document_intelligence_artifacts is 'Versioned derived classification and extraction evidence. No insert command or provider execution is commissioned in this slice.';
