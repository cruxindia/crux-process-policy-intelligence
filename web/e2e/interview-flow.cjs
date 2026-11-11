// End-to-end smoke test of the interview slice against a Supabase dev project.
// Requires a FRESH synthetic fixture (see e2e/fixture.template.sql) — it accepts the invitation and creates campaign E2E-DISC-01.
// Run:  npm run build && npm start &   then
//       E2E_PASSWORD=... NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=... node e2e/interview-flow.cjs
// Playwright is not a project dependency here; the runner environment provides it.
const { chromium } = require('playwright');
const { createServerClient } = require('@supabase/ssr');
const fs = require('fs');
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL, KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const PW = process.env.E2E_PASSWORD;
const BASE = 'http://localhost:3000', OUT = process.env.E2E_OUT || '/tmp';
const results = [];
const check = (name, cond) => { results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}`); };

async function sessionCookies(email) {
  const jar = new Map();
  const sb = createServerClient(URL, KEY, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: (cs) => cs.forEach((c) => jar.set(c.name, c.value)) } });
  const { error } = await sb.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`sign-in ${email}: ${error.message}`);
  return [...jar].map(([name, value]) => ({ name, value, domain: 'localhost', path: '/', sameSite: 'Lax' }));
}
async function ctxFor(browser, email) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addCookies(await sessionCookies(email));
  return ctx;
}

(async () => {
  const browser = await chromium.launch();
  try {
    // 0. signed out → login
    const anon = await (await browser.newContext()).newPage();
    await anon.goto(BASE + '/c/e2e00000-0000-4000-8000-0000000000c0');
    check('signed-out user is sent to /login', anon.url().endsWith('/login'));

    // 1. respondent accepts invitation
    const rctx = await ctxFor(browser, 'e2e.respondent@example.invalid'); const r = await rctx.newPage();
    await r.goto(BASE + '/');
    check('invitee sees pending invitation', await r.getByText('Invited', { exact: true }).isVisible());
    await r.screenshot({ path: OUT + '/01-invitation.png' });
    await r.getByRole('button', { name: 'Accept invitation' }).click();
    await r.waitForURL(/\/c\/e2e/);
    check('after accepting, company home opens', await r.getByText('No interviews are assigned to you.').isVisible());
    const disc = await r.goto(BASE + '/c/e2e00000-0000-4000-8000-0000000000c0/discovery');
    check('respondent cannot open discovery setup (404)', disc.status() === 404);

    // 2. lead sets up discovery
    const lctx = await ctxFor(browser, 'e2e.lead@example.invalid'); const l = await lctx.newPage();
    await l.goto(BASE + '/c/e2e00000-0000-4000-8000-0000000000c0/discovery');
    await l.getByRole('button', { name: 'Load starter questions' }).click();
    await l.waitForURL(/ok=/);
    check('lead loads 26 starter questions', await l.getByText('26 question(s) added.').isVisible());
    await l.fill('#code', 'E2E-DISC-01'); await l.fill('#name', 'Operations discovery (synthetic)');
    await l.fill('#purpose', 'Synthetic end-to-end test campaign.');
    await l.getByRole('button', { name: 'Create campaign' }).click();
    await l.waitForURL(/ok=Campaign/);
    check('lead creates campaign', await l.getByText('E2E-DISC-01 · Operations discovery (synthetic)').isVisible());
    await l.fill('#code', 'E2E-DISC-01'); await l.fill('#name', 'Duplicate');
    await l.getByRole('button', { name: 'Create campaign' }).click();
    await l.waitForURL(/e=/);
    check('duplicate campaign code is refused with a clear message', await l.getByText('That campaign code is already used.').isVisible());
    const card = l.locator('.card', { hasText: 'E2E-DISC-01' });
    await card.locator('select[name=respondent_membership_id]').selectOption({ label: 'E2E Respondent (synthetic) · Operations executive (synthetic)' });
    await card.getByRole('button', { name: 'Assign interview' }).click();
    await l.waitForURL(/ok=Interview/);
    check('lead assigns interview to respondent', await l.getByText('E2E Respondent (synthetic) · Operations executive (synthetic) — invited').isVisible());
    await l.screenshot({ path: OUT + '/02-discovery-setup.png', fullPage: true });

    // 3. respondent answers
    await r.goto(BASE + '/c/e2e00000-0000-4000-8000-0000000000c0');
    await r.getByRole('link', { name: 'Start' }).click();
    await r.getByRole('button', { name: 'Start interview' }).click();
    await r.waitForSelector('text=0 of 12 answered');
    check('interview starts with 12 department questions', await r.getByText('0 of 12 answered').isVisible());
    const q1 = r.locator('.card').filter({ hasText: '1. What is the purpose of your department' });
    await q1.locator('textarea').fill('We process synthetic requests end to end.');
    await r.waitForSelector('text=/Draft saved/', { timeout: 10000 });
    await r.reload();
    check('autosaved draft survives a reload (resume)', (await q1.locator('textarea').inputValue()) === 'We process synthetic requests end to end.');
    await q1.getByRole('button', { name: 'Save answer' }).click();
    await q1.getByText('Answered', { exact: true }).waitFor();
    check('answer saved', await q1.getByText('We process synthetic requests end to end.').isVisible());
    await q1.getByRole('button', { name: 'Change answer' }).click();
    await q1.locator('textarea').fill('We receive, check and route synthetic requests.');
    await q1.getByRole('button', { name: 'Save answer' }).click();
    check('changing an answer without a reason is refused', await q1.getByText('Give a short reason for changing your answer.').isVisible({ timeout: 5000 }).catch(() => false)
      || await q1.getByText('Give a short reason for changing your answer.').waitFor({ timeout: 5000 }).then(() => true, () => false));
    await q1.locator('input[id^=why-]').fill('Clarified scope with my team');
    await q1.getByRole('button', { name: 'Save answer' }).click();
    await q1.getByText('Answered · rev 2').waitFor();
    check('revision 2 recorded with reason', await q1.getByText('Answered · rev 2').isVisible());
    const q2 = r.locator('.card').filter({ hasText: '2. Which services or outputs' });
    await q2.locator('select[id^=k-]').selectOption('unknown');
    await q2.getByRole('button', { name: 'Save answer' }).click();
    await q2.getByText('Answered', { exact: true }).waitFor();
    check('"I don\'t know" is accepted as an answer', await q2.getByText("I don't know").isVisible());
    await r.screenshot({ path: OUT + '/03-interview.png' });
    await r.getByRole('button', { name: 'Submit interview' }).click();
    await r.waitForURL(/submitted=1/);
    check('respondent submits interview', await r.getByText(/Submitted\. Thank you/).isVisible());
    check('submitted interview is read-only', (await r.getByRole('button', { name: 'Change answer' }).count()) === 0);
    await r.goto(BASE + '/c/e2e00000-0000-4000-8000-0000000000c0');
    check('assignment shows Completed', await r.getByText('Completed', { exact: true }).isVisible());

    // 4. lead (company-wide interview.review) can read the submitted interview
    const assignmentHref = await r.getByRole('link', { name: 'View' }).getAttribute('href');
    await l.goto(BASE + assignmentHref);
    check('reviewer can read submitted answers', await l.getByText('We receive, check and route synthetic requests.').isVisible());
  } catch (e) {
    results.push('ERROR ' + e.message.split('\n')[0]);
  } finally {
    await browser.close();
    console.log(results.join('\n'));
  }
})();
