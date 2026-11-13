// E2E (synthetic tenant): blueprint catalogue — summary, filters, classify with reason, maker-checker, status → gap, function mapping,
// "Draft it with the expert board", phone layout. Env: BASE, E2E_PASSWORD, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, E2E_OUT.
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const BASE = process.env.BASE || 'http://localhost:3000';
const CO = 'e2e00000-0000-4000-8000-0000000000c0';
const OUT = process.env.E2E_OUT || '/tmp';
const results = []; const check = (n, c, d = '') => results.push(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`);
(async () => {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  await db.auth.signInWithPassword({ email: 'e2e.lead@example.invalid', password: process.env.E2E_PASSWORD });
  const { data: free } = await db.from('catalogue_gaps').select('id, code, title').eq('company_id', CO).eq('kind', 'policy')
    .eq('classification', 'unassessed').is('pending_class', null).is('board_case_id', null).order('code').limit(2);
  check('two unassessed policies available for the test', free?.length === 2, free?.map((f) => f.code).join(', '));
  const [req, man] = free;
  const b = await chromium.launch();
  try {
    const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(BASE + '/login'); await p.fill('#email', 'e2e.lead@example.invalid'); await p.fill('#password', process.env.E2E_PASSWORD);
    await p.getByRole('button', { name: 'Sign in', exact: true }).click(); await p.waitForLoadState('networkidle');
    await p.goto(`${BASE}/c/${CO}`);
    await p.getByRole('link', { name: 'Catalogue' }).click(); await p.waitForSelector('[data-testid="catalogue-table"]');
    const rows = await p.locator('[data-testid="catalogue-table"] tbody tr').count();
    check('catalogue lists the blueprint baseline', rows >= 148, `${rows} items`);
    check('gap summary is shown', await p.locator('[data-testid="gap-summary"] a').count() >= 1);
    await p.selectOption('select[name="kind"]', 'policy'); await p.getByRole('button', { name: 'Filter' }).click(); await p.waitForURL(/kind=policy/);
    check('filter by type works', await p.locator('[data-testid="catalogue-table"] tbody tr').count() >= 23);
    await p.screenshot({ path: OUT + '/catalogue.png' });

    // Required applies at once with a reason
    await p.goto(`${BASE}/c/${CO}/catalogue/${req.id}`);
    await p.selectOption('#to', 'required'); await p.fill('#reason', 'Synthetic E2E: needed to run the company');
    await p.getByRole('button', { name: 'Save classification' }).click(); await p.waitForURL(/ok=/, { timeout: 30000 });
    check('Required is saved at once with its reason', /Classification saved/.test(await p.locator('.notice.ok').innerText()));
    check('gap becomes "Is it done today?"', /Is it done today\?/.test(await p.locator('[data-testid="item-summary"] .badge').first().innerText()));
    await p.selectOption('#process_status', 'performed'); await p.selectOption('#document_status', 'none');
    await p.getByRole('button', { name: 'Save status' }).click(); await p.waitForURL(/ok=Status/, { timeout: 30000 });
    check('done today + no document = "Document missing" (not "Process missing")', /Document missing/.test(await p.locator('[data-testid="item-summary"] .badge').first().innerText()));

    // Mandatory needs basis + reference, then waits for a second person
    await p.goto(`${BASE}/c/${CO}/catalogue/${man.id}`);
    await p.selectOption('#to', 'mandatory'); await p.fill('#reason', 'Synthetic E2E: required by a client agreement');
    await p.getByRole('button', { name: 'Save classification' }).click(); await p.waitForURL(/e=/, { timeout: 30000 });
    check('Mandatory without basis and reference is refused', /basis/i.test(await p.locator('.notice.error').innerText()));
    await p.selectOption('#to', 'mandatory'); await p.selectOption('#basis', 'contract'); await p.fill('#reference', 'Synthetic client agreement, clause [to be confirmed]');
    await p.fill('#reason', 'Synthetic E2E: required by a client agreement');
    await p.getByRole('button', { name: 'Save classification' }).click(); await p.waitForURL(/ok=/, { timeout: 30000 });
    check('Mandatory goes for approval', /second person/.test(await p.locator('.notice.ok').innerText()) && await p.locator('[data-testid="pending-here"]').count() === 1);
    await p.getByRole('button', { name: 'Approve' }).click(); await p.waitForURL(/e=/, { timeout: 30000 });
    check('nobody approves their own request', /someone else/i.test(await p.locator('.notice.error').innerText()));
    await p.goto(`${BASE}/c/${CO}/catalogue?tab=approvals`);
    check('approvals tab lists it', await p.locator('[data-testid="pending-request"]').count() >= 1);

    // Function → department mapping
    await p.goto(`${BASE}/c/${CO}/catalogue?tab=functions`);
    const sel = p.locator('[data-testid="functions-table"] select').first(); const opts = await sel.locator('option').allTextContents();
    if (opts.length > 1) { await sel.selectOption({ index: 1 }); await p.locator('[data-testid="functions-table"] button').first().click(); await p.waitForURL(/ok=/, { timeout: 30000 }); }
    check('a function can be mapped to its owning department', opts.length > 1 && /saved/i.test(await p.locator('.notice.ok').innerText()));

    // Draft with the expert board → case opened and linked back
    await p.goto(`${BASE}/c/${CO}/catalogue/${req.id}`);
    await p.getByRole('button', { name: 'Draft it with the expert board' }).click(); await p.waitForURL(/\/board\/[0-9a-f-]{36}/, { timeout: 60000 });
    check('"Draft it with the expert board" opens a case', /\/board\//.test(p.url()));
    await p.goto(`${BASE}/c/${CO}/catalogue/${req.id}`);
    check('item links to the draft and shows "Being drafted"', await p.getByText(/Expert board draft/).count() === 1 && /Being drafted/.test(await p.locator('[data-testid="item-summary"]').innerText()));
    check('history keeps who changed what and why', await p.locator('[data-testid="history"] tbody tr').count() >= 1);

    await p.setViewportSize({ width: 390, height: 844 }); await p.goto(`${BASE}/c/${CO}/catalogue`);
    const sw = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('phone layout has no sideways scroll', sw <= 4, `${sw}px`);
    await p.screenshot({ path: OUT + '/catalogue-phone.png' });
    check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  } finally { await b.close(); }
  console.log(results.join('\n')); console.log(`\n${results.filter((r) => r.startsWith('PASS')).length}/${results.length} passed`);
  process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
})();
