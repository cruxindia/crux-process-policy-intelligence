-- PPI-039: pro-rata monthly fee (D-094 addendum). A company that starts (or stops) during a month pays the base fee
-- only for the days it had a package; allowances (people, AI runs) are not reduced. If the package changed during the
-- month, the newest package is billed for all covered days (simple, predictable; noted on the invoice line).
create or replace function private.build_invoice(p_company uuid, p_month date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_from date := date_trunc('month', p_month)::date; v_to date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
        s record; pl public.billing_plans; bill public.billing_plans; bp record; v_usage jsonb; c jsonb; v_id uuid; v_supplier jsonb; v_recipient jsonb;
        v_proforma boolean; v_days int; v_month_days int;
begin
  select * into s from public.company_subscriptions where company_id = p_company and starts_on <= v_to and (ends_on is null or ends_on >= v_from)
   order by starts_on desc limit 1;
  if s.id is null then return null; end if;
  select * into pl from public.billing_plans where id = s.plan_id;
  select * into bp from public.company_billing_profiles where company_id = p_company;
  if exists (select 1 from public.invoices where company_id = p_company and period_start = v_from and status <> 'draft') then
    return (select id from public.invoices where company_id = p_company and period_start = v_from);
  end if;
  v_month_days := v_to - v_from + 1;
  select count(distinct d) into v_days
    from public.company_subscriptions cs,
         generate_series(greatest(cs.starts_on, v_from), least(coalesce(cs.ends_on, v_to), v_to), interval '1 day') d
   where cs.company_id = p_company and cs.starts_on <= v_to and (cs.ends_on is null or cs.ends_on >= v_from);
  bill := pl;
  if v_days < v_month_days then
    bill.monthly_fee := round(pl.monthly_fee * v_days / v_month_days, 2);
    bill.name := pl.name || ' (' || v_days || ' of ' || v_month_days || ' days)';
  end if;
  v_usage := private.company_usage(p_company, v_from, v_to) || jsonb_build_object('days_billed', v_days, 'days_in_month', v_month_days);
  c := private.invoice_calc(bill, v_usage, s.discount_pct, nullif(private.setting('billing_state_code'), ''), bp.state_code, coalesce(nullif(private.setting('gst_rate'), '')::numeric, 18));
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
revoke all on function private.build_invoice(uuid, date) from public, anon, authenticated;
