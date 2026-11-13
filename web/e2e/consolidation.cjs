// E2E (synthetic tenant): many people → ONE company item and ONE document.
// Three different people's interview descriptions of case allocation are linked to one new catalogue item; the expert-board draft is opened
// from all three. RUN_BOARD=1 also waits for the board and checks the document reconciles them. Env as catalogue.cjs.
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const BASE = process.env.BASE || 'http://localhost:3000';
const CO = 'e2e00000-0000-4000-8000-0000000000c0';
const OUT = process.env.E2E_OUT || '/tmp';
// Synthetic interviews (three different sessions / people) describing the same work.
const DPS = ['cfb1843c-a00d-400a-aa85-262955f3af2e', 'db9e764b-7b00-406e-9e3a-e9ca85638d5b', '770e4dab-4137-4b93-bfdc-218b65595689'];
const results = []; const check = (n, c, d = '') => results.push(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`);
(async () => {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  await db.auth.signInWithPassword({ email: 'e2e.lead@example.invalid', password: process.env.E2E_PASSWORD });
  for (const id of DPS) await db.rpc('catalogue_unlink_source', { p_company: CO, p_discovered: id });   // rerunnable: start unlinked
  const { data: dps } = await db.from('discovered_processes').select('id, session_id, membership_id').in('id', DPS);
  check('three descriptions from three different people', new Set((dps ?? []).map((d) => d.membership_id)).size === 3 && new Set((dps ?? []).map((d) => d.session_id)).size === 3);
  const code = `E2E-CONS-${Date.now().toString(36).toUpperCase()}`;
  const b = await chromium.launch();
  try {
    const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(BASE + '/login'); await p.fill('#email', 'e2e.lead@example.invalid'); await p.fill('#password', process.env.E2E_PASSWORD);
    await p.getByRole('button', { name: 'Sign in', exact: true }).click(); await p.waitForLoadState('networkidle');

    // Inbox: unmatched interview descriptions with suggestions
    await p.goto(`${BASE}/c/${CO}/catalogue?tab=inbox`); await p.waitForSelector('[data-testid="inbox-table"]');
    const rows = p.locator('[data-testid="inbox-row"]');
    check('"From interviews" lists unmatched descriptions', await rows.count() >= 3, `${await rows.count()} rows`);
    const allocRow = rows.filter({ hasText: /Allocation of Verification Cases/i }).first();
    check('a matching company item is suggested', /match \d+%/.test(await allocRow.innerText()), (await allocRow.innerText()).replace(/\s+/g, ' ').slice(0, 120));
    await p.screenshot({ path: OUT + '/consolidation-inbox.png' });

    // A fresh company item (so the test can be rerun), then link three people's descriptions to it
    await p.goto(`${BASE}/c/${CO}/catalogue`);
    await p.locator('details summary', { hasText: 'Add an item' }).click();
    await p.selectOption('#kind', 'process'); await p.selectOption('#function', { label: 'Operations Management' }); await p.fill('#code', code); await p.fill('#title', 'Allocation of verification cases (E2E consolidation)');
    await p.getByRole('button', { name: 'Add', exact: true }).click(); await p.waitForURL(/\/catalogue\/[0-9a-f-]{36}\?ok=/, { timeout: 30000 });
    const itemUrl = p.url().split('?')[0]; const itemId = itemUrl.split('/').pop();
    for (const id of DPS) {
      await p.selectOption('[data-testid="link-source"] select', id);
      await p.getByRole('button', { name: 'Add to this item' }).click(); await p.waitForURL(/ok=Linked/, { timeout: 30000 }); await p.goto(itemUrl);
    }
    check('three descriptions linked to ONE item', await p.locator('[data-testid="sources-table"] tbody tr').count() === 3);
    check('side-by-side computed comparison: leave check and address check each by 2 of 3', await p.locator('[data-testid="side-by-side"] thead th').count() === 5 && await p.locator('[data-testid="side-by-side"] tbody tr', { hasText: /officer on leave/i }).locator('.badge.part').count() === 1 && await p.locator('[data-testid="side-by-side"] tbody tr', { hasText: /address/i }).locator('td').filter({ hasText: /^—$/ }).count() === 1);
    check('linking marks the work as done today', /Done today\?\s*Done today/.test(await p.locator('[data-testid="item-summary"]').innerText()));
    await p.screenshot({ path: OUT + '/consolidation-item.png', fullPage: true });

    await p.goto(`${BASE}/c/${CO}/catalogue?q=${code}`);
    check('catalogue shows "Described by 3"', /\b3\b/.test(await p.locator('[data-testid="catalogue-table"] tbody tr').first().locator('td').nth(4).innerText()));
    await p.goto(`${BASE}/c/${CO}/catalogue?tab=inbox`);
    check('linked descriptions leave the unmatched list', (await p.locator('[data-testid="inbox-table"]').innerText().catch(() => '')).match(/Allocation of Verification Cases/gi)?.length !== 3);

    // One case, all three sources
    await p.goto(itemUrl);
    await p.getByRole('button', { name: 'Draft it with the expert board' }).click(); await p.waitForURL(/\/board\/[0-9a-f-]{36}/, { timeout: 60000 });
    const caseId = p.url().split('/').pop().split('?')[0];
    const { data: bc } = await db.from('board_cases').select('source_process_ids, brief, kind').eq('id', caseId).single();
    check('ONE draft case carries all three descriptions', (bc?.source_process_ids ?? []).length === 3 && DPS.every((d) => bc.source_process_ids.includes(d)));
    check('the brief tells the board to reconcile them into one document', /ONE company document/.test(bc?.brief ?? ''));
    await p.goto(itemUrl);
    check('item links to the single draft', await p.getByText(/Expert board draft/).count() === 1);

    // Remove one description
    await p.locator('[data-testid="sources-table"] tbody tr').last().getByRole('button', { name: 'Remove' }).click(); await p.waitForURL(/ok=Removed/, { timeout: 30000 });
    check('a description can be removed again', await p.locator('[data-testid="sources-table"] tbody tr').count() === 2);
    await db.rpc('catalogue_link_source', { p_company: CO, p_item: itemId, p_discovered: DPS[2] });

    if (process.env.RUN_BOARD === '1') {
      let status = ''; const until = Date.now() + 15 * 60_000;
      while (Date.now() < until) {
        await p.goto(`${BASE}/c/${CO}/board/${caseId}`); await p.waitForTimeout(20000);
        const { data } = await db.from('board_cases').select('status, last_error').eq('id', caseId).single(); status = data?.status ?? '';
        if (['awaiting_approval', 'failed'].includes(status)) break;
      }
      check('board finished the consolidated draft', status === 'awaiting_approval', status);
      const { data: out } = await db.from('board_outputs').select('body_md').eq('case_id', caseId).order('version', { ascending: false }).limit(1).single();
      const md = out?.body_md ?? '';
      check('one document reconciles the descriptions ("Variations and open points")', /Variations and open points/i.test(md), `${md.length} chars`);
      // Who-said-what is deterministic: the annex must carry the computed comparison (leave and address checks by 2 of 3; WhatsApp kept).
      const annex = md.split(/^## Annex — How the 3 descriptions compare \(automatic\)/m)[1] ?? '';
      check('final document carries the computed comparison annex', /\| 2 of 3 \|/.test(annex) && /WhatsApp/.test(annex) && /officer on leave/i.test(annex), `${annex.length} chars`);
      const { data: ms } = await db.from('memberships').select('user_id').in('id', (dps ?? []).map((d) => d.membership_id));
      const { data: ps } = await db.from('user_profiles').select('display_name').in('id', (ms ?? []).map((m) => m.user_id));
      const nm = (ps ?? []).map((x) => x.display_name).filter((n) => n && n.length > 3);
      check('no interviewee names in the document', nm.length > 0 && !nm.some((n) => md.includes(n)), `${nm.length} names checked`);
      require('fs').writeFileSync(OUT + '/consolidation-draft.md', md);
    }
    check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  } finally { await b.close(); }
  console.log(results.join('\n')); console.log(`\n${results.filter((r) => r.startsWith('PASS')).length}/${results.length} passed`);
  process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
})();
