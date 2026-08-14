-- Internal golden-loan factory. This completes the existing canonical credit,
-- closing, funding, boarding, and portfolio model without introducing a
-- parallel ledger. Runtime exposure remains controlled by the web application.

create function public.require_golden_loan_operator(
  p_organization_id uuid,
  p_roles public.organization_role[]
) returns public.organization_role
language plpgsql security definer set search_path = '' as $$
declare v_role public.organization_role;
begin
  select m.role into v_role
  from public.organization_memberships m
  where m.organization_id = p_organization_id
    and m.user_id = (select auth.uid()) and m.is_active;
  if v_role is null or not (v_role = any(p_roles)) then
    raise exception using errcode='42501', message='Golden-loan operation permission denied.';
  end if;
  if not exists (
    select 1 from public.organization_product_modules e
    where e.organization_id=p_organization_id and e.module_key='underwriting'
      and e.status in ('trial','active') and e.starts_at <= now()
      and (e.ends_at is null or e.ends_at > now())
  ) then raise exception using errcode='42501', message='Underwriting entitlement required.';
  end if;
  return v_role;
end $$;
revoke all on function public.require_golden_loan_operator(uuid,public.organization_role[]) from public,anon,authenticated;

create function public.certify_credit_memo(
  p_organization_id uuid,p_deal_id uuid,p_memo_id uuid,
  p_statement text,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid := (select auth.uid()); v_result jsonb;
begin
  perform public.require_golden_loan_operator(p_organization_id,array['owner','administrator','underwriter']::public.organization_role[]);
  if length(trim(coalesce(p_statement,''))) < 8 or length(trim(coalesce(p_idempotency_key,''))) not between 8 and 160 then raise exception using errcode='22023',message='Invalid memo certification.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text||':'||trim(p_idempotency_key),0));
  select e.payload->'result' into v_result from public.audit_events e where e.organization_id=p_organization_id and e.idempotency_key='memo-certify:'||trim(p_idempotency_key);
  if v_result is not null then return v_result||jsonb_build_object('replayed',true); end if;
  update public.credit_memos set status='certified',certified_at=now(),certified_by=v_actor,certification_statement=trim(p_statement)
  where id=p_memo_id and organization_id=p_organization_id and deal_id=p_deal_id and status='draft';
  if not found then raise exception using errcode='23514',message='Draft credit memo required.'; end if;
  v_result:=jsonb_build_object('memoId',p_memo_id,'dealId',p_deal_id,'replayed',false);
  insert into public.audit_events(organization_id,actor_user_id,event_type,entity_type,entity_id,correlation_id,idempotency_key,payload)
  values(p_organization_id,v_actor,'credit.memo_certified','credit_memo',p_memo_id,gen_random_uuid(),'memo-certify:'||trim(p_idempotency_key),jsonb_build_object('result',v_result));
  return v_result;
end $$;

create function public.record_credit_committee_vote(
  p_organization_id uuid,p_deal_id uuid,p_memo_id uuid,p_vote text,p_rationale text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid := (select auth.uid()); v_id uuid;
begin
  perform public.require_golden_loan_operator(p_organization_id,array['owner','administrator','underwriter']::public.organization_role[]);
  if p_vote not in ('approve','decline','abstain','return') or length(trim(coalesce(p_rationale,'')))<3 then raise exception using errcode='22023',message='Invalid committee vote.'; end if;
  if not exists(select 1 from public.credit_memos m where m.id=p_memo_id and m.organization_id=p_organization_id and m.deal_id=p_deal_id and m.status='certified') then raise exception using errcode='23514',message='Certified credit memo required.'; end if;
  insert into public.credit_committee_votes(organization_id,deal_id,memo_id,voter_user_id,vote,rationale)
  values(p_organization_id,p_deal_id,p_memo_id,v_actor,p_vote,trim(p_rationale))
  on conflict(memo_id,voter_user_id) do update set vote=excluded.vote,rationale=excluded.rationale,created_at=now() returning id into v_id;
  insert into public.audit_events(organization_id,actor_user_id,event_type,entity_type,entity_id,correlation_id,payload)
  values(p_organization_id,v_actor,'credit.committee_vote_recorded','credit_memo',p_memo_id,gen_random_uuid(),jsonb_build_object('voteId',v_id,'vote',p_vote));
  return jsonb_build_object('voteId',v_id,'memoId',p_memo_id);
end $$;

create function public.record_human_credit_decision(
  p_organization_id uuid,p_deal_id uuid,p_memo_id uuid,p_decision public.credit_decision_type,
  p_rationale text,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid := (select auth.uid()); v_role public.organization_role; v_id uuid; v_snapshot jsonb; v_hash text; v_result jsonb;
begin
  v_role:=public.require_golden_loan_operator(p_organization_id,array['owner','administrator','underwriter']::public.organization_role[]);
  if length(trim(coalesce(p_rationale,'')))<3 or length(trim(coalesce(p_idempotency_key,''))) not between 8 and 160 then raise exception using errcode='22023',message='Invalid credit decision.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text||':'||trim(p_idempotency_key),0));
  select e.payload->'result' into v_result from public.audit_events e where e.organization_id=p_organization_id and e.idempotency_key='credit-decision:'||trim(p_idempotency_key);
  if v_result is not null then return v_result||jsonb_build_object('replayed',true); end if;
  if not exists(select 1 from public.credit_memos m where m.id=p_memo_id and m.organization_id=p_organization_id and m.deal_id=p_deal_id and m.status='certified') then raise exception using errcode='23514',message='Certified credit memo required.'; end if;
  if p_decision in ('approved','approved_with_conditions') and not exists(select 1 from public.credit_committee_votes v where v.memo_id=p_memo_id and v.organization_id=p_organization_id and v.vote='approve') then raise exception using errcode='23514',message='Committee approval required.'; end if;
  v_snapshot:=jsonb_build_object('memoId',p_memo_id,'decision',p_decision,'rationale',trim(p_rationale),'approver',v_actor,'role',v_role,'decidedAt',now());
  v_hash:=encode(extensions.digest(convert_to(v_snapshot::text,'UTF8'),'sha256'),'hex');
  insert into public.credit_decisions(organization_id,deal_id,memo_id,decision,rationale,approver_user_id,approver_role,decision_snapshot,decision_hash)
  values(p_organization_id,p_deal_id,p_memo_id,p_decision,trim(p_rationale),v_actor,v_role,v_snapshot,v_hash) returning id into v_id;
  update public.deals set stage=case when p_decision in('approved','approved_with_conditions') then 'credit_approval'::public.deal_stage when p_decision='declined' then 'declined'::public.deal_stage else 'underwriting'::public.deal_stage end,updated_at=now(),version=version+1 where id=p_deal_id and organization_id=p_organization_id;
  v_result:=jsonb_build_object('decisionId',v_id,'dealId',p_deal_id,'decision',p_decision,'replayed',false);
  insert into public.audit_events(organization_id,actor_user_id,event_type,entity_type,entity_id,correlation_id,idempotency_key,payload)
  values(p_organization_id,v_actor,'credit.human_decision_recorded','credit_decision',v_id,gen_random_uuid(),'credit-decision:'||trim(p_idempotency_key),jsonb_build_object('result',v_result,'decisionHash',v_hash));
  return v_result;
end $$;

create function public.create_closing_requirement(
 p_organization_id uuid,p_deal_id uuid,p_title text,p_due_at timestamptz,p_required boolean,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=(select auth.uid());v_id uuid;v_result jsonb;
begin
 perform public.require_golden_loan_operator(p_organization_id,array['owner','administrator','closer']::public.organization_role[]);
 if length(trim(coalesce(p_title,''))) not between 2 and 200 or length(trim(coalesce(p_idempotency_key,''))) not between 8 and 160 then raise exception using errcode='22023',message='Invalid closing requirement.';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text||':'||trim(p_idempotency_key),0));
 select e.payload->'result' into v_result from public.audit_events e where e.organization_id=p_organization_id and e.idempotency_key='closing-create:'||trim(p_idempotency_key);if v_result is not null then return v_result||jsonb_build_object('replayed',true);end if;
 insert into public.closing_requirements(organization_id,deal_id,title,due_at,is_required,created_by)values(p_organization_id,p_deal_id,trim(p_title),p_due_at,p_required,v_actor)returning id into v_id;
 update public.deals set stage='closing',updated_at=now(),version=version+1 where id=p_deal_id and organization_id=p_organization_id and stage in('credit_approval','commitment','closing');
 v_result:=jsonb_build_object('requirementId',v_id,'dealId',p_deal_id,'replayed',false);
 insert into public.audit_events(organization_id,actor_user_id,event_type,entity_type,entity_id,correlation_id,idempotency_key,payload)values(p_organization_id,v_actor,'closing.requirement_created','closing_requirement',v_id,gen_random_uuid(),'closing-create:'||trim(p_idempotency_key),jsonb_build_object('result',v_result));return v_result;
end $$;

create function public.resolve_closing_requirement(
 p_organization_id uuid,p_requirement_id uuid,p_status public.lifecycle_item_status,p_rationale text,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=(select auth.uid());v_deal uuid;v_result jsonb;
begin
 perform public.require_golden_loan_operator(p_organization_id,array['owner','administrator','closer']::public.organization_role[]);
 if p_status='open' or length(trim(coalesce(p_rationale,'')))<3 then raise exception using errcode='22023',message='Invalid closing resolution.';end if;
 update public.closing_requirements set status=p_status,resolution_rationale=trim(p_rationale),resolved_by=v_actor,resolved_at=now() where id=p_requirement_id and organization_id=p_organization_id and status='open' returning deal_id into v_deal;
 if v_deal is null then raise exception using errcode='23514',message='Open closing requirement required.';end if;
 v_result:=jsonb_build_object('requirementId',p_requirement_id,'dealId',v_deal,'status',p_status);
 insert into public.audit_events(organization_id,actor_user_id,event_type,entity_type,entity_id,correlation_id,idempotency_key,payload)values(p_organization_id,v_actor,'closing.requirement_resolved','closing_requirement',p_requirement_id,gen_random_uuid(),'closing-resolve:'||trim(p_idempotency_key),jsonb_build_object('result',v_result));return v_result;
end $$;

create function public.create_portfolio_covenant(
 p_organization_id uuid,p_servicing_account_id uuid,p_title text,p_due_date date,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=(select auth.uid());v_id uuid;v_result jsonb;
begin
 perform public.require_golden_loan_operator(p_organization_id,array['owner','administrator','lender','underwriter']::public.organization_role[]);
 if length(trim(coalesce(p_title,''))) not between 2 and 200 or p_due_date is null or length(trim(coalesce(p_idempotency_key,''))) not between 8 and 160 then raise exception using errcode='22023',message='Invalid covenant.';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text||':'||trim(p_idempotency_key),0));
 select e.payload->'result' into v_result from public.audit_events e where e.organization_id=p_organization_id and e.idempotency_key='covenant:'||trim(p_idempotency_key);if v_result is not null then return v_result||jsonb_build_object('replayed',true);end if;
 insert into public.portfolio_covenants(organization_id,servicing_account_id,title,due_date,owner_user_id)values(p_organization_id,p_servicing_account_id,trim(p_title),p_due_date,v_actor)returning id into v_id;
 v_result:=jsonb_build_object('covenantId',v_id,'servicingAccountId',p_servicing_account_id);
 insert into public.audit_events(organization_id,actor_user_id,event_type,entity_type,entity_id,correlation_id,idempotency_key,payload)values(p_organization_id,v_actor,'portfolio.covenant_created','portfolio_covenant',v_id,gen_random_uuid(),'covenant:'||trim(p_idempotency_key),jsonb_build_object('result',v_result));return v_result;
end $$;

create function public.create_credit_condition(
 p_organization_id uuid,p_deal_id uuid,p_memo_id uuid,p_description text,p_due_at timestamptz,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=(select auth.uid());v_id uuid;v_result jsonb;
begin
 perform public.require_golden_loan_operator(p_organization_id,array['owner','administrator','underwriter']::public.organization_role[]);
 if length(trim(coalesce(p_description,''))) not between 3 and 1000 or length(trim(coalesce(p_idempotency_key,''))) not between 8 and 160 then raise exception using errcode='22023',message='Invalid credit condition.';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text||':'||trim(p_idempotency_key),0));
 select e.payload->'result' into v_result from public.audit_events e where e.organization_id=p_organization_id and e.idempotency_key='condition-create:'||trim(p_idempotency_key);if v_result is not null then return v_result||jsonb_build_object('replayed',true);end if;
 if not exists(select 1 from public.credit_memos m where m.id=p_memo_id and m.organization_id=p_organization_id and m.deal_id=p_deal_id and m.status='certified') then raise exception using errcode='23514',message='Certified credit memo required.';end if;
 insert into public.credit_conditions(organization_id,deal_id,memo_id,description,owner_user_id,due_at)values(p_organization_id,p_deal_id,p_memo_id,trim(p_description),v_actor,p_due_at)returning id into v_id;
 v_result:=jsonb_build_object('conditionId',v_id,'dealId',p_deal_id,'replayed',false);
 insert into public.audit_events(organization_id,actor_user_id,event_type,entity_type,entity_id,correlation_id,idempotency_key,payload)values(p_organization_id,v_actor,'credit.condition_created','credit_condition',v_id,gen_random_uuid(),'condition-create:'||trim(p_idempotency_key),jsonb_build_object('result',v_result));return v_result;
end $$;

create function public.golden_authorize_deal_funding(p_organization_id uuid,p_deal_id uuid,p_decision_id uuid,p_amount numeric,p_evidence_reference text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$begin perform public.require_golden_loan_operator(p_organization_id,array['owner','administrator','closer']::public.organization_role[]);return public.authorize_deal_funding(p_organization_id,p_deal_id,p_decision_id,p_amount,p_evidence_reference,p_idempotency_key);end$$;
create function public.golden_board_funded_deal(p_organization_id uuid,p_deal_id uuid,p_account_number text,p_next_review_date date,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$begin perform public.require_golden_loan_operator(p_organization_id,array['owner','administrator','closer']::public.organization_role[]);return public.board_funded_deal(p_organization_id,p_deal_id,p_account_number,p_next_review_date,p_idempotency_key);end$$;

revoke all on function public.certify_credit_memo(uuid,uuid,uuid,text,text),public.record_credit_committee_vote(uuid,uuid,uuid,text,text),public.record_human_credit_decision(uuid,uuid,uuid,public.credit_decision_type,text,text),public.create_closing_requirement(uuid,uuid,text,timestamptz,boolean,text),public.resolve_closing_requirement(uuid,uuid,public.lifecycle_item_status,text,text),public.create_portfolio_covenant(uuid,uuid,text,date,text),public.create_credit_condition(uuid,uuid,uuid,text,timestamptz,text),public.golden_authorize_deal_funding(uuid,uuid,uuid,numeric,text,text),public.golden_board_funded_deal(uuid,uuid,text,date,text) from public,anon;
grant execute on function public.certify_credit_memo(uuid,uuid,uuid,text,text),public.record_credit_committee_vote(uuid,uuid,uuid,text,text),public.record_human_credit_decision(uuid,uuid,uuid,public.credit_decision_type,text,text),public.create_closing_requirement(uuid,uuid,text,timestamptz,boolean,text),public.resolve_closing_requirement(uuid,uuid,public.lifecycle_item_status,text,text),public.create_portfolio_covenant(uuid,uuid,text,date,text),public.create_credit_condition(uuid,uuid,uuid,text,timestamptz,text),public.golden_authorize_deal_funding(uuid,uuid,uuid,numeric,text,text),public.golden_board_funded_deal(uuid,uuid,text,date,text) to authenticated;
