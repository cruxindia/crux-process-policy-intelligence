// E2E (synthetic tenant): P3 billing — package, invoice preparation, issue, company view/download, dispute, settle, paid.
// The synthetic lead is platform owner ONLY for this run (granted before, revoked after). Afterwards the runner deletes the
// synthetic tenant's subscription and invoices so the real invoice series still starts at 0001.
// Env: BASE, E2E_PASSWORD (lead), E2E_OUT.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const OUT = process.env.E2E_OUT || '/tmp';
const CO = 'e2e00000-0000-4000-8000-0000000000c0';
const LEAD = 'e2e.lead@example.invalid';
const results = []; const check = (n, c, d = '') => results.push(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`);
const ist = new Date(Date.now() + 5.5 * 3600e3);
const month = ist.toISOString().slice(0, 7);

(async () => {
  const b = await chromium.launch(); const errs = [];
  try {
    const l = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); l.on('pageerror', (x) => errs.push(x.message));
    await l.goto(BASE + '/login'); await l.fill('#email', LEAD); await l.fill('#password', process.env.E2E_PASSWORD);
    await l.getByRole('button', { name: 'Sign in', exact: true }).click(); await l.waitForLoadState('networkidle');

    // ---- platform owner: package + invoice ----
    await l.goto(BASE + '/platform/billing?test=1');
    check('set-up checklist shown while prices are draft / profile incomplete', (await l.getByTestId('billing-setup').count()) === 1);
    const row = l.locator('[data-testid="billing-companies"] tr', { hasText: 'E2E Synthetic Co' }).first();
    await row.locator('select[name="plan"]').selectOption({ label: 'Starter' });
    await row.locator('input[name="starts"]').fill(`${month}-01`);
    await row.getByRole('button', { name: 'Set' }).click(); await l.waitForURL(/ok=Package/);
    check('package assigned (and the test filter is kept)', /test=1/.test(l.url()) && /Starter/.test(await l.locator('[data-testid="billing-companies"] tr', { hasText: 'E2E Synthetic Co' }).first().innerText()));
    await l.fill('#g-month', month); await l.getByRole('button', { name: 'Prepare invoices' }).click(); await l.waitForURL(/prepared|e=/);
    check('monthly invoices prepared as drafts', /invoice\(s\) prepared/.test(new URL(l.url()).searchParams.get('ok') ?? ''));
    await l.locator('[data-testid="invoices-table"] tr', { hasText: 'E2E Synthetic Co' }).filter({ hasText: 'Draft' }).first().getByRole('link').first().click();
    await l.getByTestId('invoice').waitFor();
    const draft = await l.getByTestId('invoice').innerText();
    check('draft shows the Starter fee line and GST', /Starter package — monthly fee/.test(draft) && /(IGST|CGST)/.test(draft), draft.split('\n').slice(0, 3).join(' / '));
    await l.getByRole('button', { name: 'Issue invoice' }).click(); await l.waitForURL(/ok=Issued/);
    const number = (new URL(l.url()).searchParams.get('ok') ?? '').match(/Issued as (\S+)/)?.[1] ?? '';
    check('issued with a financial-year number', /^PPI\/\d\d-\d\d\/\d{4}$/.test(number), number);
    check('invoice shows the cost simply (no tax details unless a GSTIN exists)', /^Invoice$/m.test(await l.getByTestId('invoice').innerText()) && !/GSTIN|SAC|Proforma/.test(await l.getByTestId('invoice').innerText()));

    // ---- company admin: sees, downloads, disputes ----
    await l.goto(`${BASE}/c/${CO}/billing`);
    check('company billing shows the package and this month', (await l.getByTestId('current-plan').count()) === 1 && (await l.getByTestId('this-month').count()) === 1);
    check('the issued invoice is listed with an amount due', new RegExp(number.replace(/\//g, '\\/')).test(await l.getByTestId('company-invoices').innerText()) && (await l.getByTestId('due').count()) === 1);
    await l.getByRole('link', { name: number }).click(); await l.getByTestId('invoice').waitFor();
    check('download / print button on the invoice', (await l.getByRole('button', { name: /Download/ }).count()) === 1);
    await l.locator('[data-testid="dispute"] summary').click();
    await l.fill('#dr', 'Synthetic dispute: we started later in the month than shown.');
    await l.getByRole('button', { name: 'Raise a dispute' }).click(); await l.waitForURL(/\/tasks\/[0-9a-f-]{36}/);
    check('dispute becomes a billing ticket for the platform team', /Dispute sent/.test(await l.locator('.notice.ok').innerText()) && /Platform team/.test(await l.getByTestId('ticket-facts').innerText()));

    // ---- platform owner: sees and settles ----
    await l.goto(BASE + '/platform/billing?test=1');
    check('disputed count shown in billing KPIs', /Disputed invoices\s*1/.test(await l.locator('.kpis').innerText()));
    await l.goto(BASE + '/platform/tickets');
    check('dispute appears in the platform ticket list', new RegExp('Dispute on invoice ' + number.replace(/\//g, '\\/')).test(await l.getByTestId('platform-tickets').innerText()));
    await l.goto(BASE + '/platform/billing?test=1');
    await l.locator('[data-testid="invoices-table"] tr', { hasText: number }).getByRole('link').first().click(); await l.getByTestId('invoice-actions').waitFor();
    await l.getByRole('button', { name: 'Dispute settled' }).click(); await l.waitForURL(/settled/);
    await l.getByRole('button', { name: 'Mark as paid' }).click(); await l.waitForURL(/paid/);
    check('owner settles the dispute and marks it paid', /PAID/.test(await l.getByTestId('invoice').innerText()));

    await l.setViewportSize({ width: 390, height: 844 }); await l.goto(`${BASE}/c/${CO}/billing`);
    check('phone: no horizontal page scroll on company billing', (await l.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1);
    await l.screenshot({ path: `${OUT}/p3-company-billing-phone.png`, fullPage: true });
    check('no browser errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  } catch (x) { check('no crash', false, x.message.split('\n')[0]); }
  finally { await b.close(); }
  console.log(results.join('\n'));
  process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
})();
