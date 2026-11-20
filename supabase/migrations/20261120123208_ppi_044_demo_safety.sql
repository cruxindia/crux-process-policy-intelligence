-- PPI-044: demo-company safety + provisioning completeness (P8 full-run findings, D-102).
-- 1. New companies get the STAKEHOLDER role, report/project permissions and AI-pool provider policies (provision copied only 7 roles).
-- 2. Demo companies never enter the real billing run, invoice series or platform revenue figures.
CREATE OR REPLACE FUNCTION private.provision_company(p_code text, p_name text, p_template text DEFAULT 'CRUX'::text, p_demo boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_co uuid := gen_random_uuid(); v_tpl uuid;
begin
  select id into v_tpl from public.companies where code = p_template;
  if v_tpl is null then raise exception 'PPI_CONFIG: template company % not found', p_template using errcode = 'P0001'; end if;
  insert into public.companies (id, code, name, is_demo, status) values (v_co, upper(trim(p_code)), trim(p_name), p_demo, case when p_demo then 'active' else 'trial' end);
  insert into public.roles (company_id, code, name, description)
    select v_co, code, name, description from public.roles
     where company_id = v_tpl and code in ('COMPANY_ADMIN','DISCOVERY_LEAD','DEPT_HEAD','EMPLOYEE','BE_REVIEWER','PROCESS_OWNER','DOC_APPROVER');
  insert into public.role_permissions (company_id, role_id, permission_code)
    select v_co, nr.id, rp.permission_code
      from public.role_permissions rp join public.roles r on r.id = rp.role_id
      join public.roles nr on nr.company_id = v_co and nr.code = r.code
     where rp.company_id = v_tpl;
  insert into public.prompt_versions (company_id, prompt_key, version, purpose, template_sha256, output_schema, status)
    select v_co, prompt_key, version, purpose, template_sha256, output_schema, status from public.prompt_versions where company_id = v_tpl and status = 'active';
  insert into public.agent_teams (company_id, code, name, mission, sort_order)
    select v_co, code, name, mission, sort_order from public.agent_teams where company_id = v_tpl;
  insert into public.agent_roles (company_id, team_id, code, version, title, credentials, charter, charter_sha256)
    select v_co, nt.id, ar.code, ar.version, ar.title, ar.credentials, ar.charter, ar.charter_sha256
      from public.agent_roles ar join public.agent_teams t on t.id = ar.team_id
      join public.agent_teams nt on nt.company_id = v_co and nt.code = t.code
     where ar.company_id = v_tpl and ar.status = 'active';
  -- AI data policies: copied, but consent to a training provider is the client's own decision, so it is NOT copied:
  -- providers that may train on inputs start limited to public data until this company's owner accepts.
  insert into public.ai_provider_policies (company_id, provider, max_classification, may_train_on_inputs, terms_checked_on, status, notes)
    select v_co, provider, case when may_train_on_inputs then 'public' else max_classification end, may_train_on_inputs, terms_checked_on, status,
           case when may_train_on_inputs then 'Training provider: limited to public data until this company accepts (copied at set-up).' else notes end
      from public.ai_provider_policies where company_id = v_tpl;
  perform public.load_starter_templates(v_co);
  perform private.seed_blueprint_catalogue(v_co);
  perform private.ensure_reporting_roles(v_co);
  perform private.ensure_pool_policies(v_co);
  return v_co;
end $function$

;
CREATE OR REPLACE FUNCTION private.run_monthly_billing(p_month date DEFAULT ((CURRENT_DATE - '1 mon'::interval))::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r record; n int := 0; v uuid; issued int := 0;
begin
  for r in select c.id from public.companies c where c.status in ('trial', 'active') and not c.is_demo loop
    v := private.build_invoice(r.id, p_month);
    if v is not null then n := n + 1;
      if private.setting('auto_issue') = 'true' and (select status from public.invoices where id = v) = 'draft' then perform private.issue_invoice(v); issued := issued + 1; end if;
    end if;
  end loop;
  return jsonb_build_object('month', date_trunc('month', p_month)::date, 'invoices', n, 'issued', issued);
end $function$

;
CREATE OR REPLACE FUNCTION public.platform_billing_overview()
 RETURNS TABLE(company_id uuid, company_name text, plan_name text, discount_pct numeric, monthly_fee numeric, invoiced_total numeric, outstanding numeric, overdue numeric, disputed integer, last_invoice text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select c.id, c.name, pl.name, s.discount_pct, pl.monthly_fee,
    coalesce((select sum(total) from public.invoices i where i.company_id = c.id and i.status in ('issued', 'paid')), 0),
    coalesce((select sum(total) from public.invoices i where i.company_id = c.id and i.status = 'issued'), 0),
    coalesce((select sum(total) from public.invoices i where i.company_id = c.id and i.status = 'issued' and i.due_on < current_date), 0),
    (select count(*) from public.invoices i where i.company_id = c.id and i.disputed)::int,
    (select number from public.invoices i where i.company_id = c.id and i.number is not null order by issued_at desc limit 1)
  from public.companies c
  left join public.company_subscriptions s on s.company_id = c.id and s.ends_on is null
  left join public.billing_plans pl on pl.id = s.plan_id
  where private.is_platform_admin() and not c.is_demo
  order by c.name
$function$

;
CREATE OR REPLACE FUNCTION public.platform_mis(p_report text, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_rows jsonb; v_cols text[]; v_title text; f timestamptz; t timestamptz;
        v_from date := coalesce(p_from, date_trunc('month', (now() at time zone 'Asia/Kolkata'))::date - interval '11 months');
        v_to date := coalesce(p_to, (now() at time zone 'Asia/Kolkata')::date);
begin
  if not private.is_platform_admin() then raise exception 'PPI_FORBIDDEN: platform owner only' using errcode = '42501'; end if;
  f := v_from::timestamp at time zone 'Asia/Kolkata'; t := (v_to + 1)::timestamp at time zone 'Asia/Kolkata';
  if p_report = 'portfolio' then
    v_title := 'Company portfolio'; v_cols := array['Company', 'Code', 'Status', 'Package', 'Active people', 'Invited', 'Interviews done', 'Processes', 'Validated', 'Documents approved', 'AI runs (30 d)', 'Last activity'];
    select jsonb_agg(jsonb_build_array(c.name, c.code, c.status || case when co.is_demo then ' (demo)' else '' end, (select pl.name from public.company_subscriptions s join public.billing_plans pl on pl.id = s.plan_id where s.company_id = c.company_id and s.ends_on is null),
        c.members_active, c.members_invited, c.interviews_submitted, c.company_processes, c.validated, c.documents_approved, c.ai_runs_30d,
        to_char(c.last_activity at time zone 'Asia/Kolkata', 'YYYY-MM-DD')) order by c.name) into v_rows
      from public.platform_companies() c join public.companies co on co.id = c.company_id where c.code not like 'E2E%';
  elsif p_report = 'revenue' then
    v_title := 'Revenue by month'; v_cols := array['Month', 'Company', 'Invoices', 'Taxable (INR)', 'GST (INR)', 'Total (INR)', 'Paid (INR)', 'Outstanding (INR)'];
    select jsonb_agg(jsonb_build_array(mon, name, n, taxable, gst, total, paid, total - paid) order by mon, name) into v_rows from (
      select to_char(i.period_start, 'YYYY-MM') mon, c.name, count(*) n, sum(i.taxable) taxable, sum(i.cgst + i.sgst + i.igst) gst, sum(i.total) total,
             coalesce(sum(i.total) filter (where i.status = 'paid'), 0) paid
        from public.invoices i join public.companies c on c.id = i.company_id
       where i.status in ('issued', 'paid') and not c.is_demo and i.period_start <= v_to and i.period_end >= v_from group by 1, 2) z;
  elsif p_report = 'receivables' then
    v_title := 'Receivables'; v_cols := array['Company', 'Invoice', 'Period', 'Total (INR)', 'Issued', 'Due', 'Days overdue', 'Disputed'];
    select jsonb_agg(jsonb_build_array(c.name, i.number, to_char(i.period_start, 'Mon YYYY'), i.total, to_char(i.issued_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD'), i.due_on,
        greatest((now() at time zone 'Asia/Kolkata')::date - i.due_on, 0), case when i.disputed then 'Yes' else 'No' end) order by i.due_on) into v_rows
      from public.invoices i join public.companies c on c.id = i.company_id where i.status = 'issued' and not c.is_demo;
  elsif p_report = 'ai_pool' then
    v_title := 'AI pool utilisation'; v_cols := array['Provider', 'Key', 'Model', 'Status', 'Health', 'Calls today', 'Calls total', 'Last success'];
    select jsonb_agg(jsonb_build_array(k.provider, k.label || ' (…' || k.key_hint || ')', k.model, k.status, k.health,
        case when k.uses_day = (now() at time zone 'Asia/Kolkata')::date then k.uses_today else 0 end, k.uses_total,
        to_char(k.last_success_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI')) order by k.provider, k.label) into v_rows
      from public.ai_pool_keys k where k.health <> 'removed';
  elsif p_report = 'support' then
    v_title := 'Support and billing tickets'; v_cols := array['Company', 'Ticket', 'Kind', 'Title', 'Priority', 'Status', 'Opened', 'Resolved', 'Age / time to resolve (days)'];
    select jsonb_agg(jsonb_build_array(c.name, tk.code, tk.kind, tk.title, tk.priority, tk.status, to_char(tk.created_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD'),
        to_char(tk.resolved_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD'), round(extract(epoch from coalesce(tk.resolved_at, now()) - tk.created_at) / 86400, 1)) order by tk.created_at desc) into v_rows
      from public.tickets tk join public.companies c on c.id = tk.company_id where tk.to_platform and tk.created_at < t and (tk.created_at >= f or tk.status in ('open', 'in_progress', 'waiting'));
  else
    raise exception 'PPI_INPUT: unknown report' using errcode = 'P0001';
  end if;
  return jsonb_build_object('title', v_title, 'columns', to_jsonb(v_cols), 'rows', coalesce(v_rows, '[]'::jsonb), 'from', v_from, 'to', v_to);
end $function$

;
