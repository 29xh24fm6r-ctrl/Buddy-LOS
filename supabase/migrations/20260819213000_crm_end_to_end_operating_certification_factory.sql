-- CRM end-to-end operating certification factory.
-- Adds authoritative cross-record search and the reversible lifecycle commands
-- required by the governed CRM workspace.

create function public.crm_workspace_search_ids(
  p_organization_id uuid,
  p_view text,
  p_search text
) returns table(id uuid)
language sql stable security invoker set search_path = '' as $$
  with term as (
    select '%' || trim(coalesce(p_search, '')) || '%' as value
  ), matches as (
    select b.id
    from public.borrowers b cross join term t
    where p_view = 'companies' and b.organization_id = p_organization_id and b.archived_at is null
      and (b.legal_name ilike t.value or coalesce(b.external_reference, '') ilike t.value
        or exists(select 1 from public.borrower_contacts c where c.organization_id=b.organization_id and c.borrower_id=b.id and c.archived_at is null and (c.value ilike t.value or coalesce(c.label,'') ilike t.value)))
    union
    select p.id
    from public.crm_people p cross join term t
    where p_view = 'people' and p.organization_id = p_organization_id and p.archived_at is null
      and (p.first_name ilike t.value or p.last_name ilike t.value or coalesce(p.preferred_name,'') ilike t.value
        or coalesce(p.job_title,'') ilike t.value or exists(select 1 from public.crm_person_company_roles r join public.borrowers b on b.organization_id=r.organization_id and b.id=r.borrower_id where r.organization_id=p.organization_id and r.person_id=p.id and r.ends_on is null and (r.role_label ilike t.value or b.legal_name ilike t.value))
        or exists(select 1 from public.crm_person_contacts c where c.organization_id=p.organization_id and c.person_id=p.id and c.archived_at is null and (c.value ilike t.value or coalesce(c.label,'') ilike t.value)))
    union
    select c.id
    from public.borrower_contacts c join public.borrowers b on b.organization_id=c.organization_id and b.id=c.borrower_id cross join term t
    where p_view = 'contacts' and c.organization_id=p_organization_id and c.archived_at is null
      and (c.value ilike t.value or coalesce(c.label,'') ilike t.value or c.contact_kind::text ilike t.value or b.legal_name ilike t.value)
    union
    select r.id
    from public.borrower_relationships r join public.borrowers s on s.organization_id=r.organization_id and s.id=r.source_borrower_id left join public.borrowers b on b.organization_id=r.organization_id and b.id=r.target_borrower_id left join public.deals d on d.organization_id=r.organization_id and d.id=r.deal_id cross join term t
    where p_view='relationships' and r.organization_id=p_organization_id and (s.legal_name ilike t.value or coalesce(b.legal_name,'') ilike t.value or coalesce(d.name,'') ilike t.value or r.relationship_kind::text ilike t.value or coalesce(r.role_label,'') ilike t.value or coalesce(r.notes,'') ilike t.value)
    union
    select d.id
    from public.deals d join public.borrowers b on b.organization_id=d.organization_id and b.id=d.borrower_id cross join term t
    where p_view='opportunities' and d.organization_id=p_organization_id and d.archived_at is null and (d.name ilike t.value or b.legal_name ilike t.value or coalesce(d.deal_number,'') ilike t.value or coalesce(d.product_type,'') ilike t.value or d.stage::text ilike t.value)
    union
    select a.id
    from public.crm_activities a join public.borrowers b on b.organization_id=a.organization_id and b.id=a.borrower_id left join public.deals d on d.organization_id=a.organization_id and d.id=a.deal_id cross join term t
    where p_view='activities' and a.organization_id=p_organization_id and (a.subject ilike t.value or coalesce(a.notes,'') ilike t.value or a.activity_kind::text ilike t.value or b.legal_name ilike t.value or coalesce(d.name,'') ilike t.value)
    union
    select r.id
    from public.crm_referrals r join public.borrowers b on b.organization_id=r.organization_id and b.id=r.borrower_id left join public.borrowers s on s.organization_id=r.organization_id and s.id=r.source_borrower_id left join public.crm_people p on p.organization_id=r.organization_id and p.id=r.source_person_id left join public.deals d on d.organization_id=r.organization_id and d.id=r.deal_id cross join term t
    where p_view='referrals' and r.organization_id=p_organization_id and (b.legal_name ilike t.value or coalesce(s.legal_name,'') ilike t.value or coalesce(p.first_name||' '||p.last_name,'') ilike t.value or coalesce(d.name,'') ilike t.value or r.status::text ilike t.value or coalesce(r.notes,'') ilike t.value or coalesce(r.outcome,'') ilike t.value)
    union
    select a.id
    from public.crm_appointments a join public.borrowers b on b.organization_id=a.organization_id and b.id=a.borrower_id left join public.deals d on d.organization_id=a.organization_id and d.id=a.deal_id cross join term t
    where p_view='calendar' and a.organization_id=p_organization_id and (a.subject ilike t.value or b.legal_name ilike t.value or coalesce(d.name,'') ilike t.value or a.status::text ilike t.value or coalesce(a.location,'') ilike t.value or coalesce(a.notes,'') ilike t.value)
    union
    select tsk.id
    from public.deal_tasks tsk join public.deals d on d.organization_id=tsk.organization_id and d.id=tsk.deal_id join public.borrowers b on b.organization_id=d.organization_id and b.id=d.borrower_id cross join term t
    where p_view='tasks' and tsk.organization_id=p_organization_id and (tsk.title ilike t.value or coalesce(tsk.description,'') ilike t.value or tsk.status::text ilike t.value or d.name ilike t.value or b.legal_name ilike t.value)
  )
  select matches.id from matches;
