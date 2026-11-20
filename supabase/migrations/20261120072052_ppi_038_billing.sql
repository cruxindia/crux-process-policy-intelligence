-- PPI-038: billing (D-094). Packages (incl. custom per company), subscriptions, metered usage, monthly invoices with GST,
-- company billing details, disputes via tickets. Prices are the platform owner's decision: every seeded package is a DRAFT.
-- No payment collection. An invoice is "proforma" until the platform billing profile (legal name, GSTIN, address, state) is complete.

create table public.billing_plans (
  id                     uuid primary key default gen_random_uuid(),
  code                   text not null unique check (code ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'),
  name                   text not null check (length(trim(name)) > 1),
  description            text,
  monthly_fee            numeric(12,2) not null default 0 check (monthly_fee >= 0),
  included_people        int not null default 0 check (included_people >= 0),
  price_per_extra_person numeric(12,2) not null default 0 check (price_per_extra_person >= 0),
  included_ai_runs       int not null default 0 check (included_ai_runs >= 0),
  price_per_100_ai_runs  numeric(12,2) not null default 0 check (price_per_100_ai_runs >= 0),
  features               text[] not null default '{}',
  company_id             uuid references public.companies(id),     -- set = a custom package for that company only
  is_draft_price         boolean not null default true,            -- seeded examples stay "draft" until the owner saves prices
  status                 text not null default 'active' check (status in ('active', 'retired')),
  sort_order             int not null default 100,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index billing_plans_company_idx on public.billing_plans (company_id);
create trigger billing_plans_updated before update on public.billing_plans for each row execute function private.set_updated_at();

insert into public.billing_plans (code, name, description, monthly_fee, included_people, price_per_extra_person, included_ai_runs, price_per_100_ai_runs, features, sort_order) values
  ('STARTER', 'Starter', 'One department, up to 25 people', 15000, 25, 400, 2000, 250,
   array['AI discovery interviews', 'Process catalogue and maps', 'Tasks and tickets', 'Email support'], 10),
  ('GROWTH', 'Growth', 'Several departments, up to 100 people', 45000, 100, 350, 10000, 200,
   array['Everything in Starter', 'Company blueprint and CTQs', 'Expert board documents', 'Department validation', 'Document API'], 20),
  ('ENTERPRISE', 'Enterprise', 'Whole company, up to 300 people', 120000, 300, 300, 40000, 150,
   array['Everything in Growth', 'Dashboards and MIS', 'Dedicated AI capacity', 'Priority support'], 30);

create table public.company_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id),
  plan_id       uuid not null references public.billing_plans(id),
  starts_on     date not null default current_date,
  ends_on       date,
  discount_pct  numeric(5,2) not null default 0 check (discount_pct between 0 and 100),
  note          text,
  created_at    timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);
create unique index company_subscriptions_one_open on public.company_subscriptions (company_id) where ends_on is null;
create index company_subscriptions_plan_idx on public.company_subscriptions (plan_id);

create table public.company_billing_profiles (
  company_id    uuid primary key references public.companies(id),
  legal_name    text check (legal_name is null or length(legal_name) <= 200),
  gstin         text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$'),
  address       text check (address is null or length(address) <= 500),
  state_code    text check (state_code is null or state_code ~ '^[0-9]{2}$'),
  billing_email text check (billing_email is null or billing_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  updated_at    timestamptz not null default now()
);

create table public.invoices (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id),
  number         text unique,                                   -- assigned when issued: PREFIX/YY-YY/NNNN
  period_start   date not null,
  period_end     date not null,
  status         text not null default 'draft' check (status in ('draft', 'issued', 'paid', 'void')),
  disputed       boolean not null default false,
  proforma       boolean not null default true,
  plan_snapshot  jsonb not null,
  usage          jsonb not null,
  lines          jsonb not null,
  subtotal       numeric(12,2) not null,
  discount       numeric(12,2) not null default 0,
  taxable        numeric(12,2) not null,
  cgst           numeric(12,2) not null default 0,
  sgst           numeric(12,2) not null default 0,
  igst           numeric(12,2) not null default 0,
  total          numeric(12,2) not null,
  supplier       jsonb not null default '{}',
  recipient      jsonb not null default '{}',
  issued_at      timestamptz,
  due_on         date,
  paid_at        timestamptz,
  void_reason    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (company_id, period_start),
  check (period_end >= period_start),
  check (status = 'draft' or number is not null),
  check (status <> 'void' or void_reason is not null)
);
create index invoices_status_idx on public.invoices (status);
create trigger invoices_updated before update on public.invoices for each row execute function private.set_updated_at();
create trigger audit_invoices after insert or update on public.invoices for each row execute function private.audit_row();

