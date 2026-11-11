// E2E (synthetic tenant): sign-up → answers → reviewer: knowledge + verify, follow-up → reply → dispute → positions → decision
// → review complete → admin password reset → forced change. Env: BASE, E2E_JOIN_TOKEN, E2E_PASSWORD, E2E_OUT.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const CO = 'e2e00000-0000-4000-8000-0000000000c0';
const PW = process.env.E2E_PASSWORD;
const tag = Date.now().toString(36).slice(-5);
const NAME = `Meera Synthetic ${tag}`;
const mobile = '93' + String(Date.now()).slice(-8);
const myPw = 'Synthetic-' + tag + '-pw';
const results = []; const check = (n, c) => results.push(`${c ? 'PASS' : 'FAIL'}  ${n}`);
const waitTrue = (p) => p.then(() => true, () => false);

async function login(b, id, pw) {
  const p = await (await b.newContext({ viewport: { width: 1100, height: 900 } })).newPage();
  await p.goto(BASE + '/login'); await p.fill('#email', id); await p.fill('#password', pw);
  await p.getByRole('button', { name: 'Sign in', exact: true }).click(); await p.waitForLoadState('networkidle');
  return p;
}

(async () => {
  const b = await chromium.launch();
  try {
    // 1. respondent signs up and answers everything
    const r = await (await b.newContext()).newPage();
    await r.goto(`${BASE}/join/${process.env.E2E_JOIN_TOKEN}`);
    await r.fill('#name', NAME); await r.fill('#mobile', mobile); await r.fill('#password', myPw); await r.fill('#confirm', myPw);
    await r.getByRole('button', { name: 'Sign up and start' }).click();
    await r.waitForSelector('.chat-progress', { timeout: 30000 }); await r.waitForLoadState('networkidle');
    for (let i = 0; i < 40; i++) {
      if (await r.getByRole('button', { name: 'Submit my answers' }).count()) break;
      if (await r.locator('.composer .chips .chip:not(.ghost)').count()) await r.locator('.composer .chips .chip:not(.ghost)').first().click();
      else { await r.fill('textarea[aria-label="Your answer"]', `Ops head approves refunds (answer ${i})`); await r.getByRole('button', { name: 'Send' }).click(); }
      await r.waitForFunction((n) => document.querySelectorAll('.bubble.me').length >= n, i + 1, { timeout: 15000 });
    }
    await r.getByRole('button', { name: 'Submit my answers' }).click(); await r.waitForURL(/submitted=1/);
    check('respondent completes and submits', true);

    // 2. reviewer: knowledge + verify + follow-up
    const l = await login(b, 'e2e.lead@example.invalid', PW);
    await l.goto(`${BASE}/c/${CO}/review`);
    await l.locator('tr', { hasText: NAME }).getByRole('link', { name: 'Open' }).click();
    await l.waitForLoadState('networkidle');
    check('review queue lists the submitted interview', l.url().includes('/review/'));
    const card1 = l.locator('.card', { hasText: 'Q1' }).first();
    await card1.locator('summary').click();
    await card1.getByRole('button', { name: 'Save as draft knowledge' }).click();
    await l.waitForURL(/ok=Saved/);
    check('reviewer records an answer as draft knowledge linked to it', await l.locator('.card', { hasText: 'Q1' }).first().getByText('Draft', { exact: true }).isVisible());
    await l.locator('.card', { hasText: 'Q1' }).first().getByRole('button', { name: 'Verify' }).click();
    await l.waitForURL(/ok=Verified/);
    check('reviewer verifies it (human, sourced)', await l.locator('.card', { hasText: 'Q1' }).first().getByText('Verified', { exact: true }).isVisible());
    const card2 = l.locator('.card', { hasText: 'Q2' }).first();
    await card2.locator('summary').click();
    await card2.locator('textarea[name="question"]').fill(`Who exactly approves refunds above the limit? (${tag})`);
    await card2.getByRole('button', { name: 'Send follow-up' }).click(); await l.waitForURL(/ok=Follow-up/);
    check('reviewer sends a follow-up question', await l.getByText(`Who exactly approves refunds above the limit? (${tag})`).isVisible());
    await l.screenshot({ path: `${process.env.E2E_OUT || '/tmp'}/08-review.png`, fullPage: false });

    // 3. respondent replies
    const r2 = await login(b, mobile, myPw);
    check('respondent lands on home with the question waiting', await waitTrue(r2.getByText(`(${tag})`).waitFor({ timeout: 15000 })));
    await r2.getByRole('link', { name: 'Reply' }).first().click();
    await r2.fill('#rep', 'Finance head approves above the limit.'); await r2.getByRole('button', { name: 'Send reply' }).click();
    await r2.waitForURL(/ok=Reply/);
    check('respondent replies', await r2.getByText('Finance head approves above the limit.').isVisible());

    // 4. reviewer notified, raises dispute
    await l.goto(`${BASE}/c/${CO}`);
    check('reviewer gets a notification of the reply', await waitTrue(l.getByText(/New reply on CL-/).first().waitFor({ timeout: 10000 })));
    await l.getByText(/New reply on CL-/).first().click(); await l.waitForLoadState('networkidle');
    await l.locator('summary', { hasText: 'Raise a dispute' }).click();
    await l.fill('#iss', `Interview says Ops head approves; follow-up says Finance head (${tag}).`);
    await l.fill('#pos', 'Branch practice: Ops head approves below the limit.');
    await l.selectOption('#own', { label: 'E2E Respondent (synthetic)' });
    await l.getByRole('button', { name: 'Raise dispute' }).click(); await l.waitForURL(/disputes\//);
    check('reviewer raises a dispute with their position', await l.getByText('Branch practice: Ops head approves below the limit.').isVisible());
    const disputeUrl = l.url().split('?')[0];

    // 5. respondent (other party) adds position
    await r2.goto(disputeUrl);
    await r2.fill('#pp', 'Written rule: Finance head approves above the limit.'); await r2.getByRole('button', { name: 'Record my position' }).click();
    await r2.waitForURL(/ok=/);
    check('the other party records their position', await r2.getByText('Written rule: Finance head approves above the limit.').isVisible());

    // 6. decision owner decides
    const d = await login(b, 'e2e.respondent@example.invalid', PW);
    await d.goto(`${BASE}/c/${CO}`);
    check('decision owner is notified', await waitTrue(d.getByText(/needs your decision/).first().waitFor({ timeout: 10000 })));
    await d.goto(disputeUrl);
    await d.fill('#dd', 'Finance head approves above the limit; Ops head below.'); await d.fill('#dr', 'Both statements apply in different ranges.');
    await d.getByRole('button', { name: 'Record decision' }).click(); await d.waitForURL(/ok=Decision/);
    check('human decision closes the dispute', await d.getByText(/Decision \(/).isVisible());

    // 7. reviewer completes review
    await l.goto(`${BASE}/c/${CO}/review`);
    await l.locator('tr', { hasText: NAME }).getByRole('link', { name: 'Open' }).click();
    await l.getByRole('button', { name: 'Mark review complete' }).click(); await l.waitForURL(/ok=Marked/);
    check('review marked complete', await l.getByText('status: reviewed').isVisible());

    // 8. admin resets the respondent's password → forced change
    await l.goto(`${BASE}/c/${CO}/admin`);
    const row = l.locator('tr', { hasText: NAME });
    check('admin sees the member’s mobile number', (await row.innerText()).includes(`+91 ${mobile}`));
    await row.getByRole('button', { name: 'Reset password' }).click();
    const secret = row.locator('div[style*="monospace"]'); await secret.waitFor({ timeout: 15000 });
    const temp = (await secret.innerText()).trim();
    check('reset shows a one-time temporary password', temp.length >= 20);
    const r3 = await login(b, mobile, temp);
    await r3.goto(`${BASE}/c/${CO}`); await r3.waitForLoadState('networkidle');
    check('after reset the person must set a new password', r3.url().includes('/account/password'));
    const newPw = myPw + '-2';
    await r3.fill('#password', newPw); await r3.fill('#confirm', newPw); await r3.getByRole('button', { name: 'Save password' }).click();
    await r3.waitForLoadState('networkidle');
    const r4 = await login(b, mobile, newPw);
    check('new password works; access restored', !r4.url().includes('/login') && !r4.url().includes('/account/password'));
    const old = await login(b, mobile, myPw);
    check('old password no longer works', old.url().includes('/login'));
  } catch (e) { results.push('ERROR ' + e.message.split('\n')[0]); }
  finally { await b.close(); console.log(results.join('\n')); }
})();
