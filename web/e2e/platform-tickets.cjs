// E2E (synthetic tenant): P1 platform console + P2 tasks & tickets.
// The synthetic lead is made platform owner ONLY for this run (granted before, revoked after by the runner script).
// Env: BASE, E2E_PASSWORD (lead), E2E_JOIN_TOKEN (synthetic join link), E2E_OUT.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const OUT = process.env.E2E_OUT || '/tmp';
const CO = 'e2e00000-0000-4000-8000-0000000000c0';
const LEAD = 'e2e.lead@example.invalid';
const tag = Date.now().toString(36).slice(-5);
const mobile = '93' + String(Date.now()).slice(-8);
const pw = 'Synthetic-' + tag + '-pw';
const results = []; const check = (n, c, d = '') => results.push(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`);

async function login(b, email, pass) {
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await p.goto(BASE + '/login'); await p.fill('#email', email); await p.fill('#password', pass);
  await p.getByRole('button', { name: 'Sign in', exact: true }).click(); await p.waitForLoadState('networkidle');
  return p;
}

(async () => {
  const b = await chromium.launch(); const errs = [];
  try {
    // ---- employee joins (synthetic) ----
    const e = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); e.on('pageerror', (x) => errs.push(x.message));
    await e.goto(`${BASE}/join/${process.env.E2E_JOIN_TOKEN}`);
    await e.fill('#name', `Ticket Synthetic ${tag}`); await e.fill('#mobile', mobile); await e.fill('#password', pw); await e.fill('#confirm', pw);
    await e.getByRole('button', { name: 'Sign up and start' }).click(); await e.waitForLoadState('networkidle');
    await e.goto(`${BASE}/c/${CO}/tasks`);
    check('company navigation bar with "My work"', (await e.getByRole('navigation').getByRole('link', { name: /My work/ }).count()) === 1);
    check('"My work" starts empty with an encouraging message', /Nothing assigned to you/.test(await e.getByTestId('empty').innerText()));
    await e.getByRole('link', { name: 'Get help' }).click(); await e.getByTestId('new-ticket').waitFor();
    await e.fill('#t-title', `Synthetic help request ${tag}`); await e.fill('#t-desc', 'The page loads slowly on my phone (synthetic).');
    await e.getByRole('button', { name: 'Send to the platform team' }).click(); await e.waitForURL(/\/tasks\/[0-9a-f-]{36}/);
    check('a support ticket goes to the platform team', /Sent to the platform team/.test(await e.locator('.notice.ok').innerText()) && /Platform team/.test(await e.getByTestId('ticket-facts').innerText()));
    const supportUrl = e.url();

    // ---- lead: platform console ----
    const l = await login(b, LEAD, process.env.E2E_PASSWORD); l.on('pageerror', (x) => errs.push(x.message));
    check('platform owner sees the console link', (await l.getByTestId('platform-link').count()) === 1);
    await l.goto(BASE + '/platform');
    check('overview figures shown', (await l.locator('[data-testid="platform-kpis"] .kpi').count()) >= 6);
    await l.goto(BASE + '/platform/companies?test=1');
    check('companies table lists the synthetic tenant', /E2E-SYNTH/.test(await l.getByTestId('companies-table').innerText()));
    await l.fill('#nc-name', `E2E New Company ${tag}`); await l.fill('#nc-code', `E2E-NC-${tag.toUpperCase()}`);
    await l.fill('#nc-admin', 'Synthetic Admin'); await l.fill('#nc-email', `e2e.newco.${tag}@example.invalid`);
    await l.getByRole('button', { name: 'Create company' }).click(); await l.getByTestId('created').waitFor({ timeout: 20000 });
    const temp = (await l.getByTestId('temp-pw').innerText()).trim();
    check('company created; the new admin\'s temporary password is shown once', temp.length >= 10);
    const na = await login(b, `e2e.newco.${tag}@example.invalid`, temp);
    check('the new administrator can sign in and must replace the temporary password', /\/account\/password/.test(na.url()));
    await l.screenshot({ path: `${OUT}/p1-companies.png`, fullPage: true });

    // ---- lead: gives the employee a task ----
    await l.goto(`${BASE}/c/${CO}/tasks?new=action#new`);
    await l.selectOption('#t-target', { label: `Ticket Synthetic ${tag}` });
    await l.fill('#t-title', `Check the pincode sheet ${tag}`); await l.selectOption('#t-pri', 'high');
    await l.getByRole('button', { name: 'Create task' }).click(); await l.waitForURL(/\/tasks\/[0-9a-f-]{36}/);
    const taskUrl = l.url();
    check('manager creates a task for a person (ticket number shown)', /TKT-\d+/.test(await l.locator('h1').innerText()));

    // ---- employee works the task ----
    await e.goto(`${BASE}/c/${CO}/tasks`);
    check('the employee sees it under "For me" with a count in the navigation', (await e.locator('.company-nav .count').first().innerText()) === '1'
      && /Check the pincode sheet/.test(await e.getByTestId('tickets-table').innerText()));
    await e.getByRole('link', { name: /TKT-\d+/ }).first().click(); await e.getByTestId('ticket-actions').waitFor();
    await e.fill('textarea[aria-label="Write a message"]', 'Two pincodes were missing; adding them now.');
    await e.getByRole('button', { name: 'Send' }).click(); await e.waitForURL(/#thread/);
    check('the thread shows the message', /Two pincodes were missing/.test(await e.getByTestId('thread').innerText()));
    await e.getByRole('button', { name: 'Start' }).click(); await e.waitForURL(/ok=Updated/);
    await e.fill('#res', 'Sheet updated and shared with the team'); await e.getByRole('button', { name: 'Mark done' }).click();
    await e.getByTestId('ticket-facts').filter({ hasText: 'Resolved' }).waitFor({ timeout: 15000 }).catch(() => {});
    check('the employee starts and completes it with a resolution', /Resolved/.test(await e.getByTestId('ticket-facts').innerText()));
    await l.goto(`${BASE}/c/${CO}`);
    check('the manager is notified that it was resolved', (await l.locator('a', { hasText: /resolved: Check the pincode sheet/ }).count()) >= 1);
    void taskUrl;

    // ---- platform owner answers the help request ----
    await l.goto(BASE + '/platform/tickets');
    check('the help request appears in the platform ticket list', /Synthetic help request/.test(await l.getByTestId('platform-tickets').innerText()));
    const href = await l.locator('[data-testid="platform-tickets"] tr', { hasText: `Synthetic help request ${tag}` }).getByRole('link').first().getAttribute('href');
    await l.goto(BASE + href);
    await l.fill('textarea[aria-label="Reply"]', 'Thanks — we have made the page lighter. Please try again.'); await l.getByRole('button', { name: 'Send' }).click();
    await l.waitForLoadState('networkidle');
    await l.selectOption('#ps', 'resolved'); await l.fill('#pr', 'Page made lighter'); await l.getByRole('button', { name: 'Update' }).click(); await l.waitForURL(/ok=Updated/);
    await e.goto(supportUrl);
    check('the employee sees the platform team\'s reply and resolution', /made the page lighter/.test(await e.getByTestId('thread').innerText()) && /Resolved/.test(await e.getByTestId('ticket-facts').innerText()));

    await e.setViewportSize({ width: 390, height: 844 }); await e.goto(`${BASE}/c/${CO}/tasks?tab=done`);
    check('phone: no horizontal page scroll on My work', (await e.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1);
    await e.screenshot({ path: `${OUT}/p2-mywork-phone.png`, fullPage: true });
    check('no browser errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  } catch (x) { check('no crash', false, x.message.split('\n')[0]); }
  finally { await b.close(); }
  console.log(results.join('\n'));
  process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
})();
