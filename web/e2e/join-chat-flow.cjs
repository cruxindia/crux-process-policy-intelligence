// E2E: join link → sign up with mobile → chat interview (3 sections, % progress) → submit → sign in again with mobile.
// Env: BASE, E2E_JOIN_TOKEN (synthetic tenant link), E2E_PASSWORD (for the synthetic lead/reviewer), E2E_OUT.
const { chromium, devices } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const CO = 'e2e00000-0000-4000-8000-0000000000c0';
const OUT = process.env.E2E_OUT || '/tmp';
const mobile = '98' + String(Date.now()).slice(-8);
const pw = 'Synthetic-' + Math.random().toString(36).slice(2, 10);
const results = []; const check = (n, c) => results.push(`${c ? 'PASS' : 'FAIL'}  ${n}`);
const pct = async (p) => (await p.locator('.chat-progress strong').innerText()).trim();

(async () => {
  const b = await chromium.launch();
  try {
    const bad = await (await b.newContext()).newPage();
    await bad.goto(`${BASE}/join/not-a-real-token`);
    check('invalid join link shows a clear message', await bad.getByRole('heading', { name: 'Link not valid' }).isVisible());

    const ctx = await b.newContext({ ...devices['iPhone 13'] });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/join/${process.env.E2E_JOIN_TOKEN}`);
    check('join page shows the campaign', await p.getByRole('heading', { name: 'Synthetic discovery (test)' }).isVisible());
    await p.screenshot({ path: `${OUT}/06-join.png` });
    await p.fill('#name', 'Ravi Synthetic Kumar'); await p.fill('#mobile', `+91 ${mobile}`);
    await p.fill('#password', pw); await p.fill('#confirm', pw);
    await p.getByRole('button', { name: 'Sign up and start' }).click();
    await p.waitForSelector('.chat-progress', { timeout: 30000 }); await p.waitForLoadState('networkidle');
    check('after sign-up the chat opens straight away at 0%', (await pct(p)) === '0% complete');
    check('greets by first name and lists 28 questions', await p.getByText('Hi Ravi! I’ll ask 28 short questions in 3 parts.').isVisible());
    check('section 1 is “About you”', await p.getByText('Part 1 of 3 · About you').isVisible());

    // Q1 text answer
    await p.fill('textarea[aria-label="Your answer"]', 'Synthetic field officer');
    await p.getByRole('button', { name: 'Send' }).click();
    await p.locator('.bubble.me', { hasText: 'Synthetic field officer' }).waitFor();
    await p.waitForFunction(() => document.querySelector('.chat-progress strong')?.textContent?.startsWith('4%'), null, { timeout: 10000 }).catch(() => {});
    check('first answer moves progress to 4%', (await pct(p)) === '4% complete');
    // Q2 draft + reload (resume)
    await p.fill('textarea[aria-label="Your answer"]', 'Synthetic operations');
    await p.waitForTimeout(2500);
    await p.reload(); await p.waitForSelector('.chat-progress'); await p.waitForLoadState('networkidle');
    check('typed draft survives reload (resume)', (await p.locator('textarea[aria-label="Your answer"]').inputValue()) === 'Synthetic operations');
    await p.getByRole('button', { name: 'Send' }).click(); await p.locator('.bubble.me', { hasText: 'Synthetic operations' }).waitFor();
    // Q3 "Someone else knows"
    await p.getByRole('button', { name: 'Someone else knows' }).click();
    await p.fill('input[aria-label="Who knows"]', 'Branch manager'); await p.getByRole('button', { name: 'OK' }).click();
    await p.locator('.bubble.me', { hasText: 'Branch manager' }).waitFor();
    // Q4 choice
    await p.getByRole('button', { name: 'Field work' }).click(); await p.locator('.bubble.me', { hasText: 'Field work' }).waitFor();
    check('choice question answered with one tap', await p.locator('.bubble.me', { hasText: 'Field work' }).count() === 1);
    // edit Q1
    await p.locator('.bubble.me', { hasText: 'Synthetic field officer' }).getByRole('button', { name: 'edit' }).click();
    await p.fill('textarea[aria-label="Your answer"]', 'Synthetic senior field officer');
    await p.getByRole('button', { name: 'Send' }).click(); await p.locator('.bubble.me', { hasText: 'Synthetic senior field officer' }).waitFor();
    check('a previous answer can be edited', true);

    // answer the rest
    for (let i = 0; i < 40; i++) {
      if (await p.getByRole('button', { name: 'Submit my answers' }).count()) break;
      if (i === 8) { await p.getByRole('button', { name: 'I don’t know' }).click(); }
      else if (await p.locator('.composer .chips .chip:not(.ghost)').count()) await p.locator('.composer .chips .chip:not(.ghost)').first().click();
      else { await p.fill('textarea[aria-label="Your answer"]', `Synthetic answer ${i}`); await p.getByRole('button', { name: 'Send' }).click(); }
      await p.waitForFunction((n) => document.querySelectorAll('.bubble.me').length >= n, i + 5, { timeout: 15000 });
    }
    check('company section was asked (Part 2)', await p.getByText('Part 2 of 3 · About CRUX').isVisible());
    check('process section was asked (Part 3)', await p.getByText('Part 3 of 3 · Your work').isVisible());
    check('progress reaches 100%', (await pct(p)) === '100% complete');
    await p.screenshot({ path: `${OUT}/07-chat-complete.png` });
    await p.getByRole('button', { name: 'Submit my answers' }).click();
    await p.waitForURL(/submitted=1/);
    check('respondent submits', await p.getByText(/Submitted/).first().isVisible());

    const disc = await p.goto(`${BASE}/c/${CO}/discovery`);
    check('self-registered person cannot open discovery setup (404)', disc.status() === 404);
    const adm = await p.goto(`${BASE}/c/${CO}/admin`);
    check('self-registered person cannot open administration (404)', adm.status() === 404);

    // sign in again with mobile number
    const p2 = await (await b.newContext()).newPage();
    await p2.goto(`${BASE}/login`); await p2.fill('#email', `0${mobile}`); await p2.fill('#password', pw);
    await p2.getByRole('button', { name: 'Sign in', exact: true }).click(); await p2.waitForLoadState('networkidle');
    check('sign-in with mobile number works', !p2.url().includes('/login') && await p2.getByText(`+91 ${mobile}`).isVisible());

    // duplicate sign-up refused
    const p3 = await (await b.newContext()).newPage();
    await p3.goto(`${BASE}/join/${process.env.E2E_JOIN_TOKEN}`);
    await p3.fill('#name', 'Duplicate'); await p3.fill('#mobile', mobile); await p3.fill('#password', pw); await p3.fill('#confirm', pw);
    await p3.getByRole('button', { name: 'Sign up and start' }).click();
    check('same mobile cannot sign up twice', await p3.getByText(/already registered/).waitFor({ timeout: 15000 }).then(() => true, () => false));

    // reviewer sees the answers
    const r = await (await b.newContext()).newPage();
    await r.goto(`${BASE}/login`); await r.fill('#email', 'e2e.lead@example.invalid'); await r.fill('#password', process.env.E2E_PASSWORD);
    await r.getByRole('button', { name: 'Sign in', exact: true }).click(); await r.waitForLoadState('networkidle');
    await r.goto(`${BASE}/c/${CO}/discovery`);
    await r.locator('li', { hasText: 'Ravi Synthetic Kumar' }).getByRole('link', { name: 'view answers' }).last().click();
    check('reviewer can read the submitted chat', await r.getByText('Synthetic senior field officer').waitFor({ timeout: 15000 }).then(() => true, () => false));
  } catch (e) { results.push('ERROR ' + e.message.split('\n')[0]); }
  finally { await b.close(); console.log(results.join('\n')); }
})();
