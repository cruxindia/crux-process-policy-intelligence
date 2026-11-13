// E2E (synthetic tenant): expert board UI — home link, case list, boardroom graph, transcript, document, decision, teams page, phone layout.
// Env: BASE, E2E_PASSWORD, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, E2E_OUT. Needs one case awaiting approval (run board-api.cjs first).
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const BASE = process.env.BASE || 'http://localhost:3000';
const CO = 'e2e00000-0000-4000-8000-0000000000c0';
const OUT = process.env.E2E_OUT || '/tmp';
const results = []; const check = (n, c, d = '') => results.push(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`);
(async () => {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  await db.auth.signInWithPassword({ email: 'e2e.lead@example.invalid', password: process.env.E2E_PASSWORD });
  const { data: c } = await db.from('board_cases').select('id, title').eq('company_id', CO).eq('status', 'awaiting_approval').order('created_at', { ascending: false }).limit(1).maybeSingle();
  check('a synthetic case is waiting for a decision', !!c, c?.title);
  if (!c) { console.log(results.join('\n')); process.exit(1); }
  const b = await chromium.launch();
  try {
    const p = await (await b.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
    await p.goto(BASE + '/login'); await p.fill('#email', 'e2e.lead@example.invalid'); await p.fill('#password', process.env.E2E_PASSWORD);
    await p.getByRole('button', { name: 'Sign in', exact: true }).click(); await p.waitForLoadState('networkidle');
    await p.goto(`${BASE}/c/${CO}`);
    check('home shows the Expert board link', await p.getByRole('link', { name: 'Expert board' }).count() === 1);
    await p.getByRole('link', { name: 'Expert board' }).click(); await p.waitForURL(/\/board$/);
    check('board page lists cases and offers "Draft a new document"', await p.getByText('Draft a new document').count() === 1 && await p.locator('table a').count() > 0);

    await p.goto(`${BASE}/c/${CO}/board/${c.id}`); await p.waitForSelector('[data-testid="boardroom"] .bnode');
    const nodes = await p.locator('.bnode').count(); const turns = await p.locator('[data-testid="board-turn"]').count();
    check('boardroom graph shows the experts', nodes >= 6, `${nodes} experts`);
    check('every turn is in the discussion', turns >= 9, `${turns} turns`);
    check('arrows show who addressed whom', await p.locator('.react-flow__edge').count() >= turns - 1);
    await p.locator('.bnode').first().click();
    const filtered = await p.locator('[data-testid="board-turn"]').count();
    check('clicking an expert filters the discussion', filtered > 0 && filtered < turns, `${filtered} of ${turns}`);
    await p.getByRole('button', { name: 'Show everyone' }).click();
    check('document with audit verdict is shown', await p.locator('[data-testid="board-document"] h2, [data-testid="board-document"] h3').count() >= 5 && await p.getByText('Final audit:').count() === 1);
    await p.screenshot({ path: OUT + '/board-case.png', fullPage: false });

    // Reject without a reason is refused; approve with a note works.
    await p.getByRole('button', { name: 'Reject' }).click(); await p.waitForURL(/[?&]e=/, { timeout: 30000 });
    check('a rejection without a reason is refused', /why|reason/i.test(await p.locator('.notice.error').first().innerText()), await p.locator('.notice.error').first().innerText());
    await p.fill('#note', 'Synthetic E2E approval'); await p.getByRole('button', { name: 'Approve' }).click(); await p.waitForURL(/[?&]ok=/, { timeout: 30000 });
    const { data: after } = await db.from('board_cases').select('status').eq('id', c.id).single();
    check('approver approves; decision recorded', after.status === 'approved' && await p.locator('[data-testid="board-decide"]').count() === 0);

    await p.goto(`${BASE}/c/${CO}/board/teams`);
    check('teams page shows 6 expert teams with versioned charters', await p.locator('[data-testid="team"]').count() === 6 && await p.getByText(/charter v1 · fingerprint/).count() === 12);
    check('no key material on the teams page', !/AIza[0-9A-Za-z_-]{20,}/.test(await p.content()));

    await p.setViewportSize({ width: 390, height: 844 }); await p.goto(`${BASE}/c/${CO}/board/${c.id}`); await p.waitForSelector('.bnode');
    const sw = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('phone layout has no sideways scroll (<= 4 px)', sw <= 4, `${sw}px`);
    await p.screenshot({ path: OUT + '/board-case-phone.png' });
    check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  } finally { await b.close(); }
  console.log(results.join('\n')); console.log(`\n${results.filter((r) => r.startsWith('PASS')).length}/${results.length} passed`);
  process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
})();