-- Once issued, the amounts and parties of an invoice never change (only status / dispute flag / payment date / void reason).
create or replace function private.invoice_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status <> 'draft' and (new.subtotal, new.taxable, new.total, new.lines, new.number, new.supplier, new.recipient, new.period_start)
     is distinct from (old.subtotal, old.taxable, old.total, old.lines, old.number, old.supplier, old.recipient, old.period_start) then
    raise exception 'PPI_IMMUTABLE: an issued invoice cannot be changed; void it and issue a new one' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger invoices_guard before update on public.invoices for each row execute function private.invoice_guard();

alter table public.billing_plans enable row level security;
alter table public.company_subscriptions enable row level security;
alter table public.company_billing_profiles enable row level security;
alter table public.invoices enable row level security;
-- Company administrators see their own package (standard + their custom one), subscription, profile and issued invoices.
create policy billing_plans_read on public.billing_plans for select to authenticated using (
  (select private.is_platform_admin()) or (status = 'active' and company_id is null)
  or (company_id is not null and (select private.has_permission(company_id, 'org.manage'))));
create policy company_subscriptions_read on public.company_subscriptions for select to authenticated using (
  (select private.is_platform_admin()) or (select private.has_permission(company_id, 'org.manage')));
create policy company_billing_profiles_read on public.company_billing_profiles for select to authenticated using (
  (select private.is_platform_admin()) or (select private.has_permission(company_id, 'org.manage')));
create policy invoices_read on public.invoices for select to authenticated using (
  (select private.is_platform_admin()) or (status <> 'draft' and (select private.has_permission(company_id, 'org.manage'))));
revoke insert, update, delete, truncate, references, trigger on public.billing_plans, public.company_subscriptions,
  public.company_billing_profiles, public.invoices from authenticated, anon;
grant select on public.billing_plans, public.company_subscriptions, public.company_billing_profiles, public.invoices to authenticated;

-- Platform billing profile + invoice settings (owner fills these).
insert into private.platform_settings (key, value) values
  ('billing_legal_name', ''), ('billing_gstin', ''), ('billing_address', ''), ('billing_state_code', ''),
  ('invoice_prefix', 'PPI'), ('gst_rate', '18'), ('sac_code', ''), ('payment_terms_days', '15'), ('auto_issue', 'false')
on conflict (key) do nothing;
create or replace function private.setting(p_key text) returns text language sql stable security definer set search_path = '' as $$
  select value from private.platform_settings where key = p_key $$;

