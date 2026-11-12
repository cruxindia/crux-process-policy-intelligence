// E2E: a member who joined BEFORE the discovery conversation existed (here: the synthetic lead / administrator)
// sees "Let's understand the work you do" on their home, starts it with one click, and admin pages stay reachable.
// Env: BASE, E2E_PASSWORD, E2E_OUT.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const CO = 'e2e00000-0000-4000-8000-0000000000c0';
const OUT = process.env.E2E_OUT || '/tmp';
const results = []; const check = (n, c, d = '') => results.push(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`);
(async () => {
  const b = await chromium.launch();
  try {
    const p = await (await b.newContext({ viewport: { width: 1200, height: 900 } })).newPage();
    await p.goto(BASE + '/login'); await p.fill('#email', 'e2e.lead@example.invalid'); await p.fill('#password', process.env.E2E_PASSWORD);
    await p.getByRole('button', { name: 'Sign in', exact: true }).click(); await p.waitForLoadState('networkidle');
    await p.goto(BASE + '/'); await p.waitForLoadState('networkidle');
    check('administrator lands on the company home (not forced into a chat)', new URL(p.url()).pathname === `/c/${CO}`, p.url());
    const card = p.getByTestId('discovery-card');
    check('home shows "Let\'s understand the work you do" for an existing member', await card.isVisible() && /understand the work you do/.test(await card.innerText()));
    check('admin and review entry points still visible', (await p.getByRole('link', { name: /Administration/ }).count()) === 1);
    await p.screenshot({ path: `${OUT}/50-existing-member-home.png` });
    await card.getByRole('link', { name: /Start conversation|Continue conversation/ }).click();
    await p.waitForURL(/\/interviews\//, { timeout: 30000 }); await p.waitForSelector('.welcome, .disc', { timeout: 30000 });
    const started = (await p.locator('.welcome').count()) > 0 || (await p.locator('.disc').count()) > 0;
    check('one click opens the discovery conversation', started, p.url());
    await p.goto(BASE + `/c/${CO}`); await p.waitForLoadState('networkidle');
    check('visiting again does not create duplicates (one card)', (await p.getByTestId('discovery-card').count()) === 1);
  } catch (e) { check('no crash', false, e.message.split('\n')[0]); }
  finally { await b.close(); }
  console.log(results.join('\n'));
  process.exit(results.some((x) => x.startsWith('FAIL')) ? 1 : 0);
})();
