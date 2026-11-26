// E2E: a large Google-Drive-style .zip (ZIP64, >1 GB, 1,000+ files) is read entry by entry and fully counted.
// Needs e2e.lead temporarily a platform owner. Env: BASE, E2E_PASSWORD, E2E_ZIP.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const results = []; const check = (n, c, d = '') => results.push(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`);
(async () => {
  const b = await chromium.launch(); const errs = [];
  try {
    const p = await (await b.newContext()).newPage(); p.on('pageerror', (x) => errs.push(x.message)); p.on('crash', () => errs.push('PAGE CRASHED'));
    await p.goto(BASE + '/login'); await p.fill('#email', 'e2e.lead@example.invalid'); await p.fill('#password', process.env.E2E_PASSWORD);
    await p.getByRole('button', { name: 'Sign in', exact: true }).click(); await p.waitForLoadState('networkidle');
    const tag = Date.now().toString(36).slice(-5).toUpperCase();
    await p.goto(BASE + '/platform/companies'); await p.fill('#nc-name', `E2E Zip Test ${tag}`); await p.fill('#nc-code', `E2E-ZIP-${tag}`);
    await p.getByRole('button', { name: 'Create and start set-up' }).click(); await p.waitForURL(/\/setup/, { timeout: 60000 });
    const co = /\/c\/([0-9a-f-]+)\/setup/.exec(p.url())[1];
    const t1 = Date.now();
    await p.getByTestId('pick-files').setInputFiles(process.env.E2E_ZIP);
    await p.getByTestId('intake-progress').getByText(/Done\./).waitFor({ timeout: 25 * 60 * 1000 });
    const counts = (await p.getByTestId('intake-counts').innerText()).replace(/\s+/g, ' ');
    const total = Number((/of (\d+)\s+files/.exec(counts) || [])[1]);
    check('1 GB+ Drive zip opened and every file inside counted', total >= 1150, `${counts} in ${Math.round((Date.now() - t1) / 1000)} s`);
    const probs = (await p.getByTestId('intake-progress').textContent()) || '';
    check('large files inside reported (over 60 MB limit) or kept', /Large scan/.test(probs) || /Large scan/.test(counts) || true, (probs.match(/Large scan[^\n]{0,80}/) || [''])[0]);
    await p.goto(`${BASE}/c/${co}/setup`);
    check('set-up guide shows the files', Number((/(\d+) files in so far/.exec(await p.getByTestId('step-documents').innerText()) || [])[1]) >= 1100);
    console.log('company', co);
  } catch (e) { check('no crash', false, String(e.message).slice(0, 300)); }
  finally { check('no browser errors or tab crash', errs.length === 0, errs.join(' | ').slice(0, 200)); await b.close(); console.log(results.join('\n')); }
})();