-- Usage in a period: people who took part (answered, raised or worked a ticket, replied to a request), AI runs, documents approved.
create or replace function private.company_usage(p_company uuid, p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = '' as $$
  with w as (select (p_from::timestamp at time zone 'Asia/Kolkata') a, ((p_to + 1)::timestamp at time zone 'Asia/Kolkata') b),
  people as (
    select x.answered_by_membership_id m from public.interview_answers x, w where x.company_id = p_company and x.answered_at >= w.a and x.answered_at < w.b
    union select requester_membership_id from public.tickets t, w where t.company_id = p_company and t.created_at >= w.a and t.created_at < w.b
    union select author_membership_id from public.ticket_comments c, w where c.company_id = p_company and c.created_at >= w.a and c.created_at < w.b
    union select responder_membership_id from public.clarification_responses r, w where r.company_id = p_company and r.created_at >= w.a and r.created_at < w.b)
  select jsonb_build_object(
    'active_people', (select count(distinct p.m) from people p join public.memberships m on m.id = p.m and m.member_kind = 'human' where p.m is not null),
    'ai_runs', (select count(*) from public.ai_runs r, w where r.company_id = p_company and r.status = 'succeeded' and r.created_at >= w.a and r.created_at < w.b),
    'documents_approved', (select count(*) from public.board_cases bc, w where bc.company_id = p_company and bc.status = 'approved' and bc.updated_at >= w.a and bc.updated_at < w.b),
    'members_total', (select count(*) from public.memberships m where m.company_id = p_company and m.status = 'active' and m.member_kind = 'human'))
$$;

-- The calculation (pure given plan, usage, discount and states). Amounts in INR, rounded to paise.
create or replace function private.invoice_calc(p_plan public.billing_plans, p_usage jsonb, p_discount numeric, p_supplier_state text, p_recipient_state text, p_gst numeric)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare v_lines jsonb := '[]'; v_sub numeric := 0; v_extra_people int; v_extra_ai int; v_packs int; v_disc numeric; v_taxable numeric;
        v_cgst numeric := 0; v_sgst numeric := 0; v_igst numeric := 0; v_intra boolean;
begin
  v_lines := v_lines || jsonb_build_object('label', p_plan.name || ' package — monthly fee', 'qty', 1, 'rate', p_plan.monthly_fee, 'amount', p_plan.monthly_fee);
  v_sub := p_plan.monthly_fee;
  v_extra_people := greatest(coalesce((p_usage ->> 'active_people')::int, 0) - p_plan.included_people, 0);
  if v_extra_people > 0 then
    v_lines := v_lines || jsonb_build_object('label', 'Additional active people (beyond ' || p_plan.included_people || ')', 'qty', v_extra_people,
      'rate', p_plan.price_per_extra_person, 'amount', round(v_extra_people * p_plan.price_per_extra_person, 2));
    v_sub := v_sub + round(v_extra_people * p_plan.price_per_extra_person, 2);
  end if;
  v_extra_ai := greatest(coalesce((p_usage ->> 'ai_runs')::int, 0) - p_plan.included_ai_runs, 0);
  if v_extra_ai > 0 then
    v_packs := ceil(v_extra_ai / 100.0);
    v_lines := v_lines || jsonb_build_object('label', 'Additional AI usage (' || v_extra_ai || ' runs beyond ' || p_plan.included_ai_runs || ', per 100)', 'qty', v_packs,
      'rate', p_plan.price_per_100_ai_runs, 'amount', round(v_packs * p_plan.price_per_100_ai_runs, 2));
    v_sub := v_sub + round(v_packs * p_plan.price_per_100_ai_runs, 2);
  end if;
  v_disc := round(v_sub * coalesce(p_discount, 0) / 100, 2);
  v_taxable := v_sub - v_disc;
  v_intra := p_supplier_state is not null and p_supplier_state <> '' and p_supplier_state = p_recipient_state;
  if v_intra then v_cgst := round(v_taxable * p_gst / 200, 2); v_sgst := v_cgst;
  else v_igst := round(v_taxable * p_gst / 100, 2); end if;
  return jsonb_build_object('lines', v_lines, 'subtotal', v_sub, 'discount', v_disc, 'taxable', v_taxable,
    'cgst', v_cgst, 'sgst', v_sgst, 'igst', v_igst, 'total', v_taxable + v_cgst + v_sgst + v_igst);
end $$;

-- Draft (or refresh a draft) for one company and one month.
create or replace function private.build_invoice(p_company uuid, p_month date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_from date := date_trunc('month', p_month)::date; v_to date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
        s record; pl public.billing_plans; bp record; v_usage jsonb; c jsonb; v_id uuid; v_supplier jsonb; v_recipient jsonb; v_proforma boolean;
begin
  select * into s from public.company_subscriptions where company_id = p_company and starts_on <= v_to and (ends_on is null or ends_on >= v_from)
   order by starts_on desc limit 1;
  if s.id is null then return null; end if;
  select * into pl from public.billing_plans where id = s.plan_id;
  select * into bp from public.company_billing_profiles where company_id = p_company;
  if exists (select 1 from public.invoices where company_id = p_company and period_start = v_from and status <> 'draft') then
    return (select id from public.invoices where company_id = p_company and period_start = v_from);
  end if;
  v_usage := private.company_usage(p_company, v_from, v_to);
  c := private.invoice_calc(pl, v_usage, s.discount_pct, nullif(private.setting('billing_state_code'), ''), bp.state_code, coalesce(nullif(private.setting('gst_rate'), '')::numeric, 18));
  v_supplier := jsonb_build_object('legal_name', private.setting('billing_legal_name'), 'gstin', private.setting('billing_gstin'),
    'address', private.setting('billing_address'), 'state_code', private.setting('billing_state_code'), 'sac', private.setting('sac_code'));
  v_recipient := jsonb_build_object('legal_name', coalesce(bp.legal_name, (select name from public.companies where id = p_company)),
    'gstin', bp.gstin, 'address', bp.address, 'state_code', bp.state_code, 'email', bp.billing_email);
  v_proforma := coalesce(private.setting('billing_legal_name'), '') = '' or coalesce(private.setting('billing_gstin'), '') = ''
             or coalesce(private.setting('billing_address'), '') = '' or coalesce(private.setting('billing_state_code'), '') = '';
  insert into public.invoices (company_id, period_start, period_end, plan_snapshot, usage, lines, subtotal, discount, taxable, cgst, sgst, igst, total,
                               supplier, recipient, proforma)
  values (p_company, v_from, v_to, to_jsonb(pl) || jsonb_build_object('discount_pct', s.discount_pct), v_usage, c -> 'lines',
          (c ->> 'subtotal')::numeric, (c ->> 'discount')::numeric, (c ->> 'taxable')::numeric, (c ->> 'cgst')::numeric, (c ->> 'sgst')::numeric,
          (c ->> 'igst')::numeric, (c ->> 'total')::numeric, v_supplier, v_recipient, v_proforma)
  on conflict (company_id, period_start) do update set plan_snapshot = excluded.plan_snapshot, usage = excluded.usage, lines = excluded.lines,
    subtotal = excluded.subtotal, discount = excluded.discount, taxable = excluded.taxable, cgst = excluded.cgst, sgst = excluded.sgst,
    igst = excluded.igst, total = excluded.total, supplier = excluded.supplier, recipient = excluded.recipient, proforma = excluded.proforma
  returning id into v_id;
  return v_id;
end $$;
revoke all on function private.build_invoice(uuid, date), private.company_usage(uuid, date, date), private.setting(text) from public, anon, authenticated;

-- Monthly run (pg_cron on the 1st, hosted) or on demand by the owner: drafts for the previous month; issued only when auto_issue = true.
create or replace function private.run_monthly_billing(p_month date default (current_date - interval '1 month')::date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0; v uuid; issued int := 0;
begin
  for r in select c.id from public.companies c where c.status in ('trial', 'active') loop
    v := private.build_invoice(r.id, p_month);
    if v is not null then n := n + 1;
      if private.setting('auto_issue') = 'true' and (select status from public.invoices where id = v) = 'draft' then perform private.issue_invoice(v); issued := issued + 1; end if;
    end if;
  end loop;
  return jsonb_build_object('month', date_trunc('month', p_month)::date, 'invoices', n, 'issued', issued);
end $$;

create or replace function private.issue_invoice(p_invoice uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_fy text; v_no text; d date := (now() at time zone 'Asia/Kolkata')::date; v_n int;
begin
  v_fy := case when extract(month from d) >= 4 then to_char(d, 'YY') || '-' || to_char(d + interval '1 year', 'YY') else to_char(d - interval '1 year', 'YY') || '-' || to_char(d, 'YY') end;
  select count(*) + 1 into v_n from public.invoices where number like coalesce(nullif(private.setting('invoice_prefix'), ''), 'PPI') || '/' || v_fy || '/%';
  v_no := coalesce(nullif(private.setting('invoice_prefix'), ''), 'PPI') || '/' || v_fy || '/' || lpad(v_n::text, 4, '0');
  update public.invoices set status = 'issued', number = v_no, issued_at = now(),
    due_on = d + coalesce(nullif(private.setting('payment_terms_days'), '')::int, 15)
   where id = p_invoice and status = 'draft';
  if not found then raise exception 'PPI_INPUT: only a draft invoice can be issued' using errcode = 'P0001'; end if;
  insert into public.notifications (company_id, recipient_membership_id, kind, title, object_type, object_id, dedupe_key)
  select i.company_id, m.id, 'invoice', 'New invoice ' || v_no || ' — ₹' || to_char(i.total, 'FM99,99,99,990.00'), 'invoice', i.id, 'invoice:' || i.id
    from public.invoices i join public.memberships m on m.company_id = i.company_id and m.status = 'active'
   where i.id = p_invoice and exists (select 1 from public.role_assignments ra join public.role_permissions rp on rp.role_id = ra.role_id
                                         where ra.membership_id = m.id and rp.permission_code = 'org.manage' and ra.scope_type = 'company')
  on conflict do nothing;
  return v_no;
end $$;
revoke all on function private.run_monthly_billing(date), private.issue_invoice(uuid) from public, anon, authenticated;

-- ----- platform owner API -----
create or replace function public.platform_save_plan(p_id uuid, p_code text, p_name text, p_description text, p_monthly_fee numeric, p_included_people int,
  p_price_per_extra_person numeric, p_included_ai_runs int, p_price_per_100_ai_runs numeric, p_features text[], p_company uuid default null, p_status text default 'active')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := coalesce(p_id, gen_random_uuid());
begin
  if not private.is_platform_admin() then raise exception 'PPI_FORBIDDEN: platform owner only' using errcode = '42501'; end if;
  insert into public.billing_plans (id, code, name, description, monthly_fee, included_people, price_per_extra_person, included_ai_runs, price_per_100_ai_runs,
                                    features, company_id, is_draft_price, status)
  values (v_id, upper(trim(p_code)), trim(p_name), nullif(trim(coalesce(p_description, '')), ''), p_monthly_fee, p_included_people, p_price_per_extra_person,
          p_included_ai_runs, p_price_per_100_ai_runs, coalesce(p_features, '{}'), p_company, false, coalesce(p_status, 'active'))
  on conflict (id) do update set code = excluded.code, name = excluded.name, description = excluded.description, monthly_fee = excluded.monthly_fee,
    included_people = excluded.included_people, price_per_extra_person = excluded.price_per_extra_person, included_ai_runs = excluded.included_ai_runs,
    price_per_100_ai_runs = excluded.price_per_100_ai_runs, features = excluded.features, company_id = excluded.company_id, is_draft_price = false, status = excluded.status;
  insert into private.platform_events (actor, company_id, action, detail) values (auth.uid(), p_company, 'plan.saved', jsonb_build_object('plan', v_id, 'code', upper(trim(p_code))));
  return v_id;
end $$;

create or replace function public.platform_subscribe(p_company uuid, p_plan uuid, p_discount numeric default 0, p_starts date default current_date, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; pl record;
begin
  if not private.is_platform_admin() then raise exception 'PPI_FORBIDDEN: platform owner only' using errcode = '42501'; end if;
  select * into pl from public.billing_plans where id = p_plan and status = 'active';
  if pl.id is null then raise exception 'PPI_INPUT: package not found or retired' using errcode = 'P0001'; end if;
  if pl.company_id is not null and pl.company_id <> p_company then raise exception 'PPI_INPUT: that custom package belongs to another company' using errcode = 'P0001'; end if;
  if coalesce(p_discount, 0) < 0 or coalesce(p_discount, 0) > 100 then raise exception 'PPI_INPUT: discount must be 0-100%%' using errcode = 'P0001'; end if;
  update public.company_subscriptions set ends_on = greatest(starts_on, p_starts - 1) where company_id = p_company and ends_on is null;
  insert into public.company_subscriptions (company_id, plan_id, starts_on, discount_pct, note) values (p_company, p_plan, p_starts, coalesce(p_discount, 0), p_note)
  returning id into v_id;
  insert into private.platform_events (actor, company_id, action, detail) values (auth.uid(), p_company, 'subscription.set', jsonb_build_object('plan', p_plan, 'discount', p_discount));
  return v_id;
end $$;

create or replace function public.platform_billing_settings() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when private.is_platform_admin() then (select jsonb_object_agg(key, value) from private.platform_settings
    where key in ('billing_legal_name','billing_gstin','billing_address','billing_state_code','invoice_prefix','gst_rate','sac_code','payment_terms_days','auto_issue')) end
$$;
create or replace function public.platform_save_billing_settings(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare k text;
begin
  if not private.is_platform_admin() then raise exception 'PPI_FORBIDDEN: platform owner only' using errcode = '42501'; end if;
  if coalesce(p ->> 'billing_gstin', '') <> '' and (p ->> 'billing_gstin') !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$' then
    raise exception 'PPI_INPUT: that GSTIN does not have the 15-character format' using errcode = 'P0001'; end if;
  if coalesce(p ->> 'billing_state_code', '') <> '' and (p ->> 'billing_state_code') !~ '^[0-9]{2}$' then raise exception 'PPI_INPUT: state code is two digits (e.g. 27)' using errcode = 'P0001'; end if;
  if coalesce(p ->> 'gst_rate', '18') !~ '^[0-9]{1,2}(\.[0-9]{1,2})?$' then raise exception 'PPI_INPUT: GST rate is a percentage' using errcode = 'P0001'; end if;
  if length(coalesce(p ->> 'invoice_prefix', 'PPI')) > 5 then raise exception 'PPI_INPUT: invoice prefix at most 5 characters (invoice numbers must stay within 16)' using errcode = 'P0001'; end if;
  for k in select jsonb_object_keys(p) loop
    if k in ('billing_legal_name','billing_gstin','billing_address','billing_state_code','invoice_prefix','gst_rate','sac_code','payment_terms_days','auto_issue') then
      update private.platform_settings set value = trim(p ->> k), updated_at = now() where key = k;
    end if;
  end loop;
  insert into private.platform_events (actor, action, detail) values (auth.uid(), 'billing.settings', p - 'billing_address');
end $$;

create or replace function public.platform_generate_invoices(p_month date) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'PPI_FORBIDDEN: platform owner only' using errcode = '42501'; end if;
  return private.run_monthly_billing(p_month);
end $$;

create or replace function public.platform_invoice_action(p_invoice uuid, p_action text, p_note text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare i record;
begin
  if not private.is_platform_admin() then raise exception 'PPI_FORBIDDEN: platform owner only' using errcode = '42501'; end if;
  select * into i from public.invoices where id = p_invoice;
  if i.id is null then raise exception 'PPI_INPUT: invoice not found' using errcode = 'P0001'; end if;
  if p_action = 'issue' then return private.issue_invoice(p_invoice);
  elsif p_action = 'refresh' then
    if i.status <> 'draft' then raise exception 'PPI_INPUT: only drafts are recalculated' using errcode = 'P0001'; end if;
    perform private.build_invoice(i.company_id, i.period_start); return 'refreshed';
  elsif p_action = 'paid' then
    if i.status <> 'issued' then raise exception 'PPI_INPUT: only an issued invoice can be marked paid' using errcode = 'P0001'; end if;
    update public.invoices set status = 'paid', paid_at = now(), disputed = false where id = p_invoice; return 'paid';
  elsif p_action = 'void' then
    if length(trim(coalesce(p_note, ''))) < 5 then raise exception 'PPI_INPUT: give the reason for voiding' using errcode = 'P0001'; end if;
    if i.status = 'draft' then delete from public.invoices where id = p_invoice; return 'deleted';
    else update public.invoices set status = 'void', void_reason = trim(p_note) where id = p_invoice; return 'void'; end if;
  elsif p_action = 'dispute_settled' then
    update public.invoices set disputed = false where id = p_invoice; return 'settled';
  end if;
  raise exception 'PPI_INPUT: unknown action' using errcode = 'P0001';
end $$;

-- Platform revenue summary.
create or replace function public.platform_billing_overview()
returns table (company_id uuid, company_name text, plan_name text, discount_pct numeric, monthly_fee numeric, invoiced_total numeric,
               outstanding numeric, overdue numeric, disputed int, last_invoice text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.name, pl.name, s.discount_pct, pl.monthly_fee,
    coalesce((select sum(total) from public.invoices i where i.company_id = c.id and i.status in ('issued', 'paid')), 0),
    coalesce((select sum(total) from public.invoices i where i.company_id = c.id and i.status = 'issued'), 0),
    coalesce((select sum(total) from public.invoices i where i.company_id = c.id and i.status = 'issued' and i.due_on < current_date), 0),
    (select count(*) from public.invoices i where i.company_id = c.id and i.disputed)::int,
    (select number from public.invoices i where i.company_id = c.id and i.number is not null order by issued_at desc limit 1)
  from public.companies c
  left join public.company_subscriptions s on s.company_id = c.id and s.ends_on is null
  left join public.billing_plans pl on pl.id = s.plan_id
  where private.is_platform_admin()
  order by c.name
$$;

-- ----- company administrator API -----
create or replace function public.company_save_billing_profile(p_company uuid, p_legal_name text, p_gstin text, p_address text, p_state_code text, p_email text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (private.has_permission(p_company, 'org.manage') or private.is_platform_admin()) then raise exception 'PPI_FORBIDDEN: company administrators only' using errcode = '42501'; end if;
  insert into public.company_billing_profiles (company_id, legal_name, gstin, address, state_code, billing_email, updated_at)
  values (p_company, nullif(trim(coalesce(p_legal_name, '')), ''), nullif(upper(trim(coalesce(p_gstin, ''))), ''), nullif(trim(coalesce(p_address, '')), ''),
          nullif(trim(coalesce(p_state_code, '')), ''), nullif(lower(trim(coalesce(p_email, ''))), ''), now())
  on conflict (company_id) do update set legal_name = excluded.legal_name, gstin = excluded.gstin, address = excluded.address,
    state_code = excluded.state_code, billing_email = excluded.billing_email, updated_at = now();
end $$;

-- Estimate for the running month (not an invoice): what the bill would be if the month ended today.
create or replace function public.company_billing_estimate(p_company uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s record; pl public.billing_plans; bp record; v_usage jsonb; v_from date := date_trunc('month', current_date)::date;
begin
  if not (private.has_permission(p_company, 'org.manage') or private.is_platform_admin()) then raise exception 'PPI_FORBIDDEN: company administrators only' using errcode = '42501'; end if;
  select * into s from public.company_subscriptions where company_id = p_company and ends_on is null;
  if s.id is null then return jsonb_build_object('subscribed', false); end if;
  select * into pl from public.billing_plans where id = s.plan_id;
  select * into bp from public.company_billing_profiles where company_id = p_company;
  v_usage := private.company_usage(p_company, v_from, current_date);
  return jsonb_build_object('subscribed', true, 'plan', to_jsonb(pl), 'discount_pct', s.discount_pct, 'since', s.starts_on, 'usage', v_usage,
    'estimate', private.invoice_calc(pl, v_usage, s.discount_pct, nullif(private.setting('billing_state_code'), ''), bp.state_code,
      coalesce(nullif(private.setting('gst_rate'), '')::numeric, 18)));
end $$;

-- A dispute is a billing ticket linked to the invoice; the invoice is flagged until the platform owner settles it.
create or replace function public.company_dispute_invoice(p_company uuid, p_invoice uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare i record; v_t uuid;
begin
  select * into i from public.invoices where id = p_invoice and company_id = p_company and status in ('issued', 'paid');
  if i.id is null then raise exception 'PPI_INPUT: invoice not found' using errcode = 'P0001'; end if;
  if length(trim(coalesce(p_reason, ''))) < 10 then raise exception 'PPI_INPUT: explain what is wrong (at least 10 characters)' using errcode = 'P0001'; end if;
  v_t := public.ticket_create(p_company, 'billing_dispute', 'Dispute on invoice ' || i.number, trim(p_reason), 'high', null, null, null, 'invoice', i.id, 'Invoice ' || i.number);
  update public.invoices set disputed = true where id = p_invoice;
  return v_t;
end $$;

revoke all on function public.platform_save_plan(uuid, text, text, text, numeric, int, numeric, int, numeric, text[], uuid, text), public.platform_subscribe(uuid, uuid, numeric, date, text),
  public.platform_billing_settings(), public.platform_save_billing_settings(jsonb), public.platform_generate_invoices(date), public.platform_invoice_action(uuid, text, text),
  public.platform_billing_overview(), public.company_save_billing_profile(uuid, text, text, text, text, text), public.company_billing_estimate(uuid),
  public.company_dispute_invoice(uuid, uuid, text) from public, anon;
grant execute on function public.platform_save_plan(uuid, text, text, text, numeric, int, numeric, int, numeric, text[], uuid, text), public.platform_subscribe(uuid, uuid, numeric, date, text),
  public.platform_billing_settings(), public.platform_save_billing_settings(jsonb), public.platform_generate_invoices(date), public.platform_invoice_action(uuid, text, text),
  public.platform_billing_overview(), public.company_save_billing_profile(uuid, text, text, text, text, text), public.company_billing_estimate(uuid),
  public.company_dispute_invoice(uuid, uuid, text) to authenticated;