$$;

create function public.reopen_crm_relationship(p_organization_id uuid,p_relationship_id uuid,p_idempotency_key text,p_expected_active boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid := (select auth.uid()); v_prior jsonb; v_source uuid; v_active boolean; v_result jsonb;
begin
  perform public.require_core_operator(p_organization_id);
  if char_length(trim(coalesce(p_idempotency_key,''))) not between 8 and 160 then raise exception using errcode='22023',message='Invalid relationship reopen command.';end if;
  select source_borrower_id,is_active into v_source,v_active from public.borrower_relationships where organization_id=p_organization_id and id=p_relationship_id for update;
  if v_source is null then raise exception using errcode='42501',message='Relationship unavailable.';end if;
  perform private.require_borrower_operator(p_organization_id,v_source,array['owner','administrator','lender']::public.organization_role[]);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text||':'||trim(p_idempotency_key),0));
  select e.payload->'result' into v_prior from public.audit_events e where e.organization_id=p_organization_id and e.idempotency_key=trim(p_idempotency_key);
  if v_prior is not null then return v_prior||jsonb_build_object('replayed',true);end if;
  if v_active is distinct from p_expected_active or v_active then raise exception using errcode='40001',message='Relationship state conflict.';end if;
  update public.borrower_relationships set is_active=true,ends_on=null,updated_at=now() where organization_id=p_organization_id and id=p_relationship_id;
  v_result:=jsonb_build_object('relationshipId',p_relationship_id,'active',true,'replayed',false);
  insert into public.audit_events(organization_id,actor_user_id,event_type,entity_type,entity_id,correlation_id,idempotency_key,payload)
  values(p_organization_id,v_actor,'crm.relationship_reopened','borrower_relationship',p_relationship_id,gen_random_uuid(),trim(p_idempotency_key),jsonb_build_object('result',v_result));
  return v_result;
end; $$;

create function public.crm_archived_records(p_organization_id uuid,p_view text)
returns table(id uuid,label text,version integer,entity text)
language plpgsql stable security definer set search_path='' as $$
begin
  perform public.require_core_operator(p_organization_id);
  if p_view='companies' then
    return query select b.id,b.legal_name,b.version,'company'::text from public.borrowers b
      where b.organization_id=p_organization_id and b.archived_at is not null and private.can_read_borrower(b.organization_id,b.id)
      order by b.legal_name limit 100;
  elsif p_view='people' then
    return query
      select p.id,p.first_name||' '||p.last_name,p.version,'person'::text from public.crm_people p
      where p.organization_id=p_organization_id and p.archived_at is not null and exists(select 1 from public.crm_person_company_roles r where r.organization_id=p.organization_id and r.person_id=p.id and private.can_read_borrower(r.organization_id,r.borrower_id))
      union all
      select c.id,b.legal_name||' · '||c.value,c.version,'contact'::text from public.borrower_contacts c join public.borrowers b on b.organization_id=c.organization_id and b.id=c.borrower_id
      where c.organization_id=p_organization_id and c.archived_at is not null and private.can_read_borrower(c.organization_id,c.borrower_id)
      order by 2 limit 200;
  end if;
end; $$;

