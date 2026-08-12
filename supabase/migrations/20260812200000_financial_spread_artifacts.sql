create type public.financial_spread_status as enum ('needs_review', 'certified', 'superseded');

create table public.financial_spreads (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, job_id uuid not null, deal_id uuid not null,
  spread_type text not null check (spread_type in ('business','personal','global_cash_flow','rent_roll','t12')),
  contract_version text not null check (contract_version='buddy-financial-spread.v1'), schema_version text not null, engine_version text not null,
  status public.financial_spread_status not null default 'needs_review', created_at timestamptz not null default now(),
  certified_at timestamptz, certified_by uuid references auth.users(id) on delete restrict, supersedes_spread_id uuid references public.financial_spreads(id) on delete restrict,
  unique(id,organization_id), unique(job_id,spread_type,schema_version,engine_version),
  foreign key(job_id,organization_id) references public.underwriting_jobs(id,organization_id) on delete restrict,
  foreign key(deal_id,organization_id) references public.deals(id,organization_id) on delete restrict,
  check ((status='certified' and certified_at is not null and certified_by is not null) or status<>'certified')
);

create table public.financial_facts (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, spread_id uuid not null, fact_key text not null check (fact_key ~ '^[a-z][a-z0-9_.-]{2,119}$'),
  owner_type text not null check(owner_type in ('business','individual','global')), owner_entity_id uuid,
  period_kind text not null check(period_kind in ('annual','interim','year_to_date','trailing_twelve_months','as_of')), period_start date, period_end date not null,
  value jsonb not null, unit text not null check(unit in ('currency','ratio','percent','count','text')), currency text check(currency is null or currency ~ '^[A-Z]{3}$'),
  confidence numeric(5,4) check(confidence is null or confidence between 0 and 1), derivation text not null check(derivation in ('extracted','calculated','reviewer_adjusted')),
  formula_ref text, input_fact_keys text[] not null default '{}', evidence jsonb not null default '[]'::jsonb check(jsonb_typeof(evidence)='array'), created_at timestamptz not null default now(),
  foreign key(spread_id,organization_id) references public.financial_spreads(id,organization_id) on delete cascade,
  unique nulls not distinct(spread_id,owner_type,owner_entity_id,period_end,fact_key),
  check((owner_type='global' and owner_entity_id is null) or (owner_type<>'global' and owner_entity_id is not null)),
  check(period_start is null or period_start<=period_end), check((unit='currency' and currency is not null) or unit<>'currency'),
  check((derivation='calculated' and formula_ref is not null and cardinality(input_fact_keys)>0) or derivation<>'calculated'),
  check((derivation='extracted' and jsonb_array_length(evidence)>0) or derivation<>'extracted')
);

create index financial_spreads_deal_idx on public.financial_spreads(organization_id,deal_id,created_at desc);
create index financial_facts_key_period_idx on public.financial_facts(organization_id,fact_key,period_end desc);
alter table public.financial_spreads enable row level security; alter table public.financial_facts enable row level security;
revoke all on public.financial_spreads,public.financial_facts from public,anon,authenticated;
grant select on public.financial_spreads,public.financial_facts to authenticated;
create policy "financial_spreads_read_authorized" on public.financial_spreads for select to authenticated using(exists(select 1 from public.deals deal where deal.id=financial_spreads.deal_id and deal.organization_id=financial_spreads.organization_id));
create policy "financial_facts_read_authorized" on public.financial_facts for select to authenticated using(exists(select 1 from public.financial_spreads spread where spread.id=financial_facts.spread_id and spread.organization_id=financial_facts.organization_id));
comment on table public.financial_spreads is 'Derived Buddy Underwriter financial spreads. Writes and certification commands remain uncommissioned.';
