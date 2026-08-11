create type public.document_security_status as enum ('pending_upload', 'quarantined', 'scanning', 'clean', 'rejected', 'superseded');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('loan-documents', 'loan-documents', false, 52428800, array['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create table public.deal_documents (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, deal_id uuid not null,
  requirement_id uuid, logical_document_id uuid not null default gen_random_uuid(), version_number integer not null default 1 check (version_number > 0),
  original_file_name text not null check (char_length(original_file_name) between 1 and 255),
  storage_bucket text not null default 'loan-documents' check (storage_bucket = 'loan-documents'),
  storage_path text not null, mime_type text not null, size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 52428800),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'), security_status public.document_security_status not null default 'pending_upload',
  uploaded_by uuid not null references auth.users(id) on delete restrict, uploaded_at timestamptz not null default now(),
  scanned_at timestamptz, retained_until date, legal_hold boolean not null default false, supersedes_document_id uuid references public.deal_documents(id) on delete restrict,
  unique (id, organization_id), unique (logical_document_id, version_number), unique (storage_bucket, storage_path),
  foreign key (deal_id, organization_id) references public.deals(id, organization_id) on delete cascade,
  foreign key (requirement_id, organization_id) references public.deal_document_requirements(id, organization_id) on delete restrict,
  check ((security_status in ('clean', 'rejected') and scanned_at is not null) or security_status not in ('clean', 'rejected'))
);

create index deal_documents_deal_status_idx on public.deal_documents (organization_id, deal_id, security_status, uploaded_at desc);
alter table public.deal_documents enable row level security;
revoke all on public.deal_documents from anon, authenticated;
grant select on public.deal_documents to authenticated;
create policy "deal_documents_read_authorized" on public.deal_documents for select to authenticated using (
  exists (select 1 from public.deals deal where deal.id = deal_documents.deal_id and deal.organization_id = deal_documents.organization_id)
);

-- Deliberately no policies on storage.objects: object listing, download, upload,
-- replacement, and deletion all remain denied until commissioning.
comment on table public.deal_documents is 'Immutable loan document version metadata. Storage access and metadata writes remain uncommissioned.';