create function public.restore_crm_record(p_organization_id uuid,p_entity text,p_entity_id uuid,p_idempotency_key text,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid := (select auth.uid()); v_prior jsonb; v_borrower_id uuid; v_version integer; v_result jsonb;
begin
  perform public.require_core_operator(p_organization_id);
  if p_entity not in ('company','contact','person') or char_length(trim(coalesce(p_idempotency_key,''))) not between 8 and 160 or p_expected_version<1 then raise exception using errcode='22023',message='Invalid CRM restore command.';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text||':'||trim(p_idempotency_key),0));
  select e.payload->'result' into v_prior from public.audit_events e where e.organization_id=p_organization_id and e.idempotency_key=trim(p_idempotency_key);
  if v_prior is not null then return v_prior||jsonb_build_object('replayed',true);end if;
  if p_entity='company' then
    select id,version into v_borrower_id,v_version from public.borrowers where organization_id=p_organization_id and id=p_entity_id and archived_at is not null for update;
    if v_borrower_id is null then raise exception using errcode='42501',message='Company unavailable.';end if;
    perform private.require_borrower_operator(p_organization_id,v_borrower_id,array['owner','administrator','lender']::public.organization_role[]);
    if v_version<>p_expected_version then raise exception using errcode='40001',message='Company version conflict.';end if;
    update public.borrowers set archived_at=null,updated_at=now(),version=version+1 where organization_id=p_organization_id and id=p_entity_id returning version into v_version;
  elsif p_entity='contact' then
    select borrower_id,version into v_borrower_id,v_version from public.borrower_contacts where organization_id=p_organization_id and id=p_entity_id and archived_at is not null for update;
    if v_borrower_id is null then raise exception using errcode='42501',message='Contact unavailable.';end if;
    perform private.require_borrower_operator(p_organization_id,v_borrower_id,array['owner','administrator','lender']::public.organization_role[]);
    if v_version<>p_expected_version then raise exception using errcode='40001',message='Contact version conflict.';end if;
    update public.borrower_contacts set archived_at=null,updated_at=now(),version=version+1 where organization_id=p_organization_id and id=p_entity_id returning version into v_version;
  else
    select r.borrower_id,p.version into v_borrower_id,v_version from public.crm_people p join public.crm_person_company_roles r on r.organization_id=p.organization_id and r.person_id=p.id where p.organization_id=p_organization_id and p.id=p_entity_id and p.archived_at is not null order by r.updated_at desc limit 1 for update of p;
    if v_borrower_id is null then raise exception using errcode='42501',message='Person unavailable.';end if;
    perform private.require_borrower_operator(p_organization_id,v_borrower_id,array['owner','administrator','lender']::public.organization_role[]);
    if v_version<>p_expected_version then raise exception using errcode='40001',message='Person version conflict.';end if;
    update public.crm_people set archived_at=null,updated_at=now(),version=version+1 where organization_id=p_organization_id and id=p_entity_id returning version into v_version;
    update public.crm_person_company_roles set ends_on=null,updated_at=now(),version=version+1 where id=(select id from public.crm_person_company_roles where organization_id=p_organization_id and person_id=p_entity_id order by updated_at desc limit 1);
    update public.crm_person_contacts set archived_at=null,updated_at=now() where organization_id=p_organization_id and person_id=p_entity_id;
  end if;
  v_result:=jsonb_build_object('entity',p_entity,'entityId',p_entity_id,'version',v_version,'restored',true,'replayed',false);
  insert into public.audit_events(organization_id,actor_user_id,event_type,entity_type,entity_id,correlation_id,idempotency_key,payload)
  values(p_organization_id,v_actor,'crm.'||p_entity||'_restored',p_entity,p_entity_id,gen_random_uuid(),trim(p_idempotency_key),jsonb_build_object('result',v_result,'borrowerId',v_borrower_id));
  return v_result;
end; $$;

revoke all on function public.crm_workspace_search_ids(uuid,text,text),public.crm_archived_records(uuid,text),public.reopen_crm_relationship(uuid,uuid,text,boolean),public.restore_crm_record(uuid,text,uuid,text,integer) from public,anon;
grant execute on function public.crm_workspace_search_ids(uuid,text,text),public.crm_archived_records(uuid,text),public.reopen_crm_relationship(uuid,uuid,text,boolean),public.restore_crm_record(uuid,text,uuid,text,integer) to authenticated;

comment on function public.crm_workspace_search_ids(uuid,text,text) is 'RLS-scoped authoritative search across each CRM workspace view.';
comment on function public.crm_archived_records(uuid,text) is 'Authorized archived CRM records available for governed restore.';
comment on function public.reopen_crm_relationship(uuid,uuid,text,boolean) is 'Governed reversible relationship lifecycle command.';
comment on function public.restore_crm_record(uuid,text,uuid,text,integer) is 'Governed restore command for archived CRM companies, contacts, and people.';
