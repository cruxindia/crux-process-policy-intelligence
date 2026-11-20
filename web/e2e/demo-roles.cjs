// P8 role views over DEMO with the synthetic lead TEMPORARILY holding the role given in ROLE (dept_head_ops | employee).
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const I = JSON.parse(process.env.DEMO_IDS); const C = `/c/${I.co}`; const ROLE = process.env.ROLE;
const results = []; const check = (n, c, d = '') => results.push(`${c ? 'PASS' : 'FAIL'}  [${ROLE}] ${n}${d ? ' — ' + d : ''}`);
(async () => {
  const b = await chromium.launch(); const errs = [];
  try {
    const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); p.on('pageerror', (x) => errs.push(x.message));
    await p.goto(BASE + '/login'); await p.fill('#email', 'e2e.lead@example.invalid'); await p.fill('#password', process.env.E2E_PASSWORD);
    await p.getByRole('button', { name: 'Sign in', exact: true }).click(); await p.waitForLoadState('networkidle');
    const st = async (u) => (await p.goto(BASE + u, { waitUntil: 'networkidle' })).status();
    if (ROLE === 'dept_head_ops') {
      check('dashboard opens', (await st(`${C}/dashboard`)) === 200);
      const depts = await p.getByTestId('dept-table').innerText();
      check('dashboard shows only Verification Operations', /Verification Operations/.test(depts) && !/Finance|Technology|Field Investigation/.test(depts));
      check('participation report is department-scoped', (await st(`${C}/reports/participation`)) === 200 && /Your departments only/.test(await p.locator('main').innerText()));
      check('company-wide report refused with a clear message', (await st(`${C}/reports/documents`)) === 200 && /company-wide/.test(await p.locator('.notice.error').innerText().catch(() => '')));
      check('billing not reachable', (await st(`${C}/billing`)) === 404);
    } else {
      check('home opens with welcome', (await st(C)) === 200 && (await p.getByTestId('welcome').count()) === 1);
      check('dashboard not reachable', (await st(`${C}/dashboard`)) === 404);
      check('reports not reachable', (await st(`${C}/reports`)) === 404);
      check('processes readable', (await st(`${C}/catalogue`)) === 200);
      check('projects visible (transparency)', (await st(`${C}/projects`)) === 200 && /Operations discovery/.test(await p.locator('main').innerText()));
      check('integrations and billing not reachable', (await st(`${C}/integrations`)) === 404 && (await st(`${C}/billing`)) === 404);
    }
    check('no browser errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  } catch (x) { check('no crash', false, x.message.split('\n')[0]); }
  finally { await b.close(); }
  console.log(results.join('\n')); process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
})();
