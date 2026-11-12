// E2E (synthetic tenant): a reviewer adds an AI-discovered process to the governed catalogue from the Review Centre.
// Env: BASE, E2E_PASSWORD, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, E2E_OUT.
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const BASE = process.env.BASE || 'http://localhost:3000';
const CO = 'e2e00000-0000-4000-8000-0000000000c0';
const OUT = process.env.E2E_OUT || '/tmp';
const results = []; const check = (n, c, d = '') => results.push(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`);
(async () => {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  await db.auth.signInWithPassword({ email: 'e2e.lead@example.invalid', password: process.env.E2E_PASSWORD });
  const { data: { user } } = await db.auth.getUser();
  const { data: me } = await db.from('memberships').select('id').eq('company_id', CO).eq('user_id', user.id).single();
  const { data: rows } = await db.from('discovered_processes').select('id, session_id, name, membership_id').eq('company_id', CO).is('linked_process_id', null).neq('membership_id', me.id).limit(1);
  const target = rows?.[0];
  check('a synthetic discovered process is visible to the reviewer', !!target);
  const b = await chromium.launch();
  try {
    const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await p.goto(BASE + '/login'); await p.fill('#email', 'e2e.lead@example.invalid'); await p.fill('#password', process.env.E2E_PASSWORD);
    await p.getByRole('button', { name: 'Sign in', exact: true }).click(); await p.waitForLoadState('networkidle');
    await p.goto(`${BASE}/c/${CO}/work/${target.session_id}`); await p.waitForSelector('#library');
    const art = p.locator(`#p-${target.id}`);
    await art.locator('[data-testid="promote"] summary').click();
    const code = 'E2E-D' + Date.now().toString(36).slice(-5).toUpperCase();
    await art.locator('input[name="code"]').fill(code);
    const opts = await art.locator('select[name="owner_department_id"] option').allInnerTexts();
    await art.locator('select[name="owner_department_id"]').selectOption({ index: 1 });
    await art.getByRole('button', { name: 'Save' }).click();
    await p.waitForSelector('.notice.ok, .notice.error', { timeout: 20000 });
    const note = await p.locator('.notice.ok, .notice.error').first().innerText();
    check('reviewer adds it to the catalogue', /candidate/.test(note), note + ` (dept options ${opts.length - 1})`);
    check('summary now shows "In process catalogue" with the new code', (await p.locator(`#p-${target.id}`).innerText()).includes(code));
    const { data: proc } = await db.from('processes').select('status, name').eq('company_id', CO).eq('code', code).single();
    check('catalogue entry is a candidate with the discovered name', proc?.status === 'candidate' && proc?.name === target.name, JSON.stringify(proc));
    await p.screenshot({ path: `${OUT}/60-promote.png` });
  } catch (e) { check('no crash', false, e.message.split('\n')[0]); }
  finally { await b.close(); }
  console.log(results.join('\n'));
  process.exit(results.some((x) => x.startsWith('FAIL')) ? 1 : 0);
})();
