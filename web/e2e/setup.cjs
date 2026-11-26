// E2E (owner request 26-Nov-2026): the super admin creates a company, sets it up himself and takes it from documents to interviews.
// Needs: e2e.lead temporarily a platform owner (grant before, revoke after), a synthetic folder of 1,000+ files (E2E_BULK_DIR).
// Env: BASE, E2E_PASSWORD, E2E_BULK_DIR, NODE_PATH (playwright).
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const DIR = process.env.E2E_BULK_DIR;
const results = []; const check = (n, c, d = '') => results.push(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`);
const num = (t, re) => Number((re.exec(t) || [])[1] || NaN);
(async () => {
  const b = await chromium.launch(); const errs = []; const t0 = Date.now();
  try {
    const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); p.on('pageerror', (x) => errs.push(x.message));
    await p.goto(BASE + '/login'); await p.fill('#email', 'e2e.lead@example.invalid'); await p.fill('#password', process.env.E2E_PASSWORD);
    await p.getByRole('button', { name: 'Sign in', exact: true }).click(); await p.waitForLoadState('networkidle');

    // 1 create the company, set up by the super admin himself
    const tag = Date.now().toString(36).slice(-5).toUpperCase();
    await p.goto(BASE + '/platform/companies');
    check('create form offers "I set it up myself" (default)', await p.getByTestId('who-self').isChecked());
    check('no separate administrator needed', (await p.locator('#nc-email').count()) === 0);
    await p.fill('#nc-name', `E2E Setup Test ${tag}`); await p.fill('#nc-code', `E2E-SU-${tag}`);
    await p.getByRole('button', { name: 'Create and start set-up' }).click();
    await p.waitForURL(/\/c\/[0-9a-f-]+\/setup/, { timeout: 60000 });
    const co = /\/c\/([0-9a-f-]+)\/setup/.exec(p.url())[1];
    check('lands on the set-up guide of the new company as its administrator', /Set up E2E Setup Test/.test(await p.locator('h1').innerText()));
    check('"Set-up guide" is in the company menu', (await p.getByRole('link', { name: 'Set-up guide' }).count()) >= 1);

    // 2 details
    await p.fill('#p-legal_name', `E2E Setup Test ${tag} Pvt Ltd`); await p.fill('#p-cin', 'U74999MH2005PTC000001'); await p.fill('#p-industry', 'Verification services (synthetic)');
    await p.fill('#p-locations', 'Pan India (synthetic)'); await p.fill('#p-employees', '250');
    await p.getByRole('button', { name: 'Save details' }).click(); await p.waitForURL(/ok=/);
    check('company details saved', /Company details saved/.test(await p.locator('body').innerText()) && (await p.inputValue('#p-cin')) === 'U74999MH2005PTC000001');
    check('step 1 marked done', /Done/.test(await p.getByTestId('step-details').locator('h2').innerText()));

    // 3 checklist
    const use = p.getByTestId('step-checklist').getByRole('button', { name: 'Use this checklist' });
    if (await use.count()) { await use.first().click(); await p.waitForURL(/ok=/); await p.waitForLoadState('networkidle'); }
    const cl = await p.getByTestId('step-checklist').innerText();
    check('audit checklist adopted', /documents the company should have/.test(cl), cl.replace(/\s+/g, ' ').slice(0, 160));

    // 4 Google Drive option present (shows set-up note or the link box)
    await p.getByTestId('pick-drive').click();
    check('Google Drive import offered', (await p.getByTestId('drive-setup').count()) + (await p.locator('#drive-link').count()) === 1);

    // 5 bulk folder (1,000+ files)
    const t1 = Date.now();
    await p.getByTestId('pick-folder').setInputFiles(DIR);
    await p.getByTestId('intake-progress').getByText('Done. Rule documents are now queued').waitFor({ timeout: 20 * 60 * 1000 });
    const counts = await p.getByTestId('intake-counts').innerText();
    const total = num(counts, /of (\d+)\s+files/), added = num(counts, /(\d+) new/), dup = num(counts, /(\d+) already in/);
    check('1,000+ files processed in one go', total >= 1000, `${counts.replace(/\s+/g, ' ')} in ${Math.round((Date.now() - t1) / 1000)} s`);
    check('exact duplicate recognised', dup >= 1);
    const probText = (await p.getByTestId('intake-progress').textContent()) || '';
    check('old .doc rule document reported as unreadable', /Old Gratuity Policy\.doc/.test(probText));
    await p.goto(`${BASE}/c/${co}/setup`);
    const docStep = await p.getByTestId('step-documents').innerText();
    check('set-up guide counts every file (past the 1,000-row page size)', num(docStep, /(\d+) files in so far/) === added && added === total - dup, docStep.split('\n')[1]?.slice(0, 160));
    await p.goto(`${BASE}/c/${co}/documents?cat=record#list`);
    check('file list pages through large folders', (await p.getByTestId('doc-pages').count()) === 1, (await p.getByTestId('doc-pages').innerText().catch(() => '')).trim());
    await p.goto(`${BASE}/c/${co}/documents?cat=record&q=MIS#list`);
    check('file search works', /Monthly MIS/.test(await p.getByTestId('doc-list').innerText()));

    // 6 people import
    await p.goto(`${BASE}/c/${co}/setup#people`);
    await p.fill('#people-list', `Name, E-mail, Job title, Department\nHema HR ${tag}, e2e.hr.${tag.toLowerCase()}@example.invalid, Head of HR, HR\nOm Ops ${tag}, e2e.ops.${tag.toLowerCase()}@example.invalid, Operations Head, OPS\nbad line without email`);
    await p.getByRole('button', { name: 'Add these people' }).click();
    await p.getByTestId('people-result').waitFor({ timeout: 60000 });
    const pr = await p.getByTestId('people-result').innerText();
    check('people list imported (2 added, 1 flagged)', /2 added/.test(pr) && /1 need attention/.test(pr), pr.split('\n')[0]);
    check('temporary passwords shown once in the result', (await p.getByTestId('people-result').locator('td.mono').filter({ hasNotText: '—' }).count()) === 2);

    // 7 departments + a reviewer
    await p.goto(`${BASE}/c/${co}/setup#reviewers`);
    const mk = p.getByTestId('step-reviewers').getByRole('button', { name: 'Create these departments' });
    if (await mk.count()) { await mk.click(); await p.waitForURL(/ok=/); }
    await p.goto(`${BASE}/c/${co}/documents#stakeholders`);
    const hr = p.getByTestId('stake-form-HR');
    const opt = hr.locator('select[name="membership_id"] option', { hasText: `Hema HR ${tag}` });
    await hr.locator('select[name="membership_id"]').selectOption(await opt.getAttribute('value'));
    await hr.getByRole('button', { name: /Add/ }).click(); await p.waitForTimeout(3000);
    await p.goto(`${BASE}/c/${co}/setup#reviewers`);
    check('reviewer named for HR', /1 reviewers named/.test(await p.getByTestId('step-interviews').innerText()));

    // 8 interviews
    await p.getByRole('button', { name: /Start the reviewers/ }).click(); await p.waitForURL(/ok=/);
    check('reviewer interviews started from the set-up guide', /1 reviewer interview started/.test(await p.locator('body').innerText()));

    // 9 open an existing company
    await p.goto(BASE + '/platform/companies?test=1');
    await p.getByTestId('open-E2E-SYNTH').click(); await p.waitForURL(/\/setup/, { timeout: 60000 });
    check('"Open & set up" takes the super admin into an existing company', /Set up/.test(await p.locator('h1').innerText()));
    console.log(`company ${co} code E2E-SU-${tag}`);
    check('no browser errors', errs.length === 0, errs.join(' | ').slice(0, 200));
  } catch (e) { check('no crash', false, String(e.message).slice(0, 300)); }
  finally { await b.close(); console.log(results.join('\n')); console.log(`total ${Math.round((Date.now() - t0) / 1000)} s`); }
})();
