// Live smoke of the interview slice on an existing synthetic tenant (lead + active respondent). Env: BASE, E2E_PASSWORD.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const CO = 'e2e00000-0000-4000-8000-0000000000c0';
const CODE = 'E2E-' + Date.now().toString(36).toUpperCase();
const results = []; const check = (n, c) => results.push(`${c ? 'PASS' : 'FAIL'}  ${n}`);
async function login(ctx, email) {
  const p = await ctx.newPage(); await p.goto(BASE + '/login');
  await p.fill('#email', email); await p.fill('#password', process.env.E2E_PASSWORD);
  await p.getByRole('button', { name: 'Sign in', exact: true }).click(); await p.waitForURL(BASE + '/'); return p;
}
(async () => {
  const b = await chromium.launch();
  try {
    const l = await login(await b.newContext(), 'e2e.lead@example.invalid');
    await l.goto(`${BASE}/c/${CO}/discovery`);
    await l.fill('#code', CODE); await l.fill('#name', `Live smoke ${CODE} (synthetic)`);
    await l.getByRole('button', { name: 'Create campaign' }).click(); await l.waitForURL(/ok=Campaign/);
    const card = l.locator('.card', { hasText: CODE });
    await card.locator('select[name=respondent_membership_id]').selectOption({ label: 'E2E Respondent (synthetic) · Operations executive (synthetic)' });
    await card.getByRole('button', { name: 'Assign interview' }).click(); await l.waitForURL(/ok=Interview/);
    check('live: lead creates campaign and assigns', true);
    const r = await login(await b.newContext({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2 }), 'e2e.respondent@example.invalid');
    await r.goto(`${BASE}/c/${CO}`);
    await r.locator('.card', { hasText: `Live smoke ${CODE}` }).getByRole('link', { name: 'Start' }).click();
    await r.getByRole('button', { name: 'Start interview' }).click();
    await r.waitForSelector('text=0 of 12 answered');
    const q1 = r.locator('.card').filter({ hasText: '1. What is the purpose of your department' });
    await q1.locator('textarea').fill('Live synthetic answer.');
    await r.waitForSelector('text=/Draft saved/', { timeout: 15000 });
    await r.reload();
    check('live: autosaved draft survives reload', (await q1.locator('textarea').inputValue()) === 'Live synthetic answer.');
    await q1.getByRole('button', { name: 'Save answer' }).click(); await q1.getByText('Answered', { exact: true }).waitFor();
    check('live: answer saved', true);
    await r.getByRole('button', { name: 'Submit interview' }).click(); await r.waitForURL(/submitted=1/);
    check('live: interview submitted', await r.getByText(/Submitted\. Thank you/).isVisible());
    await r.screenshot({ path: (process.env.E2E_OUT || '/tmp') + '/05-live-interview.png' });
  } catch (e) { results.push('ERROR ' + e.message.split('\n')[0]); }
  finally { await b.close(); console.log(results.join('\n')); }
})();
