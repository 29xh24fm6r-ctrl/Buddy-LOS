create function public.prepare_document_upload(
  p_organization_id uuid, p_deal_id uuid, p_requirement_id uuid, p_logical_document_id uuid,
  p_original_file_name text, p_mime_type text, p_size_bytes bigint, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid()); v_document_id uuid := gen_random_uuid();
  v_logical_id uuid := coalesce(p_logical_document_id, gen_random_uuid()); v_version integer;
  v_safe_name text; v_path text; v_result jsonb; v_existing jsonb;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'Authentication required.'; end if;
  if char_length(trim(coalesce(p_idempotency_key, ''))) not between 8 and 160 then raise exception using errcode = '22023', message = 'Invalid idempotency key.'; end if;
  if char_length(trim(coalesce(p_original_file_name, ''))) not between 1 and 255 then raise exception using errcode = '22023', message = 'Invalid file name.'; end if;
  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 52428800 then raise exception using errcode = '22023', message = 'Invalid file size.'; end if;
  if p_mime_type not in ('application/pdf','image/jpeg','image/png','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') then raise exception using errcode = '22023', message = 'Unsupported file type.'; end if;
  if not exists (select 1 from public.deals d where d.id = p_deal_id and d.organization_id = p_organization_id and d.archived_at is null and (
    exists (select 1 from public.organization_memberships m where m.organization_id = p_organization_id and m.user_id = v_actor and m.is_active and m.role in ('owner','administrator'))
    or exists (select 1 from public.deal_assignments a where a.organization_id = p_organization_id and a.deal_id = p_deal_id and a.user_id = v_actor and a.ended_at is null)
  )) then raise exception using errcode = '42501', message = 'Document permission denied.'; end if;
  if p_requirement_id is not null and not exists (select 1 from public.deal_document_requirements r where r.id = p_requirement_id and r.organization_id = p_organization_id and r.deal_id = p_deal_id) then raise exception using errcode = '22023', message = 'Invalid document requirement.'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text || ':' || trim(p_idempotency_key), 0));
  select e.payload -> 'result' into v_existing from public.audit_events e where e.organization_id = p_organization_id and e.idempotency_key = trim(p_idempotency_key);
  if v_existing is not null then return v_existing || jsonb_build_object('replayed', true); end if;
  if p_logical_document_id is not null and not exists (select 1 from public.deal_documents x where x.logical_document_id = p_logical_document_id and x.organization_id = p_organization_id and x.deal_id = p_deal_id) then raise exception using errcode = '22023', message = 'Invalid document lineage.'; end if;
  select coalesce(max(x.version_number), 0) + 1 into v_version from public.deal_documents x where x.logical_document_id = v_logical_id;
  v_safe_name := trim(both '_' from pg_catalog.regexp_replace(lower(trim(p_original_file_name)), '[^a-z0-9._-]+', '_', 'g'));
  if v_safe_name = '' then v_safe_name := 'document'; end if;
  v_path := p_organization_id::text || '/' || p_deal_id::text || '/' || v_logical_id::text || '/v' || v_version::text || '/' || v_safe_name;
  insert into public.deal_documents (id, organization_id, deal_id, requirement_id, logical_document_id, version_number, original_file_name, storage_path, mime_type, size_bytes, security_status, uploaded_by)
  values (v_document_id, p_organization_id, p_deal_id, p_requirement_id, v_logical_id, v_version, trim(p_original_file_name), v_path, p_mime_type, p_size_bytes, 'pending_upload', v_actor);
  v_result := jsonb_build_object('documentId',v_document_id,'logicalDocumentId',v_logical_id,'versionNumber',v_version,'bucket','loan-documents','path',v_path,'securityStatus','pending_upload','replayed',false);
  insert into public.audit_events (organization_id, actor_user_id, event_type, entity_type, entity_id, correlation_id, idempotency_key, payload)
  values (p_organization_id,v_actor,'document_upload.prepared','deal_document',v_document_id,gen_random_uuid(),trim(p_idempotency_key),jsonb_build_object('result',v_result,'dealId',p_deal_id,'mimeType',p_mime_type,'sizeBytes',p_size_bytes));
  return v_result;
end; $$;

revoke all on function public.prepare_document_upload(uuid,uuid,uuid,uuid,text,text,bigint,text) from public, anon, authenticated;
comment on function public.prepare_document_upload(uuid,uuid,uuid,uuid,text,text,bigint,text) is 'Reserves a tenant-bound quarantined document version. Installed without execute permission; does not authorize Storage access.';
