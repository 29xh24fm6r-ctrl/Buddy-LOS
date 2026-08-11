-- Safe user-facing wrapper around the original default-off reservation command.
-- It closes idempotency replay ambiguity before delegating new reservations.
create function public.prepare_document_upload_v2(
  p_organization_id uuid, p_deal_id uuid, p_requirement_id uuid, p_logical_document_id uuid,
  p_original_file_name text, p_mime_type text, p_size_bytes bigint, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_event public.audit_events%rowtype; v_result jsonb;
begin
  if v_actor is null then raise exception using errcode='42501', message='Authentication required.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text || ':' || trim(coalesce(p_idempotency_key,'')),0));
  select * into v_event from public.audit_events e where e.organization_id=p_organization_id and e.idempotency_key=trim(p_idempotency_key);
  if found then
    if v_event.actor_user_id <> v_actor or v_event.event_type <> 'document_upload.prepared'
      or v_event.payload->>'dealId' <> p_deal_id::text
      or v_event.payload->>'mimeType' <> p_mime_type
      or (v_event.payload->>'sizeBytes')::bigint <> p_size_bytes
      or v_event.payload->>'originalFileName' <> trim(p_original_file_name)
      or coalesce(v_event.payload->>'requirementId','') <> coalesce(p_requirement_id::text,'')
      or coalesce(v_event.payload->>'logicalDocumentId','') <> coalesce(p_logical_document_id::text,'')
    then raise exception using errcode='23505', message='Document upload idempotency conflict.'; end if;
    return (v_event.payload->'result') || jsonb_build_object('replayed',true);
  end if;
  v_result := public.prepare_document_upload(p_organization_id,p_deal_id,p_requirement_id,p_logical_document_id,p_original_file_name,p_mime_type,p_size_bytes,p_idempotency_key);
  update public.audit_events set payload = payload || jsonb_build_object(
    'originalFileName',trim(p_original_file_name),'requirementId',p_requirement_id,
    'logicalDocumentId',p_logical_document_id
  ) where organization_id=p_organization_id and idempotency_key=trim(p_idempotency_key);
  return v_result;
end; $$;
revoke all on function public.prepare_document_upload_v2(uuid,uuid,uuid,uuid,text,text,bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.prepare_document_upload_v2(uuid,uuid,uuid,uuid,text,text,bigint,text) to authenticated;

create function public.authorize_pending_document_finalize(p_organization_id uuid,p_document_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid := (select auth.uid()); v_doc public.deal_documents%rowtype;
begin
  if v_actor is null then raise exception using errcode='42501',message='Authentication required.'; end if;
  select d.* into v_doc from public.deal_documents d join public.deals deal on deal.id=d.deal_id and deal.organization_id=d.organization_id
  where d.id=p_document_id and d.organization_id=p_organization_id and d.security_status='pending_upload' and deal.archived_at is null;
  if not found then raise exception using errcode='22023',message='Pending document not found.'; end if;
  if not exists (select 1 from public.organization_memberships m where m.organization_id=p_organization_id and m.user_id=v_actor and m.is_active and (
    m.role in ('owner','administrator') or exists (select 1 from public.deal_assignments a where a.organization_id=p_organization_id and a.deal_id=v_doc.deal_id and a.user_id=v_actor and a.ended_at is null)
  )) then raise exception using errcode='42501',message='Document permission denied.'; end if;
  return jsonb_build_object('documentId',v_doc.id,'bucket',v_doc.storage_bucket,'path',v_doc.storage_path,'mimeType',v_doc.mime_type,'sizeBytes',v_doc.size_bytes);
end; $$;
revoke all on function public.authorize_pending_document_finalize(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.authorize_pending_document_finalize(uuid,uuid) to authenticated;

create function public.record_document_upload_persisted(p_document_id uuid,p_sha256 text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_doc public.deal_documents%rowtype;
begin
  if (select auth.jwt()->>'role') is distinct from 'service_role' then raise exception using errcode='42501',message='Trusted document server required.'; end if;
  if p_sha256 !~ '^[0-9a-f]{64}$' then raise exception using errcode='22023',message='Valid SHA-256 required.'; end if;
  select * into v_doc from public.deal_documents d where d.id=p_document_id for update;
  if not found then raise exception using errcode='22023',message='Document not found.'; end if;
  if v_doc.security_status='quarantined' and v_doc.sha256=p_sha256 then return jsonb_build_object('documentId',v_doc.id,'securityStatus','quarantined','replayed',true); end if;
  if v_doc.security_status<>'pending_upload' then raise exception using errcode='55000',message='Document upload transition is closed.'; end if;
  update public.deal_documents set security_status='quarantined',sha256=p_sha256 where id=v_doc.id;
  insert into public.audit_events(organization_id,actor_user_id,event_type,entity_type,entity_id,correlation_id,idempotency_key,source,payload)
  values(v_doc.organization_id,v_doc.uploaded_by,'document_upload.persisted','deal_document',v_doc.id,gen_random_uuid(),'document-upload-persisted:'||v_doc.id::text,'buddy-los-server',jsonb_build_object('dealId',v_doc.deal_id,'sha256',p_sha256,'sizeBytes',v_doc.size_bytes,'mimeType',v_doc.mime_type));
  return jsonb_build_object('documentId',v_doc.id,'securityStatus','quarantined','replayed',false);
end; $$;
revoke all on function public.record_document_upload_persisted(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.record_document_upload_persisted(uuid,text) to service_role;

-- Signed upload tokens are exact-path capabilities; direct storage.objects
-- policies remain absent and ordinary users still cannot list or read objects.
