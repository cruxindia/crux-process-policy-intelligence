// Platform owner imports the audit-readiness master through the browser (PPI-046). Env: BASE, LOGIN_EMAIL, LOGIN_PW, BASELINE_XLSX, E2E_OUT.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const results = []; const check = (n, c, d = '') => results.push(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`);
(async () => {
  const b = await chromium.launch(); const errs = [];
  try {
    const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); p.on('pageerror', (x) => errs.push(x.message));
    await p.goto(BASE + '/login'); await p.fill('#email', process.env.LOGIN_EMAIL); await p.fill('#password', process.env.LOGIN_PW);
    await p.getByRole('button', { name: 'Sign in', exact: true }).click(); await p.waitForLoadState('networkidle');
    await p.goto(BASE + '/platform/baseline');
    await p.getByTestId('baseline-file').setInputFiles(process.env.BASELINE_XLSX);
    await p.getByText(/34 sheets/).waitFor({ timeout: 30000 });
    check('workbook read in the browser', true, await p.getByText(/34 sheets/).innerText());
    await p.getByRole('button', { name: 'Import and activate' }).click();
    await p.getByText(/^Activated/).waitFor({ timeout: 240000 });
    check('import activated after reconciliation', true, await p.getByText(/^Activated/).innerText());
    await p.reload();
    const list = await p.getByTestId('baseline-list').innerText();
    check('listed with counts', /Department Register: 174/.test(list) && /Process RACI Detail: 43/.test(list), list.replace(/\n/g, ' ').slice(0, 200));
    await p.screenshot({ path: `${process.env.E2E_OUT || '/tmp'}/baseline.png`, fullPage: true });
    check('no browser errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  } catch (x) { check('no crash', false, x.message.split('\n')[0]); }
  finally { await b.close(); }
  console.log(results.join('\n')); process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
})();
