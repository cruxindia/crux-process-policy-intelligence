// E2E: admin sets up org structure, invites a person with a temporary password; the person must set their own password,
// then accepts. Requires the E2E-SYNTH fixture + an admin role for the E2E lead. Env: E2E_PASSWORD, BASE (default localhost:3000).
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const BASE = process.env.BASE || 'http://localhost:3000';
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://pahzxpileudulljgaciw.supabase.co';
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const CO = 'e2e00000-0000-4000-8000-0000000000c0';
const SUFFIX = process.env.E2E_SUFFIX || Date.now().toString(36);
const results = []; const check = (n, c) => results.push(`${c ? 'PASS' : 'FAIL'}  ${n}`);

async function uiLogin(page, email, pw) {
  await page.goto(BASE + '/login');
  await page.fill('#email', email); await page.fill('#password', pw);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForLoadState('networkidle');
}

(async () => {
  const browser = await chromium.launch();
  try {
    // JWT carries actor_type=user (access-token hook active)
    const sb = createClient(URL, KEY, { auth: { persistSession: false } });
    const { data: s, error: se } = await sb.auth.signInWithPassword({ email: 'e2e.lead@example.invalid', password: process.env.E2E_PASSWORD });
    const claims = se ? {} : JSON.parse(Buffer.from(s.session.access_token.split('.')[1], 'base64url').toString());
    check('access token carries actor_type=user (hook active)', claims.actor_type === 'user');
    const { error: su } = await sb.auth.signUp({ email: `stranger-${SUFFIX}@example.invalid`, password: crypto.randomBytes(12).toString('hex') });
    check('public sign-up is refused', !!su);

    const l = await (await browser.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 })).newPage();
    await uiLogin(l, 'e2e.lead@example.invalid', process.env.E2E_PASSWORD);
    check('password sign-in works', l.url() === BASE + '/');
    await l.goto(`${BASE}/c/${CO}/admin`);
    const dcode = 'FIN' + SUFFIX.slice(-3).toUpperCase();
    await l.fill('#d-code', dcode); await l.fill('#d-name', 'Finance (synthetic)');
    await l.getByRole('button', { name: 'Add department' }).click(); await l.waitForURL(/ok=Department/);
    check('admin adds a department', await l.getByText(`${dcode}`, { exact: true }).first().isVisible());
    const pcode = 'P' + SUFFIX.slice(-5).toUpperCase();
    await l.fill('#p-code', pcode); await l.fill('#p-name', 'Synthetic intake');
    await l.selectOption('#p-dept', { label: 'OPS · Operations (synthetic)' });
    await l.getByRole('button', { name: 'Add process' }).click(); await l.waitForURL(/ok=Process/);
    check('admin adds a process', await l.getByText('Process added to the catalogue').isVisible());

    const email = `e2e.new-${SUFFIX}@example.invalid`;
    await l.fill('#inv-email', email); await l.fill('#inv-name', `E2E Newcomer ${SUFFIX} (synthetic)`);
    await l.fill('#inv-title', 'Analyst (synthetic)');
    await l.selectOption('#inv-dept', { label: 'OPS · Operations (synthetic)' });
    await l.selectOption('#inv-role', { label: 'Participant (synthetic) (candidate)' });
    await l.selectOption('#inv-scope', { label: 'OPS · Operations (synthetic) (and sub-departments)' });
    await l.getByRole('button', { name: 'Invite' }).click();
    const secret = l.locator('div[style*="monospace"]').first();
    await secret.waitFor({ timeout: 15000 });
    const temp = (await secret.innerText()).trim();
    check('invite shows a one-time temporary password', temp.length >= 20);
    await l.screenshot({ path: (process.env.E2E_OUT || '/tmp') + '/04-admin-invite.png', fullPage: true });
    await l.reload();
    check('temporary password is not shown again after reload', (await l.getByText(temp).count()) === 0);

    const n = await (await browser.newContext()).newPage();
    await uiLogin(n, email, temp);
    await n.goto(BASE + '/');
    check('newcomer is forced to set a password', n.url().endsWith('/account/password') && await n.getByRole('heading', { name: 'Set your password' }).isVisible());
    const own = crypto.randomBytes(12).toString('base64url');
    await n.fill('#password', own); await n.fill('#confirm', own + 'x');
    await n.getByRole('button', { name: 'Save password' }).click();
    await n.waitForURL(/e=/);
    check('mismatched passwords are refused', await n.getByText('The two passwords do not match.').isVisible());
    await n.fill('#password', own); await n.fill('#confirm', own);
    await n.getByRole('button', { name: 'Save password' }).click();
    await n.waitForURL(/pw=1/);
    check('password saved; invitation visible', await n.getByText('Invited', { exact: true }).isVisible());
    await n.getByRole('button', { name: 'Accept invitation' }).click();
    await n.waitForURL(/\/c\//);
    check('newcomer accepts and enters the company', await n.getByText('No interviews are assigned to you.').isVisible());
    const adm = await n.goto(`${BASE}/c/${CO}/admin`);
    check('newcomer cannot open administration (404)', adm.status() === 404);

    const sb2 = createClient(URL, KEY, { auth: { persistSession: false } });
    const { error: oldPw } = await sb2.auth.signInWithPassword({ email, password: temp });
    check('temporary password no longer works', !!oldPw);

    await l.goto(`${BASE}/c/${CO}/admin`);
    const row = l.locator('tr', { hasText: `E2E Newcomer ${SUFFIX}` });
    check('member listed as active with department-scoped role', (await row.innerText()).includes('active') && (await row.innerText()).includes('Participant (synthetic) · OPS'));
  } catch (e) { results.push('ERROR ' + e.message.split('\n')[0]); }
  finally { await browser.close(); console.log(results.join('\n')); }
})();
