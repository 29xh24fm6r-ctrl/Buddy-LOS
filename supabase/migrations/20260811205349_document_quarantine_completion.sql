create table public.document_scan_events (
  id bigint generated always as identity primary key, organization_id uuid not null, deal_id uuid not null, document_id uuid not null,
  scanner_provider text not null check (char_length(scanner_provider) between 2 and 120), scanner_run_id text not null check (char_length(scanner_run_id) between 2 and 200),
  result public.document_security_status not null check (result in ('clean','rejected')), sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  engine_version text, signature_version text, detail jsonb not null default '{}'::jsonb, occurred_at timestamptz not null default now(),
  unique (scanner_provider, scanner_run_id),
  foreign key (document_id, organization_id) references public.deal_documents(id, organization_id) on delete restrict,
  foreign key (deal_id, organization_id) references public.deals(id, organization_id) on delete restrict
);
create index document_scan_events_document_idx on public.document_scan_events (organization_id, document_id, occurred_at desc);
alter table public.document_scan_events enable row level security;
revoke all on public.document_scan_events from anon, authenticated;

create function public.record_document_scan_result(
  p_organization_id uuid, p_document_id uuid, p_scanner_provider text, p_scanner_run_id text,
  p_result public.document_security_status, p_sha256 text, p_engine_version text, p_signature_version text, p_detail jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_document public.deal_documents%rowtype; v_existing public.document_scan_events%rowtype; v_result jsonb;
begin
  if (select auth.jwt()->>'role') is distinct from 'service_role' then raise exception using errcode = '42501', message = 'Trusted scanner authority required.'; end if;
  if p_result not in ('clean','rejected') then raise exception using errcode = '22023', message = 'Terminal scan result required.'; end if;
  if p_sha256 !~ '^[0-9a-f]{64}$' then raise exception using errcode = '22023', message = 'Valid SHA-256 required.'; end if;
  if char_length(trim(coalesce(p_scanner_provider,''))) not between 2 and 120 or char_length(trim(coalesce(p_scanner_run_id,''))) not between 2 and 200 then raise exception using errcode = '22023', message = 'Scanner identity required.'; end if;
  select * into v_existing from public.document_scan_events e where e.scanner_provider = trim(p_scanner_provider) and e.scanner_run_id = trim(p_scanner_run_id);
  if found then
    if v_existing.organization_id <> p_organization_id or v_existing.document_id <> p_document_id or v_existing.result <> p_result or v_existing.sha256 <> p_sha256 then raise exception using errcode = '23505', message = 'Scanner run identity conflict.'; end if;
    return jsonb_build_object('documentId',v_existing.document_id,'securityStatus',v_existing.result,'sha256',v_existing.sha256,'replayed',true);
  end if;
  select * into v_document from public.deal_documents d where d.id = p_document_id and d.organization_id = p_organization_id for update;
  if not found then raise exception using errcode = '22023', message = 'Document not found.'; end if;
  if v_document.security_status not in ('pending_upload','quarantined','scanning') then raise exception using errcode = '55000', message = 'Document scan transition is closed.'; end if;
  if v_document.sha256 is not null and v_document.sha256 <> p_sha256 then raise exception using errcode = '22000', message = 'Document hash mismatch.'; end if;
  insert into public.document_scan_events (organization_id,deal_id,document_id,scanner_provider,scanner_run_id,result,sha256,engine_version,signature_version,detail)
  values (p_organization_id,v_document.deal_id,p_document_id,trim(p_scanner_provider),trim(p_scanner_run_id),p_result,p_sha256,nullif(trim(p_engine_version),''),nullif(trim(p_signature_version),''),coalesce(p_detail,'{}'::jsonb));
  update public.deal_documents set security_status=p_result,sha256=p_sha256,scanned_at=now() where id=p_document_id and organization_id=p_organization_id;
  v_result:=jsonb_build_object('documentId',p_document_id,'securityStatus',p_result,'sha256',p_sha256,'replayed',false);
  insert into public.audit_events (organization_id,event_type,entity_type,entity_id,correlation_id,idempotency_key,source,payload)
  values (p_organization_id,'document_scan.completed','deal_document',p_document_id,gen_random_uuid(),'scan:'||trim(p_scanner_provider)||':'||trim(p_scanner_run_id),'scanner',jsonb_build_object('result',v_result,'dealId',v_document.deal_id,'engineVersion',p_engine_version,'signatureVersion',p_signature_version));
  return v_result;
end; $$;
revoke all on function public.record_document_scan_result(uuid,uuid,text,text,public.document_security_status,text,text,text,jsonb) from public,anon,authenticated,service_role;
comment on function public.record_document_scan_result(uuid,uuid,text,text,public.document_security_status,text,text,text,jsonb) is 'Trusted scanner terminal transition. Installed with execute revoked from every runtime role.';
